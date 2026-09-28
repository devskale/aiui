# Session JSONL — record shapes

Die gespeicherten Sessions (`workspace/<slug>/sessions/<timestamp>_<id>.jsonl`,
eine JSON-Zeile pro Record) sind beim Debuggen die Quelle der Wahrheit —
Replay und E2E-Inspektion lesen sie. Record-Shapes (SDK-Store, v3):

```
{"type":"session","version":3,"id":"…","timestamp":"…","cwd":"…"}
{"type":"model_change","id":"…","parentId":"…","provider":"…","modelId":"…"}
{"type":"thinking_level_change", …}
{"type":"message","id":"…","parentId":"…","timestamp":"…","message":{ … }}
```

## `message`-Records (das eigentliche Fleisch)

`message.role` ∈ `system | user | assistant | toolResult`.

- **assistant** — `message.content` ist ein Array mit **camelCase**-Typen
  (nicht `tool_call`!):
  ```json
  [
    {"type":"thinking","thinking":"…"},
    {"type":"text","text":"…"},
    {"type":"toolCall","id":"chatcmpl-tool-…","name":"bash","arguments":{"command":"…"}}
  ]
  ```
- **toolResult** — eine *eigene Message*, nicht ein Content-Item; die
  Verknüpfung läuft über `toolCallId` auf Message-Ebene:
  ```json
  {"role":"toolResult","toolCallId":"chatcmpl-tool-…","toolName":"bash",
   "content":[{"type":"text","text":"…"}],"isError":false}
  ```
- **user** — `content` Array oder String; Attachments als Content-Items.

## Debug-Rezept

Letzte Assistant-Antwort + ihre Tool-Ergebnisse extrahieren:

```js
const lines = fs.readFileSync(sessPath, 'utf8').trim().split('\n')
const calls = {}                     // toolCallId → command
for (const l of lines) {
  const m = JSON.parse(l).message
  if (!m) continue
  if (m.role === 'assistant')
    for (const c of m.content || [])
      if (c.type === 'toolCall') calls[c.id] = c.arguments?.command || ''
  if (m.role === 'toolResult')
    console.log(m.isError ? 'ERR' : 'OK ', calls[m.toolCallId], '→',
      (m.content || []).map(x => x.text || '').join('').slice(0, 200))
}
```

Auf lubu liegen die Sessions unter
`~/code/webuis/aiui/workspace/<slug>/sessions/` — scp eine Datei lokal und
parse hier, statt remote One-liner zu iterieren.
