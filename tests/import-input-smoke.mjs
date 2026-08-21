import assert from 'node:assert/strict';
import { normalizeImportInput } from '../src/lib/importInput.js';

const isTestFile = candidate => Boolean(candidate?.__testFile);

const desktop = normalizeImportInput({
  mediaToken: 'trusted-token',
  nativePath: 'C:\\Clips\\match.mp4',
  name: 'match.mp4',
  mime: 'video/mp4',
  url: 'emx-media://local/trusted-token'
}, isTestFile);
assert.equal(desktop.file, null);
assert.equal(desktop.isDesktopDescriptor, true);
assert.equal(desktop.mime, 'video/mp4');
assert.equal(desktop.url, 'emx-media://local/trusted-token');

const file = { __testFile: true, name: 'voice.wav', type: 'audio/wav' };
const browser = normalizeImportInput(file, isTestFile);
assert.equal(browser.file, file);
assert.equal(browser.isDesktopDescriptor, false);
assert.equal(browser.mime, 'audio/wav');
assert.equal(browser.name, 'voice.wav');

const wrappedBrowser = normalizeImportInput({ file, nativePath: 'C:\\Clips\\voice.wav' }, isTestFile);
assert.equal(wrappedBrowser.file, file);
assert.equal(wrappedBrowser.nativePath, 'C:\\Clips\\voice.wav');

console.log('EMX IMPORT INPUT SMOKE: PASS');
