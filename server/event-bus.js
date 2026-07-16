// ════════════════════════════════════════════════════════════════════
// event-bus — SSE fan-out sink for agent Events
//
// One module singleton: delivers Events to every connected SSE client.
// Transport-aware (SSE), session-ignorant. The session lifecycle module
// binds itself here on create/switch (W1: direct import); HTTP routes push
// status updates and attach/detach connections; the connect snapshot is
// driven by the /api/events handler via `send`.
//
// Narrow interface (the test surface):
//   attach(res)            open an SSE connection (headers + keepalive)
//   detach(res)            drop the subscriber + clear its keepalive
//   push(type, data)       fan-out to every attached client
//   send(res, type, data)  deliver to one client (connect snapshot)
//   bind(session)          subscribe a SDK session's Events to push (idempotent)
//
// Rich implementation (all hidden behind the interface): SSE framing,
// per-connection keepalive, dead-subscriber pruning on write failure,
// previous-session unsubscribe tracking.
// ════════════════════════════════════════════════════════════════════

// res → keepalive interval
const clients = new Map()

let unsubscribe = null
let boundSession = null

function writeSse(res, type, data) {
  if (!clients.has(res)) return
  try {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch {
    // connection is dead — prune it (and its keepalive)
    detach(res)
  }
}

function attach(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('\n')
  const keepalive = setInterval(() => {
    if (!clients.has(res)) return
    try { res.write(': keepalive\n\n') }
    catch { detach(res) }
  }, 30000)
  clients.set(res, keepalive)
}

function detach(res) {
  const keepalive = clients.get(res)
  if (keepalive) clearInterval(keepalive)
  clients.delete(res)
}

function push(type, data) {
  // snapshot keys: writeSse may detach (mutate) a dead client mid-fan-out
  for (const res of [...clients.keys()]) writeSse(res, type, data)
}

function send(res, type, data) {
  writeSse(res, type, data)
}

function bind(session) {
  if (session === boundSession) return            // idempotent
  if (unsubscribe) { try { unsubscribe() } catch {} unsubscribe = null }
  boundSession = session
  if (session) unsubscribe = session.subscribe((event) => push(event.type, event))
}

export const bus = { attach, detach, push, send, bind }
