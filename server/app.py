"""
AIUI — Ultra-minimal backend
SQLite + file storage + folders. Run with: uv run uvicorn server.app:app
"""

import json
import logging
import os
import re
import sqlite3
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('data/logs/app.log'),
    ],
)
log = logging.getLogger('aiui')

# ─── Config ──────────────────────────────────────────────
PROJECT_DIR = Path(__file__).resolve().parent.parent  # aiui/
DATA_DIR = PROJECT_DIR / "data"
FILES_DIR = DATA_DIR / "files"
DB_PATH = DATA_DIR / "aiui.db"
PORT = 8099

DATA_DIR.mkdir(exist_ok=True)
FILES_DIR.mkdir(exist_ok=True)

DEFAULT_ACCOUNTS = [
    {
        "id": "default",
        "name": "Default",
        "base_url": "https://amd1.mooo.com:8123/v1",
        "api_key": "test23@test34",
        "models": ["tu@qwen-3.6-35b", "tu@qwen-3.5-397b"],
    },
]

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
ALLOWED_FILE_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf", "text/plain", "text/markdown"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB per file
MAX_STORAGE_MB = 500

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── DB Helper ───────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '[]',
            created_at REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            model TEXT NOT NULL DEFAULT '',
            title TEXT DEFAULT 'New Chat',
            created_at REAL DEFAULT (unixepoch()),
            updated_at REAL DEFAULT (unixepoch()),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user','assistant','system','error')),
            content TEXT NOT NULL,
            created_at REAL DEFAULT (unixepoch()),
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            icon TEXT DEFAULT '📁',
            color TEXT DEFAULT '#888',
            sort_order INTEGER DEFAULT 0,
            created_at REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            original_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            path TEXT NOT NULL,
            folder_id TEXT,
            created_at REAL DEFAULT (unixepoch()),
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );
    """)
    # Seed default accounts if empty
    row = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    if row == 0:
        for acc in DEFAULT_ACCOUNTS:
            conn.execute(
                "INSERT INTO accounts (id, name, base_url, api_key, models) VALUES (?, ?, ?, ?, ?)",
                (acc["id"], acc["name"], acc["base_url"], acc["api_key"], json.dumps(acc.get("models", []))),
            )
    # Seed default folders if empty
    fcount = conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0]
    if fcount == 0:
        defaults = [("📚 Library", "📚", "#7c5dfa"), ("📄 Documents", "📄", "#f59e0b"), ("🖼️ Images", "🖼️", "#10b981")]
        for name, icon, color in defaults:
            fid = uuid.uuid4().hex[:8]
            conn.execute("INSERT INTO folders (id, name, icon, color) VALUES (?, ?, ?, ?)", (fid, name, icon, color))

    # ── Migrations ──
    def _migrate(conn):
        # accounts: old 'model' column → new 'models' JSON column
        try:
            cols = [r[1] for r in conn.execute("PRAGMA table_info(accounts)").fetchall()]
            if "model" in cols and "models" not in cols:
                rows = conn.execute("SELECT id, model FROM accounts").fetchall()
                conn.execute("ALTER TABLE accounts ADD COLUMN models TEXT NOT NULL DEFAULT '[]'")
                for rid, old_model in rows:
                    models_json = json.dumps([old_model] if old_model else [])
                    conn.execute("UPDATE accounts SET models = ? WHERE id = ?", (models_json, rid))
        except Exception as e:
            print(f"Migration warning (accounts): {e}")

        # chats: add 'model' column if missing
        try:
            cols = [r[1] for r in conn.execute("PRAGMA table_info(chats)").fetchall()]
            if "model" not in cols:
                conn.execute("ALTER TABLE chats ADD COLUMN model TEXT NOT NULL DEFAULT ''")
        except Exception as e:
            print(f"Migration warning (chats): {e}")

    _migrate(conn)

    conn.commit()
    conn.close()


init_db()


# ─── Helpers ─────────────────────────────────────────────
def _storage_bytes():
    """Total bytes used by all files on disk."""
    total = 0
    for p in FILES_DIR.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def _store_file(contents: bytes, original_name: str, mime_type: str, folder_id: str | None = None) -> dict:
    """Write file to disk and record in DB. Returns file dict."""
    file_id = uuid.uuid4().hex[:16]
    ext = Path(original_name).suffix or ".bin"

    # Store in folder subdirectory if folder given
    if folder_id:
        dir_path = FILES_DIR / folder_id
        dir_path.mkdir(exist_ok=True)
    else:
        dir_path = FILES_DIR

    stored_path = dir_path / f"{file_id}{ext}"
    stored_path.write_bytes(contents)

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO files (id, original_name, mime_type, size_bytes, path, folder_id) VALUES (?, ?, ?, ?, ?, ?)",
            (file_id, original_name, mime_type, len(contents), stored_path.name, folder_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": file_id,
        "url": f"/api/files/{file_id}",
        "original_name": original_name,
        "mime_type": mime_type,
        "size_bytes": len(contents),
        "folder_id": folder_id,
    }


# ══════════════════════════════════════════════════════════════
# ACCOUNTS
# ══════════════════════════════════════════════════════════════
@app.get("/api/accounts")
def list_accounts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM accounts ORDER BY name").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("models"), str):
            try:
                d["models"] = json.loads(d["models"])
            except:
                d["models"] = []
        result.append(d)
    return result


@app.put("/api/accounts")
def save_accounts(accounts: list[dict]):
    conn = get_db()
    conn.execute("DELETE FROM accounts")
    for acc in accounts:
        conn.execute(
            "INSERT INTO accounts (id, name, base_url, api_key, models) VALUES (?, ?, ?, ?, ?)",
            (acc.get("id", str(uuid.uuid4())[:8]), acc.get("name", ""), acc.get("base_url", ""),
             acc.get("api_key", ""), json.dumps(acc.get("models", []))),
        )
    conn.commit()
    conn.close()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# CHATS
# ══════════════════════════════════════════════════════════════
@app.get("/api/chats")
def list_chats(account_id: str | None = Query(None)):
    conn = get_db()
    if account_id:
        rows = conn.execute("SELECT * FROM chats WHERE account_id = ? ORDER BY updated_at DESC", (account_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM chats ORDER BY updated_at DESC").fetchall()
    result = []
    for r in rows:
        chat = dict(r)
        msgs = conn.execute("SELECT role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC", (r["id"],)).fetchall()
        chat["messages"] = [dict(m) for m in msgs]
        result.append(chat)
    conn.close()
    return result


@app.post("/api/chats")
def create_chat(account_id: str = "default", model: str = "", title: str = "New Chat"):
    chat_id = uuid.uuid4().hex[:12]
    now = time.time()
    conn = get_db()
    conn.execute("INSERT INTO chats (id, account_id, model, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                 (chat_id, account_id, model or "", title, now, now))
    conn.commit()
    conn.close()
    return {"id": chat_id, "title": title}


@app.get("/api/chats/{chat_id}")
def get_chat(chat_id: str):
    conn = get_db()
    r = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if not r:
        conn.close(); return JSONResponse(status_code=404, content={"error": "not found"})
    chat = dict(r)
    msgs = conn.execute("SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC", (chat_id,)).fetchall()
    chat["messages"] = [dict(m) for m in msgs]
    conn.close()
    return chat


@app.put("/api/chats/{chat_id}")
def update_chat(chat_id: str, data: dict):
    conn = get_db()
    existing = conn.execute("SELECT id FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if not existing:
        conn.close(); return JSONResponse(status_code=404, content={"error": "not found"})
    updates = ["updated_at = ?"]
    vals = [time.time()]
    if "title" in data:
        updates.append("title = ?"); vals.append(data["title"])
    if "messages" in data:
        conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
        for msg in data["messages"]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, (list, dict)):
                content = json.dumps(content)
            conn.execute("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)", (chat_id, role, content))
    vals.append(chat_id)
    conn.execute(f"UPDATE chats SET {', '.join(updates)} WHERE id = ?", vals)
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str):
    conn = get_db()
    conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# FOLDERS
# ══════════════════════════════════════════════════════════════
@app.get("/api/folders")
def list_folders():
    """List all folders with file counts."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM folders ORDER BY sort_order, name").fetchall()
    result = []
    for r in rows:
        f = dict(r)
        count = conn.execute("SELECT COUNT(*) FROM files WHERE folder_id = ?", (r["id"],)).fetchone()[0]
        size = conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE folder_id = ?", (r["id"],)).fetchone()[0]
        f["file_count"] = count
        f["total_size"] = size
        result.append(f)
    # Add unsorted count
    unsorted_count = conn.execute("SELECT COUNT(*) FROM files WHERE folder_id IS NULL").fetchone()[0]
    unsorted_size = conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE folder_id IS NULL").fetchone()[0]
    result.append({"id": None, "name": "Unsorted", "icon": "📥", "color": "#666", "file_count": unsorted_count, "total_size": unsorted_size})
    conn.close()
    return result


