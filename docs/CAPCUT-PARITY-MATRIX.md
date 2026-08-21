# CapCut-Style Workflow Parity Matrix

This is a factual implementation tracker for the V1.8 roadmap, not marketing copy. “Available” means connected to the running Electron app; “planned” is not a release promise.

| Workflow area | Status in 1.8.2 stability foundation | Evidence / next integration boundary |
| --- | --- | --- |
| Dense media browser | Available | Resources Media/Audio tabs, search/sort, display modes, thumbnail sizing, context actions, Ctrl/Shift multi-select, and safe batch project removal. |
| Folder import choice | Available | A selected folder can import all supported direct children now or become the saved default directory for later selective multi-file import. |
| Native MP4 export | Available | Main-process FFmpeg export plus FFprobe validation. |
| Permanent brand watermark | Available | Fixed main-process asset; position/opacity only; no custom logo/text/upload controls; opacity is clamped to 50%–100% in renderer and main process. |
| In-app update status | Available when an HTTPS build feed is configured | `electron-updater` generic feed, manual download/install UX, version/progress/state reporting. |
| Automatic checks | Available for update-enabled installed builds | Starts after launch; dev/feedless builds visibly remain Offline. |
| One video + one audio lane | Available | Timeline click selection is now reconciled through render/edit operations. Ctrl/Shift selects multiple clips for batch deletion and batch speed/volume/fade updates. |
| Multiple video/audio tracks | Planned | Requires project schema migration, track UI, z-order compositor, and regression coverage. |
| Layer compositing | Planned | Depends on multi-track render graph. |
| Clip transform and crop | Planned | Requires normalized transform schema and live preview/export parity. |
| Keyframes | Planned | Requires per-property timeline interpolation. |
| Text/caption system | Planned | Requires project persistence, typography UI, preview and FFmpeg rendering. |
| Effect rack and adjustment stack | Partially available | Existing global effect controls remain; per-clip rack/stack is planned. |
| Audio gain/fades/speed | Available | Existing timeline/export controls. |
| Audio waveform / automation | Planned | Requires cached analysis and curve data in project storage. |
| Voice effects / beat sync | Planned | Requires Audio AI effect chain and beat-analysis cache. |
| Project save/open/autosave | Planned | Current timeline is session-memory state; no project files are represented as persistent yet. |
| Crash recovery / restore point | Planned | Depends on a validated project serializer. |
| Presets/templates | Planned | Requires persisted versioned project schema and asset packaging policy. |
| H.264/H.265 export profiles | Planned | Current native MP4 path is verified; profile UI and hardware capability reporting are not represented yet. |
| Captions/transcripts | Planned | Requires local inference/provider policy and editable caption data. |
| Proxy cache | Planned | Requires explicit cache/cleanup policy and project linking. |

## Quality gates before calling a later milestone complete

1. Add project serialization/migration tests before persisting new timeline state.
2. Validate preview and exported pixels/audio against the same project settings.
3. Add error, cancellation, recovery, missing-media, and reopen coverage.
4. Rebuild the NSIS installer and test the installed build, not only the Vite page.
5. Keep the permanent EMX watermark invariant in all export paths.
