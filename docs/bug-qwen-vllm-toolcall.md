# Bug: `qwen-3.6-35b-vllm` emittiert Tool-Calls als Text statt als `tool_calls`

**Status:** reproduziert (3 Läufe, 1 Defekt + 1 Zweitbefund) · **Re-Probe 2026-10-10: Defekt bestätigt, plain-Modell ebenfalls betroffen**
**Schwere:** hoch — Agent-Loops schlagen unsichtbar fehl
**Aufgetreten:** 2026-10-10, aiui/pi-Session
**Betroffener Pfad:** `unii`-Provider → `https://uniinfer.skale.dev/v1` → Modell `tu@qwen-3.6-35b-vllm`

---

## 1. Symptom

Das Modell gibt eine **Textantwort** zurück, in der der Tool-Call als Prosa steht,
anstatt eines strukturierten `tool_calls`-Eintrags. Für einen Agenten bedeutet das:
der User sieht eine plausible Antwort, aber **es läuft kein Tool**.

Defekter Response (Auszug):

```json
{
  "choices": [{
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "content": "\n\ncalculator(expr=\"2+2\")",
      "tool_calls": null
    }
  }]
}
```

Erwartet gewesen wäre:

```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "message": {
      "role": "assistant",
      "content": "",
      "tool_calls": [{
        "id": "call_…",
        "type": "function",
        "function": { "name": "calculator", "arguments": "{\"expr\": \"2+2\"}" }
      }]
    }
  }]
}
```

**Zweitbefund (zweite Failure-Mode, gleicher Request):** `finish_reason: "length"`
mit **leerem** `content` und keinen `tool_calls` — die Antwort bricht vor dem
Tool-Call ab. Beide Male bei `max_tokens: 512–1024`, also kein hartes Limit.

## 2. Häufigkeit

Minimal-Sonde, 3 Läufe, identischer Prompt:

| Lauf | `finish_reason` | `tool_calls` | `content` |
|---|---|---|---|
| 1 | `stop` | – | `'\n\ncalculator(expr="2+2")'` ← **Defekt** |
| 2 | `stop` | – | `'2+2 equals 4.'` (Round-Trip ok) |
| 3 | `stop` | – | `'The result of 2+2 is 4.'` (Round-Trip ok) |

→ **1 von 3** defekt. Dazu ein separater Erstlauf mit `finish=length` + leerem
`content` (nicht in den 3 Läufen enthalten).

**Nicht-deterministisch** — derselbe Request, unterschiedliches Ergebnis.

**Re-Probe 2026-10-10** (`packages/uniinfer/testsuite/toolcall_probe.py`, 10 Läufe,
gleicher Prompt, non-stream):

| Modell | Defekt | Form |
|---|---|---|
| `qwen-3.6-35b` | **1/10** | Call als JSON-Text im content (`{"call": {"function": "cal…`) |
| `qwen-3.6-35b-vllm` | **2/10** | `finish=length` + leerer content (Abbruch vor dem Call) |

→ Der Defekt ist **nicht** `-vllm`-spezifisch: das plain-Modell leakt ebenfalls,
nur in einer anderen Form.

## 3. Kontrollgruppe: das Schwester-Modell ist sauber

Gleicher Endpoint, gleicher Auth, gleicher Prompt, 3 Läufe:

| Modell | Tool-Call sauber | Round-Trip (Result verarbeitet) |
|---|---|---|
| `tu@qwen-3.6-35b` | **3/3** | **3/3** |
| `tu@qwen-3.6-35b-vllm` | 2/3 | 2/3 |

⚠️ **Korrigiert durch die 10-Läufe-Re-Probe (§2):** bei n=3 ist „plain = sauber"
kein belastbarer Befund — mit einer echten Rate von ~1/10 sieht 3× sauber wie
Gesundheit aus. Beide Varianten sind intermittierend betroffen; `-vllm` vs.
plain ist damit **kein** verlässlicher Auswahl-Schalter mehr.

Damit ist der Defekt **modell-/backend-spezifisch**, kein Problem von
Auth, Endpoint, Request-Format oder Client.

## 4. Metadata-Befund: `capabilities.tool_call` ist hier wertlos

In `~/.pi/agent/models.json` steht:

| Modell | deklariert `capabilities.tool_call` | reales Verhalten |
|---|---|---|
| `tu@qwen-3.6-35b` | `false` | ⚠️ 1/10 defekt (JSON-Leak) |
| `tu@qwen-3.6-35b-vllm` | `true` | ⚠️ 2/10 defekt (empty-length) |

**Die Deklaration ist invertiert.** Zusätzlich: das pi-SDK verwirft das Feld
beim Normalisieren komplett — `ModelRuntime.getAllModels()` liefert Objekte mit
den Keys `id, name, api, provider, baseUrl, reasoning, thinkingLevelMap, input,
inputLimits, cost, promptCache, contextWindow, maxTokens, samplingParams,
samplingParamsByThinkingLevel, headers, compat`. `capabilities` existiert am
laufenden Objekt **nicht**.

→ Die Deklaration ist kosmetisch (blendet nichts aus, blockiert nichts), aber
sie ist **irreführend**: wer sich auf sie verlässt, wählt das schlechtere Modell.