@app.post("/api/folders")
def create_folder(name: str = "New Folder", icon: str = "📁", color: str = "#888"):
    fid = uuid.uuid4().hex[:8]
    conn = get_db()
    try:
        conn.execute("INSERT INTO folders (id, name, icon, color) VALUES (?, ?, ?, ?)", (fid, name, icon, color))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close(); return JSONResponse(status_code=409, content={"error": "Folder name already exists"})
    conn.close()
    return {"id": fid, "name": name, "icon": icon, "color": color}


@app.put("/api/folders/{folder_id}")
def update_folder(folder_id: str, data: dict):
    conn = get_db()
    existing = conn.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone()
    if not existing:
        conn.close(); return JSONResponse(status_code=404, content={"error": "Folder not found"})
    sets = []
    vals = []
    if "name" in data:
        sets.append("name = ?"); vals.append(data["name"])
    if "icon" in data:
        sets.append("icon = ?"); vals.append(data["icon"])
    if "color" in data:
        sets.append("color = ?"); vals.append(data["color"])
    if "sort_order" in data:
        sets.append("sort_order = ?"); vals.append(data["sort_order"])
    if sets:
        vals.append(folder_id)
        conn.execute(f"UPDATE folders SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/folders/{folder_id}")
def delete_folder(folder_id: str):
    """Delete a folder. Files inside become unsorted (folder_id = NULL)."""
    conn = get_db()
    conn.execute("UPDATE files SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
    conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# FILES — Upload, Serve, Manage
# ══════════════════════════════════════════════════════════════
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), folder_id: str | None = Query(None)):
    """Upload image/PDF/txt/md → store on disk → return file info."""
    if folder_id == "":
        folder_id = None
    mime = file.content_type or ""
    if mime not in ALLOWED_FILE_TYPES:
        return JSONResponse(status_code=400, content={"error": f"Type not allowed: {mime}"})
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        return JSONResponse(status_code=400, content={"error": f"File too large ({len(contents)} bytes)"})
    result = _store_file(contents, file.filename or "upload", mime, folder_id)
    return result


