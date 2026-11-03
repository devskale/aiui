// tool-fields — tool-call args als Tabelle rendern, NUR wenn ALLE Argumente
// flache Primitives sind. Jedes verschachtelte Objekt/Array → null → der
// Aufrufer zeigt den JSON-View. Die All-or-Nothing-Regel ist der ganze Punkt
// (Muster aus pi-web lib/tool-fields.ts): kein Per-Tool-Config, kein
// stillschweigend abgeschnittener Teilbaum — eine Tabelle, die nur zeigt,
// was sie vollständig zeigen kann.
export function argRows(args) {
  if (!args || typeof args !== 'object') return null
  const entries = Object.entries(args)
  if (!entries.length) return null
  const flat = entries.every(([, v]) =>
    v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
  if (!flat) return null
  return entries.map(([key, value]) => ({ key, value: value === null ? 'null' : String(value) }))
}