## 5. Reproduction

Selbstständig lauffähig, kein pi, kein aiui nötig. Key liegt in
`~/.pi/agent/auth.json` unter `unii`.

```python
import json, os, urllib.request

auth = json.load(open(os.path.expanduser('~/.pi/agent/auth.json')))
key = auth['unii']['key']
url = "https://uniinfer.skale.dev/v1/chat/completions"

TOOLS = [{
  "type": "function",
  "function": {
    "name": "calculator",
    "description": "Calculate a math expression",
    "parameters": {"type": "object", "properties": {"expr": {"type": "string"}},
                   "required": ["expr"]}
  }
}]

def run(model, runs=3):
    for i in range(runs):
        body = {"model": model,
                "messages": [{"role": "user", "content": "What is 2+2? Use the calculator tool."}],
                "tools": TOOLS, "max_tokens": 1024}
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {key}"}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = json.load(r)
        m = resp["choices"][0]["message"]
        tcs = m.get("tool_calls") or []
        print(f"{model} run{i+1}: finish={resp['choices'][0]['finish_reason']} "
              f"tool_calls={len(tcs)} content={(m.get('content') or '')[:70]!r}")

run("tu@qwen-3.6-35b")
run("tu@qwen-3.6-35b-vllm")
```

**Defekt-Kriterium:** `finish_reason == "stop"` (nicht `"tool_calls"`) **und**
`content` enthält ein Muster wie `\w+\(.*\)` — ein Funktionsaufruf in Prosa —
oder ein JSON-Objekt wie `{"call": {"function": …}}` (ebenfalls ein Leak).
Zweitbefund: `finish_reason == "length"` mit leerem `content` und keinen
`tool_calls` (Abbruch vor dem Call).

## 6. Einordnung / Verdachtsfläche

Die Failure-Mode „Tool-Call landet im `content`-Feld" ist eine **bekannte
Bug-Klasse bei vLLM-artigen Serving-Stacks**: der Server erzeugt den Call als
rohen Text und der Tool-Call-Parser hebt ihn nicht in ein strukturiertes
`tool_calls`-Feld. Referenz: derselbe Fehler wurde upstream bei StepFun
dokumentiert — [stepfun-ai/Step-3.5-Flash#7](https://github.com/stepfun-ai/Step-3.5-Flash/issues/7):
„An update to our service resulted in an issue regarding the parsing of
tool_calls", behoben am 3. Februar als serverseitiges Parsing-Problem.

Der Modellname `-vllm` legt nahe, dass dieser Eintrag über ein **anderes
Serving-Backend** läuft als das plain-Modell (TU Aqueduct, `tu@`-Prefix) —
wahrscheinlich genau die Stelle, an der der Parser fehlt oder anders konfiguriert ist.

**Zu klärende Fragen an die Betreiber:**
1. Läuft `qwen-3.6-35b-vllm` auf einem anderen Backend/Parser als `qwen-3.6-35b`?
2. Ist der Tool-Call-Parser dort aktiv, aber die strukturierte Ausgabe
   (`tool_calls`-Feld) deaktiviert oder anders gefüllt?
3. Erklärt `finish_reason: "length"` mit leerem `content` einen zweiten,
   separaten Defekt (Abbruch vor dem Call)?
4. Kann `capabilities.tool_call` in `models.json` korrekt gesetzt werden —
   aktuell invertiert?

## 7. Workaround (bereits aktiv)

aiui pinnt `unii@tu@qwen-3.6-35b` (ohne `-vllm`) als Agent-Default — nach
Datenlage 3/3 sauber. Kontext: `docs/adr/0007-model-catalog-drift.md`.

**2026-10-10 Update:** das Pin ist nach der Re-Probe **kein belastbarer Schutz**
mehr — das plain-Modell leakt in 1/10 Läufen ebenfalls. Verbleibende Optionen:
(a) höhere `max_tokens` (die empty-length-Defekte traten bei 512 auf, bei 1024
keiner mehr in 15 Läufen), (b) Retry im Agent-Loop bei JSON-Leak im content,
(c) Modell für agentische Tasks meiden, bis das Aqueduct-Backend den Parser fixt.

## 8. Tooling (2026-10-10)

`packages/uniinfer/testsuite/toolcall_probe.py` (neues Tier `tools` in
`testsuite/run.sh`) reproduziert alle Failure-Modes wiederholbar:

```bash
cd packages/uniinfer
PROXY_URL=https://uniinfer.skale.dev/v1 PROXY_AUTH=<key> \
  MODELS=tu@qwen-3.6-35b,tu@qwen-3.6-35b-vllm RUNS=15 ./testsuite/run.sh tools
```

Der Probe erkennt: `prose_call` (Call als Text/JSON im content), `empty_length`
(finish=length, leer), `re_call` / `ignored_result` / `hallucinated`
(Result-Feedback-Loop, Sentinel-Wert-Trick). Single-Shot-Checks
(`test_models.py`) können eine 1-in-10-Rate nicht sehen — genau daran ist die
ursprüngliche Diagnose fast gescheitert.