@app.post("/api/upload/batch")
async def upload_batch(files: list[UploadFile] = File(...), folder_id: str | None = Query(None)):
    """Multi-file upload. Returns array of results."""
    results = []
    for file in files:
        mime = file.content_type or ""
        if mime not in ALLOWED_FILE_TYPES:
            results.append({"error": f"{file.filename}: type not allowed ({mime})"}); continue
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            results.append({"error": f"{file.filename}: too large ({len(contents)} bytes)"}); continue
        try:
            info = _store_file(contents, file.filename or "upload", mime, folder_id)
            results.append(info)
        except Exception as e:
            results.append({"error": f"{file.filename}: {e}"})
    return {"results": results, "uploaded": sum(1 for r in results if "id" in r), "failed": sum(1 for r in results if "error" in r)}


@app.post("/api/folders/{folder_id}/upload")
async def upload_to_folder(folder_id: str, file: UploadFile = File(...)):
    """Upload a file into a specific folder."""
    # Validate folder exists
    conn = get_db()
    fldr = conn.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone()
    conn.close()
    if not fldr:
        return JSONResponse(status_code=404, content={"error": "Folder not found"})
    mime = file.content_type or ""
    if mime not in ALLOWED_FILE_TYPES:
        return JSONResponse(status_code=400, content={"error": f"Type not allowed: {mime}"})
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        return JSONResponse(status_code=400, content={"error": "File too large"})
    result = _store_file(contents, file.filename or "upload", mime, folder_id)
    return result


