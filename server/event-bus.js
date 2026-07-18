// ════════════════════════════════════════════════════════════════════
// event-bus — SSE fan-out for agent Events, one bus PER USER
//
// Each user gets their own bus (lazily created) so Events from one user's
// session never stream to another user's SSE connection. A bus is otherwise
// identical to the old singleton: transport-aware (SSE), session-ignorant.
//
// Interface (per bus):
//   attach(res)            open an SSE connection (headers + keepalive)
//   detach(res)            drop the subscriber + clear its keepalive
//   push(type, data)       fan-out to every attached client of THIS user
//   send(res, type, data)  deliver to one client (connect snapshot)
//   bind(session)          subscribe a SDK session's Events to push (idempotent)
// ════════════════════════════════════════════════════════════════════

function createBus() {
  const clients = new Map() // res → keepalive interval
  let unsubscribe = null
  let boundSession = null

  function writeSse(res, type, data) {
    if (!clients.has(res)) return
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      detach(res) // dead connection — prune + clear its keepalive
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
    if (session === boundSession) return // idempotent
    if (unsubscribe) { try { unsubscribe() } catch {} unsubscribe = null }
    boundSession = session
    if (session) unsubscribe = session.subscribe((event) => push(event.type, event))
  }

  return { attach, detach, push, send, bind }
}

const ANON = '_local'
const buses = new Map() // user → bus

/** Get (lazily creating) the bus for a user. null/missing → shared '_local'. */
export function getBus(user) {
  const key = user || ANON
  let b = buses.get(key)
  if (!b) { b = createBus(); buses.set(key, b) }
  return b
}
