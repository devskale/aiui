// ════════════════════════════════════════════════════════════════════
// AskCard — das UI des ask-Tools (pi-pocket choice-card pattern).
//
// Das Modell ruft `ask` mit 1–4 Fragen; der Run PAUSIERT bis zur Antwort.
// Jede Frage: Choices → Buttons (einfach klicken = antworten), sonst
// Freitext-Eingabe. Absenden → POST /api/ask/answer → das Tool resolves,
// die Karte verschwindet (reducer 'ask_clear').
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { apiUrl } from '../lib/api'

export function AskCard({ ask, dispatch }) {
  const [answers, setAnswers] = useState(() => ask.questions.map(() => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const complete = ask.questions.every((_, i) => answers[i]?.trim())

  const answer = async (i, value) => {
    const next = answers.map((a, j) => (j === i ? value : a))
    // Ein-Klick-Antwort, wenn alle Fragen Choices haben und alle beantwortet sind
    if (ask.questions.every(q => Array.isArray(q.choices) && q.choices.length) && next.every(a => a.trim())) {
      submit(next)
      return
    }
    setAnswers(next)
  }

  const submit = async (final = answers) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(apiUrl('/api/ask/answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ask.id, answers: final.map(a => a.trim()) }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ())).error || 'failed')
      dispatch({ type: 'ask_clear', id: ask.id })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="ask-card" role="dialog" aria-label="The agent asks a question">
      <div className="ask-head">The agent asks<span className="ask-dot" /></div>
      {ask.questions.map((q, i) => (
        <div key={i} className="ask-q">
          <div className="ask-q-text">{q.question}</div>
          {Array.isArray(q.choices) && q.choices.length > 0 ? (
            <div className="ask-choices">
              {q.choices.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`ask-choice ${answers[i] === c ? 'picked' : ''}`}
                  disabled={busy}
                  onClick={() => answer(i, c)}
                >{c}</button>
              ))}
            </div>
          ) : (
            <div className="ask-freetext">
              <textarea
                rows={2}
                value={answers[i]}
                placeholder="Your answer…"
                disabled={busy}
                onChange={e => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
              />
            </div>
          )}
        </div>
      ))}
      {error && <div className="ask-error">{error}</div>}
      {/* Submit nur nötig, wenn Freitext-Fragen dabei sind (Choices-only
          antwortet per Klick, s.o.) */}
      {!ask.questions.every(q => Array.isArray(q.choices) && q.choices.length) && (
        <button
          type="button"
          className="ask-submit"
          disabled={busy || !complete}
          onClick={() => submit()}
        >{busy ? 'Sending…' : 'Answer'}</button>
      )}
    </div>
  )
}
