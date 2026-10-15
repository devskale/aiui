import test from 'node:test'
import assert from 'node:assert/strict'
import { reducedMotionFrom, prefersReducedMotion } from './motion.js'

test('reducedMotionFrom: matches=true → true', () => {
  assert.equal(reducedMotionFrom({ matches: true }), true)
})

test('reducedMotionFrom: matches=false → false', () => {
  assert.equal(reducedMotionFrom({ matches: false }), false)
})

test('reducedMotionFrom: fehlende MQL → false (kein Throw)', () => {
  assert.equal(reducedMotionFrom(null), false)
  assert.equal(reducedMotionFrom(undefined), false)
})

test('prefersReducedMotion: window ohne matchMedia → false', () => {
  assert.equal(prefersReducedMotion({}), false)
  assert.equal(prefersReducedMotion(undefined), false)
})

test('prefersReducedMotion: fragt genau die reduced-motion-Query ab', () => {
  let asked = null
  const win = { matchMedia: (q) => { asked = q; return { matches: true } } }
  assert.equal(prefersReducedMotion(win), true)
  assert.equal(asked, '(prefers-reduced-motion: reduce)')
})
