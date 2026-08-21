const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const packageJson = require('../package.json');

const projectRoot = path.join(__dirname, '..');
const updateBaseUrl = String(process.env.EMX_UPDATE_BASE_URL || '').trim().replace(/\/+$/, '');
const allowInsecureLocalUpdateTest = process.env.EMX_ALLOW_INSECURE_LOCAL_UPDATE_TEST === '1';
const isLoopbackHttp = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(updateBaseUrl);
if (updateBaseUrl && !/^https:\/\//i.test(updateBaseUrl) && !(allowInsecureLocalUpdateTest && isLoopbackHttp)) {
  throw new Error('EMX_UPDATE_BASE_URL must be HTTPS. HTTP is allowed only for an explicit loopback smoke test.');
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: false,
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed with exit code ${result.status}.`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function removeStaleUpdateMetadata(releaseDir) {
  for (const name of fs.readdirSync(releaseDir)) {
    if (/^latest.*\.yml$/i.test(name)) fs.rmSync(path.join(releaseDir, name), { force: true });
  }
}

function writeChecksums(releaseDir, includeUpdateMetadata) {
  const files = fs.readdirSync(releaseDir)
    .filter(name => (name.includes(`-${packageJson.version}-`) && /\.(exe|blockmap)$/i.test(name)) || (includeUpdateMetadata && /^latest.*\.yml$/i.test(name)))
    .sort();
  const rows = files.map(name => `${sha256(path.join(releaseDir, name))}  ${name}`);
  fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), `${rows.join('\n')}\n`, 'utf8');
  return files;
}

run(process.execPath, ['scripts/prepare-native.cjs']);
run(process.execPath, ['--check', 'src/main.js']);
run(process.execPath, ['--check', 'electron/main.cjs']);
run(process.execPath, ['--check', 'electron/preload.cjs']);
run(process.execPath, ['--check', 'electron/exporter.cjs']);
run(process.execPath, ['--check', 'electron/export-paths.cjs']);
run(process.execPath, ['--check', 'electron/branding.cjs']);
run(process.execPath, ['--check', 'electron/update-state.cjs']);
run(process.execPath, ['--check', 'electron/updater.cjs']);
run(process.execPath, ['tests/timeline-math-smoke.mjs']);
run(process.execPath, ['tests/selection-smoke.mjs']);
run(process.execPath, ['tests/playback-session-smoke.mjs']);
run(process.execPath, ['tests/scrub-session-smoke.mjs']);
run(process.execPath, ['tests/effect-render-smoke.cjs']);
run(process.execPath, ['tests/export-paths-smoke.cjs']);
run(process.execPath, ['tests/watermark-contract.cjs']);
run(process.execPath, ['tests/import-workflow-contract.cjs']);
run(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), ['tests/desktop-media-protocol-smoke.cjs']);
run(process.execPath, ['tests/visual-editing-contract.cjs']);
run(process.execPath, ['tests/update-state-contract.cjs']);
run(process.execPath, ['tests/update-service-contract.cjs']);
run(process.execPath, ['tests/ui-contract-smoke.mjs']);
run(process.execPath, ['tests/audio-ai-contract.cjs']);
run(process.execPath, ['tests/friend-runtime-contract.cjs']);
run(process.execPath, ['tests/native-engine-smoke.cjs']);
run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']);
run(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), ['tests/renderer-runtime-smoke.cjs']);

const builderCli = path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
run(process.execPath, [builderCli, '--win', 'nsis', '--config', 'electron-builder.config.cjs', '--publish', 'never']);

const releaseDir = path.join(projectRoot, 'release');
if (!updateBaseUrl) removeStaleUpdateMetadata(releaseDir);
const artifacts = writeChecksums(releaseDir, Boolean(updateBaseUrl));
if (updateBaseUrl && !artifacts.some(name => /^latest.*\.yml$/i.test(name))) {
  throw new Error('Update-enabled build did not produce latest.yml metadata.');
}

console.log(`EMX Windows release complete. Update feed: ${updateBaseUrl || 'not configured'}`);
console.log(`Checksums: ${path.join(releaseDir, 'SHA256SUMS.txt')}`);