@app.get("/api/files/{file_id}")
def serve_file(file_id: str):
    """Serve an uploaded file by ID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    if not row:
        return JSONResponse(status_code=404, content={"error": "not found"})
    path = FILES_DIR
    # Search in root and subdirectories
    for candidate in list(FILES_DIR.rglob("*")):
        if candidate.is_file() and candidate.stem == file_id:
            path = candidate; break
    else:
        # Fallback: check stored path
        fallback = FILES_DIR / row["path"]
        if fallback.exists(): path = fallback
        else: return JSONResponse(status_code=404, content={"error": "file missing from disk"})
    return FileResponse(path, media_type=row["mime_type"], filename=row["original_name"])


@app.put("/api/files/{file_id}")
def update_file(file_id: str, data: dict):
    """Move file to different folder or rename."""
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        conn.close(); return JSONResponse(status_code=404, content={"error": "File not found"})

    if "folder_id" in data:
        new_fid = data["folder_id"]
        if new_fid is not None:
            # Validate target folder exists
            fldr = conn.execute("SELECT id FROM folders WHERE id = ?", (new_fid,)).fetchone()
            if not fldr:
                conn.close(); return JSONResponse(status_code=404, content={"error": "Target folder not found"})
        conn.execute("UPDATE files SET folder_id = ? WHERE id = ?", (new_fid, file_id))

    if "original_name" in data:
        conn.execute("UPDATE files SET original_name = ? WHERE id = ?", (data["original_name"], file_id))

    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    """Delete a file from DB and disk."""
    conn = get_db()
    row = conn.execute("SELECT path FROM files WHERE id = ?", (file_id,)).fetchone()
    if row:
        # Find and delete actual file
        for candidate in list(FILES_DIR.rglob("*")):
            if candidate.is_file() and candidate.stem == file_id:
                candidate.unlink(); break
        else:
            fallback = FILES_DIR / row["path"]
            if fallback.exists(): fallback.unlink()
    conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# LIBRARY — Browse/Search all files
# ══════════════════════════════════════════════════════════════
@app.get("/api/library")
def list_library(folder_id: str | None = Query(None), type_filter: str | None = Query(None),
               sort_by: str = Query("created_at"), sort_dir: str = Query("desc"),
               limit: int = Query(50), offset: int = Query(0)):
    """Browse files with filtering, sorting, pagination."""
    conn = get_db()

    where = ["1=1"]
    params = []

    if folder_id is not None:
        where.append("folder_id = ?"); params.append(folder_id)

    if type_filter:
        if type_filter == "image":
            where.append("mime_type LIKE 'image/%'")
        elif type_filter == "document":
            where.append("mime_type IN ('application/pdf','text/plain','text/markdown')")

    order_map = {"name": "original_name", "size": "size_bytes", "date": "created_at", "type": "mime_type"}
    col = order_map.get(sort_by, "created_at")
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    query = f"SELECT f.*, fo.name as folder_name, fo.icon as folder_icon FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id WHERE {' AND '.join(where)} ORDER BY f.{col} {direction} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = conn.execute(query, params).fetchall()
    total = conn.execute(f"SELECT COUNT(*) FROM files f WHERE {' AND '.join(where)}", params[:-2]).fetchone()[0]

    result = [dict(r) for r in rows]
    conn.close()
    return {"files": result, "total": total, "limit": limit, "offset": offset}


@app.get("/api/library/search")
def search_library(q: str = Query(..., min_length=1), limit: int = Query(20)):
    """Fuzzy search files by filename for #autocomplete."""
    conn = get_db()
    pattern = f"%{q}%"
    rows = conn.execute(
        "SELECT f.*, fo.name as folder_name, fo.icon as folder_icon FROM files f "
        "LEFT JOIN folders fo ON f.folder_id = fo.id "
        "WHERE f.original_name LIKE ? "
        "ORDER BY CASE WHEN f.original_name LIKE ? THEN 0 ELSE 1 END, f.created_at DESC "
        "LIMIT ?",
        (pattern, f"{q}%", limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ══════════════════════════════════════════════════════════════
# STORAGE STATS
# ══════════════════════════════════════════════════════════════
@app.get("/api/storage")
def storage_stats():
    used = _storage_bytes()
    max_bytes = MAX_STORAGE_MB * 1024 * 1024
    conn = get_db()
    file_count = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    folder_count = conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0]
    conn.close()
    return {
        "used_bytes": used,
        "max_bytes": max_bytes,
        "used_mb": round(used / 1024 / 1024, 1),
        "max_mb": MAX_STORAGE_MB,
        "percent": round(used / max_bytes * 100, 1) if max_bytes > 0 else 0,
        "file_count": file_count,
        "folder_count": folder_count,
    }


# ══════════════════════════════════════════════════════════════
# PDF EXTRACTION
# ══════════════════════════════════════════════════════════════
@app.post("/api/extract-pdf")
async def extract_pdf_text(file: UploadFile = File(...)):
    try:
        import pdfplumber
    except ImportError:
        return JSONResponse(status_code=500, content={"error": "pdfplumber not installed"})
    contents = await file.read()
    text_parts = []
    try:
        import io
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    if i > 0: text_parts.append("\n---\n")
                    text_parts.append(page_text)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"PDF extraction failed: {e}"})
    full_text = "\n".join(text_parts).strip()
    if not full_text:
        return JSONResponse(status_code=422, content={"text": "", "warning": "No extractable text. Scanned PDF?"})
    return {"text": full_text, "chars": len(full_text), "estimated_tokens": round(len(full_text) / 4)}


