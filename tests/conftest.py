"""Shared test fixtures for AIUI backend tests."""
import json
import sqlite3
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Ensure project root is on sys.path so `server.app` resolves
PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

# ── In-memory DB fixture ──────────────────────────────────────

DB_SCHEMA = """
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
    updated_at REAL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    created_at REAL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    folder_id TEXT,
    path TEXT,
    created_at REAL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at REAL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO accounts (id, name, base_url, api_key, models)
    VALUES ('default', 'Default', 'https://fake-llm.test/v1', 'test-key', '["test-model"]');
"""


@pytest.fixture(autouse=True)
def _override_db(tmp_path, monkeypatch):
    """Redirect the app's DB to a temp file with the schema, per test."""
    import server.app as app_mod

    db_file = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_file))
    conn.executescript(DB_SCHEMA)
    conn.close()

    monkeypatch.setattr(app_mod, "DB_PATH", db_file)
    yield db_file


@pytest_asyncio.fixture
async def client():
    """httpx AsyncClient wired to the FastAPI app."""
    from server.app import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Helpers ───────────────────────────────────────────────────

def make_llm_response(content="Hello!", tool_calls=None, finish_reason="stop"):
    """Build a fake non-streaming LLM response (OpenAI format)."""
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {
        "id": "chatcmpl-fake",
        "object": "chat.completion",
        "choices": [{"index": 0, "message": msg, "finish_reason": finish_reason}],
    }


def make_tool_call(call_id, name, arguments):
    """Build a single tool_calls entry."""
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }
