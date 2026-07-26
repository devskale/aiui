import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { resolveBashOutputPath } from './bash-output.js'

const TMP = os.tmpdir()

test('resolveBashOutputPath: accepts a valid pi-bash log in the temp dir', () => {
  const p = resolveBashOutputPath(path.join(TMP, 'pi-bash-abc-XYZ_123.log'))
  assert.equal(p, path.resolve(path.join(TMP, 'pi-bash-abc-XYZ_123.log')))
})

test('resolveBashOutputPath: rejects wrong name', () => {
  assert.equal(resolveBashOutputPath('/etc/passwd'), null)
  assert.equal(resolveBashOutputPath(path.join(TMP, 'arbitrary.log')), null)
  assert.equal(resolveBashOutputPath(path.join(TMP, 'pi-bash-')), null) // missing suffix
  assert.equal(resolveBashOutputPath(path.join(TMP, 'pi-bash-x.txt')), null) // wrong ext
})

test('resolveBashOutputPath: rejects paths outside the temp dir', () => {
  assert.equal(resolveBashOutputPath('/etc/pi-bash-abc.log'), null)
  assert.equal(resolveBashOutputPath(path.join(os.homedir(), 'pi-bash-abc.log')), null)
})

test('resolveBashOutputPath: rejects non-string / empty', () => {
  assert.equal(resolveBashOutputPath(undefined), null)
  assert.equal(resolveBashOutputPath(''), null)
  assert.equal(resolveBashOutputPath(123), null)
})

test('resolveBashOutputPath: rejects traversal escapes via .. (resolved before check)', () => {
  assert.equal(resolveBashOutputPath('../../etc/pi-bash-x.log'), null)
})