# ══════════════════════════════════════════════════════════════
# RESOLVE #REFERENCES in message text
# ══════════════════════════════════════════════════════════════
@app.post("/api/resolve-references")
def resolve_references(data: dict):
    """
    Given message text containing #filename references,
    resolve them to enriched multimodal content.
    Input: { "text": "Compare #doc-a.pdf and #doc-b.pdf" }
    Output: { "content": [multimodal array], "resolved": ["doc-a.pdf", ...], "missing": [...] }
    """
    text = data.get("text", "")
    refs = re.findall(r'#([^\s#]+)', text)
    resolved = []
    missing = []
    content_blocks = []

    # Text before/after/between refs
    parts = re.split(r'#[^\s#]+', text)
    ref_iter = iter(refs)

    # Build content: interleave text parts with resolved file references
    for i, part in enumerate(parts):
        if part.strip():
            content_blocks.append({"type": "text", "text": part.strip()})
        ref_name = next(ref_iter, None)
        if ref_name:
            ref_name_clean = ref_name.strip()
            conn = get_db()
            row = conn.execute(
                "SELECT * FROM files WHERE original_name LIKE ? OR id = ? LIMIT 1",
                (f"%{ref_name_clean}%", ref_name_clean.replace('#', '')),
            ).fetchone()
            conn.close()
            if row:
                file_dict = dict(row)
                resolved.append(file_dict["original_name"])

                # Resolve file based on type
                file_path = None
                for candidate in list(FILES_DIR.rglob("*")):
                    if candidate.is_file() and candidate.stem == file_dict["id"]:
                        file_path = candidate; break
                else:
                    fp = FILES_DIR / file_dict["path"]
                    if fp.exists(): file_path = fp

                if file_path and file_dict["mime_type"].startswith("image/"):
                    b64 = file_path.read_bytes().decode("latin-1")  # raw bytes for frontend to encode
                    import base64
                    b64data = base64.b64encode(file_path.read_bytes()).decode()
                    content_blocks.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{file_dict['mime_type']};base64,{b64data}"},
                        "ref_name": file_dict["original_name"],
                    })
                elif file_path and file_dict["mime_type"] == "application/pdf":
                    try:
                        import pdfplumber, io as _io
                        pdf_text = ""
                        with pdfplumber.open(str(file_path)) as pdf:
                            for page in pdf.pages:
                                pt = page.extract_text()
                                if pt: pdf_text += pt + "\n"
                        content_blocks.append({
                            "type": "text",
                            "text": f"[📄 {file_dict['original_name']}]\n{pdf_text.strip()}",
                            "ref_name": file_dict["original_name"],
                        })
                    except Exception as e:
                        content_blocks.append({
                            "type": "text",
                            "text": f"[⚠️ {file_dict['original_name']}] Could not extract: {e}",
                            "ref_name": file_dict["original_name"],
                        })
                elif file_path:
                    txt = file_path.read_text(errors="replace")
                    content_blocks.append({
                        "type": "text",
                        "text": f"[📝 {file_dict['original_name']}]\n{txt}",
                        "ref_name": file_dict["original_name"],
                    })
                else:
                    content_blocks.append({
                        "type": "text",
                        "text": f"[⚠️ {ref_name_clean}] File not found on disk",
                        "ref_name": ref_name_clean,
                    })
                    missing.append(ref_name_clean)
            else:
                missing.append(ref_name_clean)
                content_blocks.append({
                    "type": "text",
                    "text": f"[⚠️ #{ref_name_clean}] Not found in library",
                    "ref_name": ref_name_clean,
                })

    # If no blocks at all (just plain text with no refs), return simple text
    if not content_blocks and text.strip():
        content_blocks = [{"type": "text", "text": text}]
    elif not content_blocks:
        content_blocks = [{"type": "text", "text": text}]

    return {"content": content_blocks, "resolved": resolved, "missing": missing}


