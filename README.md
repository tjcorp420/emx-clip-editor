# EMX Clip Studio 1.10.1

EMX Clip Studio is a Windows Electron timeline editor backed by private FFmpeg/FFprobe binaries. Version 1.10.1 fixes the Windows desktop-media stream path so imported MP4s can seek for thumbnails and become ready for preview playback without running Engine Self-Test.

## What is implemented in this build

- Native MP4 timeline export and audio extraction with post-render FFprobe verification.
- A dense **Resources** browser: Media/Audio tabs, file-type filters, search, sort, grid/compact/list modes, thumbnail-size control, Ctrl/Shift multi-selection, batch add/remove-from-project actions, drag to timeline, and right-click actions.
- Folder workflow: choose a folder and either import all supported files directly inside it or set it as the persistent default location opened by selective multi-file **Import Media**.
- A permanent supplied **EMX Clips** PNG watermark. Export always resolves the bundled resource in the main process; the renderer can set only one of nine positions and opacity from **50% to 100%**. The main process enforces the same lower bound.
- Timeline selection is reconciled after edits and renders. A click is no longer treated as a move; Ctrl/Shift selection supports batch clip deletion, while speed/volume/fades can be applied to the selected clip set.
- A dedicated **OVERLAYS** timeline lane supports imported PNG, JPG/JPEG, WebP, and GIF images as timed visual overlays. Each overlay has editable position, opacity, and scale, and is composited in the preview and FFmpeg MP4 export.
- The trusted desktop import bridge accepts native media descriptors without treating them as browser `File` objects. It preserves byte-range requests and supplies the required canvas-safe response header, so MP4 imports can seek for thumbnails and play in preview immediately; browser-file imports still work separately.
- Searchable **Effects** and **Filters** browsers apply real per-clip visual values that are used by both preview and FFmpeg export. The curated V1.10 library includes gaming/color looks such as Neon Pop and Night Game plus filter looks such as Cream, Cold Thrill, Bronze Film, Nature, Soft Blush, Sunny Pearl, Film Fade, and Noir. Fine controls remain available for brightness, contrast, saturation, hue, blur, and vignette.
- The **Transitions** browser can apply Dissolve, Dip to Black, Slide Left, and Slide Right between consecutive video clips. Dissolve uses alpha blending; Dip to Black uses fade-out/fade-in; slide transitions move the incoming clip in the browser preview and native FFmpeg export graph.
- An in-app **Update Center**. It reports current version, release channel, last check, signing state, release notes, progress, and only enables download/install when the installed build has a configured update feed.
- The existing automatic Friend Ready Audio AI runtime behavior.

## Important release boundaries

1. V1.10.1 is currently an **unsigned** Windows build. The Update Center reports that fact; do not describe a release as signed until code-signing has actually been configured and verified.
2. A normal local/dev build deliberately reports **Offline** in the Update Center. It does not invent an update URL.
3. This is not complete CapCut parity. V1.10 delivers a real first effects/filter/transition library, but multi-video tracks, crop/keyframes, text/captions, templates, project files/autosave, and many effect families remain explicitly tracked in [docs/CAPCUT-PARITY-MATRIX.md](docs/CAPCUT-PARITY-MATRIX.md).

## Development

Prerequisites: Windows, Node.js/npm, and network access the first time dependencies/native binaries are prepared.

```powershell
npm install
npm run dev:desktop
```

Use Electron desktop mode for native extraction/export checks; `npm run dev:web` does not expose the trusted native bridge.

## Verification

```powershell
npm run prepare:native
npm run check:js
npm run verify:timeline
npm run verify:import
npm run verify:watermark
npm run verify:update
npm run verify:ui
npm run verify:ai-contract
npm run verify:friend-runtime-contract
npm run verify:engine
npm run build:web
```

`verify:desktop-media` runs a hidden Electron window against a protected custom media URL and verifies metadata, playback, seeking, and canvas thumbnail capture. `verify:engine` creates synthetic media, exercises audio extraction, cross-fade export, a native slide-transition export, and a permanent-watermark render, then uses FFprobe/frame inspection to confirm audio/video output and visible watermark pixels.

## Windows release

For an installer without an update feed:

```powershell
npm run release:win
```

This creates the NSIS installer and `release/SHA256SUMS.txt`. The primary distribution batch files also use the same Electron Builder configuration so the app/package identity stays aligned.

### Enable the real generic HTTPS update feed

The public update host must already exist and use HTTPS. Do not put a URL into the renderer or ship a placeholder URL.

```powershell
$env:EMX_UPDATE_BASE_URL = 'https://github.com/tjcorp420/emx-clip-editor/releases/latest/download'
$env:EMX_UPDATE_CHANNEL = 'latest' # optional
npm run release:win
```

Publish the produced installer, `.blockmap`, `latest.yml` (or channel YAML), and `SHA256SUMS.txt` to that exact HTTPS base URL. Install the previous NSIS release, then verify: Check for Updates → update available → Download Update → verified download → Install & Restart. Keep the server metadata/artifacts immutable after publishing.

The feed URL is build-time configuration in `app-update.yml`; the renderer cannot change it. The app sets `autoDownload=false` and only restarts through Electron Updater after its `update-downloaded` event.

For a local automated installer-update smoke test only, `EMX_ALLOW_INSECURE_LOCAL_UPDATE_TEST=1` permits `http://127.0.0.1:<port>` or `http://localhost:<port>`. It cannot enable arbitrary HTTP destinations and must never be used for a distributed build.

## Supplied watermark asset handling

`build/branding/EMXCLIPSWATERMARK-original.png` preserves the supplied source asset. `build/branding/EMXCLIPSWATERMARK-render.png` is a lossless pixel crop of that image’s transparent canvas for practical preview/export sizing; it is not a substituted logo. Both resources are embedded beside the packaged application, and the export IPC always chooses the render asset itself.

## Output

Release artifacts are written to `release/`. Native FFmpeg/FFprobe and permanent branding resources are copied into the installed app’s `resources/` directory; end users do not need to configure them.
