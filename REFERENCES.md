# References & Inspirations

Projects, templates, and prior art that informed πui's design. Add to this
list as you come across more.

## Cloned & analyzed (in `../inspirations/`)

- [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template) — shadcn chatbot template.
- [agegr/pi-web](https://github.com/agegr/pi-web) — web UI for the pi coding agent.
- [minghinmatthewlam/pi-gui](https://github.com/minghinmatthewlam/pi-gui) — GUI for the pi coding agent.
- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness.git) — DeepSeek coding agent harness.
- [xing-shuyin/pi-web-ui](https://github.com/xing-shuyin/pi-web-ui) — official pi-web-ui (npm `pi-web-ui`). Browser cockpit, React 19 + Express + WS.
- [jmfederico/pi-web](https://github.com/jmfederico/pi-web) — PI WEB. Persistent server-side workspaces, `sessiond`, remote machines.
- [rjaskonis/pi-feats](https://github.com/rjaskonis/pi-feats) — Profiles, Nono sandboxing, guardrails, HTTP API, Pi Console WebUI.
- [valtterimelkko/pi-web-ui](https://github.com/valtterimelkko/pi-web-ui) — self-hosted multi-runtime web UI (Pi + Claude Code + OpenCode + Antigravity).
- [deflating/tau](https://github.com/deflating/tau) — web UI as a pi extension (sidecar, no separate server).
- [TannerMidd/pi-pocket](https://github.com/TannerMidd/pi-pocket) — multiplayer, mobile-first web app on **Pi Durable**; runs survive restarts. Closest product sibling. See `compare-pi-pocket.md`.
- [versot/vagus-pi-web](https://github.com/versot/vagus-pi-web) — web GUI sharing `~/.pi/agent` config; usage stats, tool-call cards.

## Analysis docs (in `../inspirations/`)

- [`inspirations.md`](inspirations.md) — deep review of the five reference repos (incl. pi-pocket).
- [`compare-pi-pocket.md`](compare-pi-pocket.md) — **πui vs pi-pocket compare matrix** (2026-10-15): capabilities, security, engineering, verdict. πui's moat = sandboxed multi-user; pocket's = durability + product surface.
- [`findings.md`](findings.md) — 4 core research findings, with dates & refs (2026-10-01).
- [`bestof.md`](bestof.md) — grounded best-of ranking (GitHub stars + trendability + web-search).

## Best-of ranking (2026-10-01)

Weighted: community 30% · trendability 25% · maturity 25% · πui-relevance 20%. See `inspirations/bestof.md` for the full scoring model and per-project metric tables.

| Rank | Project | Bestness | ★ | Relevanz für πui |
|---|---|---|---|---|
| 🥇 | agegr/pi-web | 9.3 | 6993 | praktische Vorlage (Architektur, Security, getestete Libs) |
| 🥈 | xing-shuyin/pi-web-ui | 8.8 | 260 | Feature-/UX-Vorlage (Plugins, Subagents, Token-Meter) |
| 🥉 | jmfederico/pi-web | 8.5 | 832 | Multi-User/Persistenz — engster Verwandter |
| 4 | rjaskonis/pi-feats | 7.4 | 0 | Sandbox/Confinement-Referenz |
| 5 | valtterimelkko/pi-web-ui | 6.9 | 0 | Multi-Runtime (nur falls Ziel) |
| 6 | deflating/tau | 6.2 | 356 | Sidecar-Architektur |
| 7 | versot/vagus-pi-web | 5.5 | ~4 | Usage-Stats |
| 8 | Zetaphor/pi-webui | 4.8 | 14 | LiteLLM-Gateway (veraltet) |
| 9 | ddallabenetta/omp-web | 4.5 | 68 | oh-my-pi-Fork |
| 10 | xuzhixiangya/pi-web-ui | 4.0 | 0 | Remote-Control (veraltet) |

**Kernaussage:** Für πui relevant sind v. a. agegr/pi-web (praktisch), xing-shuyin/pi-web-ui (Features/UX) und jmfederico/pi-web (Multi-User/Persistenz). pi-feats ist die beste Sandbox-Referenz; valtterimelkko nur, falls Multi-Runtime ein Ziel wird.