# ══════════════════════════════════════════════════════════════
# TOOL DEFINITIONS & EXECUTION
# ══════════════════════════════════════════════════════════════

SEARXNG_URL = os.getenv("SEARXNG_URL", "https://neusiedl.duckdns.org:8002@searxng@searxng23")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read content from an uploaded file in the library. Use to read PDFs, text files, or documents the user has uploaded.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {"type": "string", "description": "File UUID or filename to read"},
                    "start": {"type": "integer", "default": 0, "description": "Start character offset (0-indexed)"},
                    "length": {"type": "integer", "default": 5000, "description": "Max characters to read"}
                },
                "required": ["file_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Returns titles, URLs, and snippets from search results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "count": {"type": "integer", "default": 8, "description": "Number of results (1-20)"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch and extract readable text content from a URL. Works on articles, docs, GitHub, news sites, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to fetch and extract text from"},
                    "max_length": {"type": "integer", "default": 10000, "description": "Max characters to return"}
                },
                "required": ["url"]
            }
        }
    }
]


async def execute_tool(name: str, args: dict) -> dict:
    """Execute a tool call and return result."""
    try:
        if name == "read_file":
            return await _tool_read_file(args)
        elif name == "web_search":
            return await _tool_web_search(args)
        elif name == "fetch_url":
            return await _tool_fetch_url(args)
        else:
            return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        return {"error": str(e)}


async def _tool_read_file(args: dict) -> dict:
    file_id = args.get("file_id", "").strip()
    start = max(0, int(args.get("start", 0)))
    length = min(50000, max(100, int(args.get("length", 5000))))

    conn = get_db()
    # Try by ID first, then by name
    row = conn.execute("SELECT * FROM files WHERE id=? OR original_name=? LIMIT 1", (file_id, file_id)).fetchone()
    if not row:
        conn.close()
        return {"error": f"File not found: {file_id}"}

    fpath = FILES_DIR / row["path"] if row["path"] else None
    mime = row["mime_type"]
    fname = row["original_name"]
    conn.close()

    if not fpath or not fpath.exists():
        return {"error": f"File missing on disk: {fname}"}

    # Read based on type
    if mime.startswith("image/"):
        import base64
        data = fpath.read_bytes()
        b64 = base64.b64encode(data).decode()
        preview = f"[Image: {fname}, {len(data)} bytes, {fpath.stat().st_size} size]"
        # Return truncated base64 for vision context
        if len(b64) > 200000:
            b64 = b64[:200000] + "..."
        return {"content": preview, "data_uri": f"data:{mime};base64,{b64}", "filename": fname, "size_bytes": len(data)}

    elif mime == "application/pdf":
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(fpath) as pdf:
                full_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            total = len(full_text)
            chunk = full_text[start:start+length]
            return {"content": chunk, "filename": fname, "total_chars": total, "range": f"{start}-{min(start+length, total)}"}
        except ImportError:
            return {"error": "pdfplumber not installed"}

    else:  # txt, md, etc.
        raw = fpath.read_text(errors="replace")
        total = len(raw)
        chunk = raw[start:start+length]
        return {"content": chunk, "filename": fname, "total_chars": total, "range": f"{start}-{min(start+length, total)}"}


