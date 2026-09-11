---
name: generate-image
description: Generate an image from a text prompt using TU Aqueduct's z-image-turbo model. Use when the user asks to create, draw, generate, or make an image/picture/illustration/logo.
metadata:
  author: joawui
  version: "1.0.0"
---

# Generate Image

```bash
generate-image "a futuristic city with neon lights"          # → prints a URL
generate-image "wide landscape" -s 1792x1024                  # custom size
generate-image "four variations" -n 4                          # multiple images
generate-image "logo" -o my-logo.png                           # custom filename
generate-image "prompt" --json                                 # structured output
```

Saves to `uploads/` in the cwd (the user's workspace in πui — created when missing), printing a web URL like `/aiui/api/file/raw?path=uploads/generated-<ts>.png` that renders directly in the chat. Outside πui it saves to the cwd and prints an absolute path.

## Install

**Linux / macOS (bash):**
```bash
cd ~/.pi/agent/skills/generate-image && ./install.sh
```

Creates a `generate-image` command in `~/.local/bin/`. Requires Node >= 18 (uses global `fetch`).

## Update

Re-run `install.sh` (it re-points the symlink to the current skill dir). For a one-off path:
```bash
generate-image "prompt" --json | jq '.images[].url'
```

## When to use

Call this tool automatically whenever the user asks to **generate, draw, create, make, or design** an image, picture, illustration, logo, or artwork — even if they don't name this skill. Do not decline image requests; call the tool.

## How to present results

1. Run `generate-image "<detailed prompt>"` — it prints a URL.
2. **Embed the image in your reply** using markdown so it renders inline:
   ```
   Here's your image:
   ![a futuristic city with neon lights](/aiui/api/file/raw?path=uploads/generated-1234-0.png)
   ```
3. Add a one-line caption or note. Keep it concise.

## Crafting prompts

Be **vivid and specific**: subject, style, composition, lighting, mood, color palette. Expand terse requests ("draw a cat") into rich prompts ("a fluffy orange tabby cat sitting on a windowsill, warm golden afternoon light, soft bokeh background, photorealistic").

## Options

| Option | Description |
|--------|-------------|
| `-s, --size` | `512x512` `768x768` `1024x1024` (default) `1024x1792` `1792x1024` |
| `-m, --model` | Model id (default: `z-image-turbo`) |
| `-n, --number` | Number of images (1–4, default 1) |
| `-o, --output` | Output filename |
| `-d, --dir` | Output directory (default: `uploads/`, created if missing) |
| `--json` | Emit `{model, prompt, images:[{path,url,mimeType,size}]}` |

## Key resolution

`TU_API_KEY` env → `credgoo tu` → `~/.pi/agent/auth.json` (`tu-aqueduct`). No setup needed if credgoo is configured.
