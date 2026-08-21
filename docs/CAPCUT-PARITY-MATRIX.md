# CapCut-Style Workflow Parity Matrix

This is a factual implementation tracker for the V1.10 roadmap, not marketing copy. “Available” means connected to the running Electron app; “planned” is not a release promise.

| Workflow area | Status in 1.10.0 visual-editing foundation | Evidence / next integration boundary |
| --- | --- | --- |
| Dense media browser | Available | Resources Media/Audio tabs, search/sort, display modes, thumbnail sizing, context actions, Ctrl/Shift multi-select, and safe batch project removal. |
| Folder import choice | Available | A selected folder can import all supported direct children now or become the saved default directory for later selective multi-file import. Native Electron descriptors are normalized before browser-only File operations, preserving trusted native export paths. |
| Native MP4 export | Available | Main-process FFmpeg export plus FFprobe validation. |
| Permanent brand watermark | Available | Fixed main-process asset; position/opacity only; no custom logo/text/upload controls; opacity is clamped to 50%–100% in renderer and main process. |
| In-app update status | Available when an HTTPS build feed is configured | `electron-updater` generic feed, manual download/install UX, version/progress/state reporting. |
| Automatic checks | Available for update-enabled installed builds | Starts after launch; dev/feedless builds visibly remain Offline. |
| Video, audio, and image overlay lanes | Available | Timeline click selection is reconciled through render/edit operations. Ctrl/Shift selects multiple clips for batch deletion and batch speed/volume/fade updates; the OVERLAYS lane supports timed image clips. |
| Multiple video/audio tracks | Planned | Requires project schema migration, track UI, z-order compositor, and regression coverage. |
| Layer compositing | Partially available | Timed image overlays have position, opacity, scale, preview compositing, and FFmpeg export compositing. Multi-video z-order compositing remains planned. |
| Clip transform and crop | Partially available | Image overlays expose normalized position/scale/opacity. Video crop, rotation, and keyframed transform remain planned. |
| Keyframes | Planned | Requires per-property timeline interpolation. |
| Text/caption system | Planned | Requires project persistence, typography UI, preview and FFmpeg rendering. |
| Effect rack and adjustment stack | Available for a curated first library | Searchable Effects and Filters browsers apply named clip looks plus brightness, contrast, saturation, hue, blur, and vignette. Preview and native FFmpeg export use the same visual data. Dynamic/masked effects, body effects, keyframes, and downloadable packs remain planned. |
| Video transitions | Available for four native transition types | Dissolve, Dip to Black, Slide Left, and Slide Right are applied between adjacent clips. The preview and FFmpeg graph use the same transition data; advanced wipes, 3D transitions, and transition packs remain planned. |
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