async def _tool_web_search(args: dict) -> dict:
    query = args.get("query", "").strip()
    count = min(20, max(1, int(args.get("count", 8))))
    if not query:
        return {"error": "query is required"}

    # Parse auth from URL (format: scheme://host:port@user@pass)
    search_url = SEARXNG_URL
    auth = None
    if "@" in search_url:
        parts = search_url.split("@")
        if len(parts) >= 3:
            search_url = parts[0]
            auth = (parts[1], parts[2])

    log.info(f"web_search: query={query!r}, url={search_url}, auth={'yes' if auth else 'no'}")

    try:
        async with httpx.AsyncClient(timeout=15, verify=False) as client:
            resp = await client.get(
                f"{search_url.rstrip('/')}/search",
                params={"q": query, "format": "json", "language": "auto"},
                auth=auth,
            )
            log.info(f"web_search: HTTP {resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])[:count]
            formatted = [
                {
                    "title": r.get("title", "").strip(),
                    "url": r.get("url", "").strip() or r.get("href", "").strip(),
                    "snippet": (r.get("content", "") or r.get("body", "")).strip()[:300],
                }
                for r in results
            ]
            log.info(f"web_search: {len(formatted)} results for {query!r}")
            return {"query": query, "results": formatted, "count": len(formatted)}
    except Exception as e:
        log.error(f"web_search failed: {e}")
        return {"error": f"Search failed: {e}"}


async def _tool_fetch_url(args: dict) -> dict:
    url = args.get("url", "").strip()
    max_len = min(100000, max(500, int(args.get("max_length", 10000))))
    if not url:
        return {"error": "url is required"}
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            html = resp.text

        # Simple HTML → text extraction (strip tags, collapse whitespace)
        import re
        # Remove script/style
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
        # Convert some useful tags to newlines
        html = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
        html = re.sub(r'</?(p|div|h[1-6]|li|tr)[^>]*>', '\n', html, flags=re.IGNORECASE)
        # Strip remaining tags
        html = re.sub(r'<[^>]+>', ' ', html)
        # Collapse whitespace
        text = re.sub(r'[ \t]+', ' ', html)
        text = re.sub(r'\n\s*\n+', '\n\n', text)
        text = text.strip()

        if len(text) > max_len:
            text = text[:max_len] + "... (truncated)"

        return {"url": url, "title": _extract_title(resp.text), "content": text, "chars_fetched": len(text)}
    except Exception as e:
        return {"error": f"Fetch failed: {e}"}


def _extract_title(html: str) -> str:
    m = re.search(r'<title[^>]*>(.*?)</title>', html, re.DOTALL | re.IGNORECASE)
    if m:
        return re.sub(r'<[^>]+>', '', m.group(1)).strip()
    return ""
@app.get("/api/models")
async def list_models(base_url: str = Query(...), api_key: str = Query("")):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/models", headers={"Authorization": f"Bearer {api_key}"})
            models = resp.json().get("data", [])
            return {"models": [m["id"] for m in models]}
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})


