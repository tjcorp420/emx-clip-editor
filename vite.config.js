import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The displayed version is injected from package.json at build time. Hand-edited
// version strings silently drifted from the packaged version on past releases.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __EMX_APP_VERSION__: JSON.stringify(version) }
});
