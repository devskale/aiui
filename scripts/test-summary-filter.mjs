// ════════════════════════════════════════════════════════════════════
// test-summary-filter — Pre-Commit-Filter für `pnpm test`-Output.
//
// Erfolg: nur die Summary-Zeile (tests · pass · fail · Dauer) — der Hook
// druckt sonst ~200 Zeilen Testnamen in jeden Commit-Kontext.
// FAIL (ℹ fail [1-9]): voller Output, Exit 1 (der Hook bricht ab).
// Escape-Hatch: AIUI_HOOK_VERBOSE=1 erzwingt immer vollen Output.
// ════════════════════════════════════════════════════════════════════
let out = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => { out += d })
process.stdin.on('end', () => {
  const failed = /ℹ fail [1-9]/.test(out)
  if (failed || process.env.AIUI_HOOK_VERBOSE) {
    process.stdout.write(out)
    process.exit(failed ? 1 : 0)
  }
  const lines = out.split('\n').filter((l) => /^ℹ (tests|pass|fail|duration_ms)/.test(l))
    .map((l) => l.replace(/^ℹ /, '').trim())
  console.log('  tests: ' + (lines.join(' · ') || 'ok'))
})
