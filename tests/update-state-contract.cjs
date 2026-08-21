const assert = require('assert');
const { UPDATE_STATES, normalizeProgress, isOfflineError, releaseNotesText } = require('../electron/update-state.cjs');

assert.strictEqual(UPDATE_STATES.READY_TO_INSTALL, 'READY TO INSTALL');
assert.deepStrictEqual(normalizeProgress({ percent: 140, transferred: 20, total: 10, bytesPerSecond: -2 }), {
  percent: 100,
  transferred: 10,
  total: 10,
  bytesPerSecond: 0
});
assert.strictEqual(isOfflineError(new Error('getaddrinfo ENOTFOUND updates.emx.example')), true);
assert.strictEqual(isOfflineError(new Error('invalid YAML update metadata')), false);
assert.strictEqual(releaseNotesText([{ note: 'First note' }, { note: 'Second note' }]), 'First note\n\nSecond note');

console.log('EMX UPDATE STATE CONTRACT: PASS');