# ══════════════════════════════════════════════════════════════
# CHAT COMPLETIONS PROXY (Streaming + Tool Calling)
# ══════════════════════════════════════════════════════════════
@app.post("/api/chat/completions")
async def proxy_completions(request: Request):
    body = await request.json()
    base_url = body.pop("__base_url", None)
    api_key = body.pop("__api_key", None)
    web_search_requested = body.pop("__web_search", False)
    if not base_url or not api_key:
        conn = get_db()
        acc = conn.execute("SELECT base_url, api_key FROM accounts LIMIT 1").fetchone()
        conn.close()
        if acc:
            base_url = base_url or acc["base_url"]
            api_key = api_key or acc["api_key"]

    url = f"{base_url.rstrip('/')}/chat/completions"
    messages = body.get("messages", [])
    model = body.get("model", "")
    is_stream = body.get("stream", False)

    # ── Tool-calling loop ──
    max_tool_rounds = 10

    async def run_with_tools():
        """Run LLM with tools, looping until final text response."""
        msgs = list(messages)
        for round_num in range(max_tool_rounds):
            # Build request — include tools only if web search requested
            req_body = {
                "model": model,
                "messages": msgs,
                "stream": False,  # use non-streaming for tool detection
                "max_tokens": body.get("max_tokens") or 8192,
                "temperature": body.get("temperature", 0.7),
            }
            if web_search_requested:
                req_body["tools"] = TOOLS
                req_body["tool_choice"] = "auto"

            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, json=req_body,
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})

            if resp.status_code != 200:
                # LLM error — return raw error as text
                yield f"data: {json.dumps({'error': f'LLM HTTP {resp.status_code}: {resp.text[:200]}'})}\n\n"
                return

            data = resp.json()
            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "")

            # Check if LLM wants to call tools
            tool_calls = msg.get("tool_calls", [])

            if not tool_calls or finish_reason == "stop":
                # Final text response — yield it
                content = msg.get("content", "") or ""
                # Stream it character by character for nice UX
                if content:
                    # Yield as SSE chunks matching OpenAI format
                    for i in range(0, len(content), 4):  # small chunks
                        chunk = content[i:i+4]
                        delta = {"role": "assistant", "content": chunk}
                        sse = json.dumps({"id": data.get("id",""), "object": "chat.completion.chunk",
                            "created": int(time.time()), "model": model, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]})
                        yield f"data: {sse}\n\n"
                    # Final chunk
                    final_sse = json.dumps({"id": data.get("id",""), "object": "chat.completion.chunk",
                        "created": int(time.time()), "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
                    yield f"data: {final_sse}\n\n"
                else:
                    # Empty response (e.g. reasoning-only) — send minimal stop
                    stop_sse = json.dumps({"id": data.get("id",""), "object": "chat.completion.chunk",
                        "created": int(time.time()), "model": model, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
                    yield f"data: {stop_sse}\n\n"
                yield "data: [DONE]\n\n"
                return

            # ── Execute tool calls ──
            msgs.append(msg)  # assistant message with tool_calls

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"])
                except:
                    fn_args = {}

                # Emit tool status event to frontend
                status_evt = json.dumps({"type": "tool_start", "tool": fn_name, "args": fn_args})
                yield f"event: tool_status\ndata: {status_evt}\n\n"

                result = await execute_tool(fn_name, fn_args)

                # Emit tool result event
                result_evt = json.dumps({"type": "tool_result", "tool": fn_name, 
                    "ok": "error" not in result, "preview": str(result)[:200]})
                yield f"event: tool_status\ndata: {result_evt}\n\n"

                # Append tool result message
                msgs.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result, ensure_ascii=False),
                })

        # Max rounds exceeded
        yield f"data: {json.dumps({'error': 'Tool loop exceeded maximum rounds'})}\n\n"
        yield "data: [DONE]\n\n"

    async def simple_stream():
        """Passthrough stream without tools (fallback)."""
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    # Decide: use tool loop or passthrough?
    # Always try tools if model supports function calling
    use_tools = web_search_requested

    async def stream_generator():
        if use_tools and is_stream:
            async for chunk in run_with_tools():
                yield chunk
        else:
            async for chunk in simple_stream():
                yield chunk

    return StreamingResponse(stream_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ══════════════════════════════════════════════════════════════
# HEALTH & E2E
# ══════════════════════════════════════════════════════════════
@app.get("/api/health")
def health():
    return {"status": "ok", "db": str(DB_PATH), "files_dir": str(FILES_DIR)}


@app.get("/api/e2e")
async def e2e_test():
    results = {}
    try:
        conn = get_db()
        accs = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        chats = conn.execute("SELECT COUNT(*) FROM chats").fetchone()[0]
        msgs = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        folds = conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0]
        conn.close()
        results["db"] = f"OK ({accs}accts, {chats}chats, {msgs}msgs, {files}files, {folds}folders)"
    except Exception as e:
        results["db"] = f"FAIL: {e}"
    results["files_dir"] = "OK" if FILES_DIR.exists() else "MISSING"
    results["files_writable"] = "OK" if os.access(FILES_DIR, os.W_OK) else "FAIL"
    try:
        conn = get_db()
        acc = conn.execute("SELECT base_url, api_key, models FROM accounts LIMIT 1").fetchone()
        conn.close()
        if acc and acc["base_url"] and acc["api_key"]:
            models = json.loads(acc["models"] or "[]")
            model = models[0] if models else "test"
            async with httpx.AsyncClient(timeout=15) as client:
                async with client.stream("POST", f'{acc["base_url"].rstrip("/")}/chat/completions',
                    json={"model": model, "messages": [{"role":"user","content":"Say hi"}], "stream":True, "max_tokens":20},
                    headers={"Authorization": f'Bearer {acc["api_key"]}', "Content-Type":"application/json"}) as resp:
                    if resp.status_code != 200:
                        results["llm"] = f"HTTP {resp.status}"
                    else:
                        chunks = []
                        async for chunk in resp.aiter_bytes():
                            chunks.append(chunk)
                        body = b"".join(chunks).decode(errors="replace")
                        lines = [l for l in body.split("\n") if l.startswith("data: ")]
                        parts = []
                        for line in lines:
                            d = line[6:].strip()
                            if d == "[DONE]": continue
                            try:
                                j = json.loads(d); c = j.get("choices",[{}])[0].get("delta",{}).get("content","")
                                if c: parts.append(c)
                            except: pass
                        results["llm"] = f'OK → "{"".join(parts).strip()}"'
        else:
            results["llm"] = "SKIPPED"
    except Exception as e:
        results["llm"] = f"FAIL: {e}"
    results["status"] = "PASS" if all(v.startswith(("OK","SKIPPED")) for v in results.values()) else "FAIL"
    return results


# ─── Main ────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"🚀 AIUI Backend  •  http://localhost:{PORT}")
    print(f"   DB:   {DB_PATH}")
    print(f"   Files: {FILES_DIR}")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
