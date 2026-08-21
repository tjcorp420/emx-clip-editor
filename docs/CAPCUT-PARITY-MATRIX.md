# CapCut-Style Workflow Parity Matrix

This is a factual implementation tracker for the V1.11 roadmap, not marketing copy. “Available” means connected to the running Electron app and native export; “planned” is not a release promise. The user-designated benchmark is CapCut's [9:16 TikTok web editor](https://www.capcut.com/editor?scenario=tiktok&scale=9%3A16); because it is a JavaScript application whose surface changes over time, stable capability claims are cross-checked against CapCut's official feature documentation below.

| Workflow area | Status in 1.11.3 playback/effects milestone | Evidence / next integration boundary |
| --- | --- | --- |
| Dense media browser | Available | Resources Media/Audio tabs, search/sort, display modes, thumbnail sizing, context actions, Ctrl/Shift multi-select, and safe batch project removal. |
| Folder import choice | Available | A selected folder can import all supported direct children now or become the saved default directory for later selective multi-file import. Native Electron descriptors are normalized before browser-only File operations, preserving trusted native export paths. |
| Native MP4 export | Available | Main-process FFmpeg export plus FFprobe validation. |
| Permanent brand watermark | Available | Fixed main-process asset; position/opacity only; no custom logo/text/upload controls; opacity is clamped to 50%–100% in renderer and main process. |
| In-app update status | Available when an HTTPS build feed is configured | `electron-updater` generic feed, manual download/install UX, version/progress/state reporting. |
| Automatic checks | Available for update-enabled installed builds | Starts after launch; dev/feedless builds visibly remain Offline. |
| Timeline/Resources preview handoff | Available | Selecting Resources media stops the timeline animation loop and all timeline audio, invalidates asynchronous playback work, and prevents stale timeline/media requests from reclaiming the shared preview element. |
| Clip visual framing | Available | Video clips expose 100%–300% visual zoom and normalized horizontal/vertical pan. Preview and FFmpeg export use the same stored values; timeline zoom remains independent. |
| Export destination and completion actions | Available | Save dialogs default to the dedicated Videos/EMX Clip Studio Exports folder. The completion card reports the verified file and offers Play Export and Open Export Folder. |
| Video, audio, image overlay, and effect lanes | Available | Timeline click selection is reconciled through render/edit operations. Ctrl/Shift selects multiple clips for batch deletion. PNG, JPG/JPEG, WebP, and GIF imports create timed image overlays; animated effects are independent timed clips. |
| Precise timeline interaction | Available | Trimmed clips use pointer-offset-aware drag math and can return to 0:00. The playhead is directly draggable. Right-click does not seek, and Split at Playhead preserves the editor's chosen time. |
| Freeze frame | Available | A video context action splits at the playhead, inserts a two-second held-frame clip, moves the continuation, and exports the held source frame through FFmpeg. |
| Multiple video/audio tracks | Planned | Requires project schema migration, track UI, z-order compositor, and regression coverage. |
| Layer compositing | Partially available | Timed image overlays have position, opacity, scale, preview compositing, and FFmpeg export compositing. Multi-video z-order compositing remains planned. |
| Clip transform and crop | Partially available | Image overlays expose normalized position/scale/opacity. Vertical export can center-crop or letterbox the whole canvas. Per-clip crop, rotation, subject-aware reframe, and keyframed transform remain planned. |
| Keyframes | Planned | Requires per-property timeline interpolation. |
| Text/caption system | Planned | Requires project persistence, typography UI, preview and FFmpeg rendering. |
| Timed animated effects | Available for 15 native effects | Effects are separate from filters. Sparkle, particle, negative, B&W, shake, zoom, glitch, neon, strobe, RGB, focus, flicker, nightclub, and vignette families are draggable EFFECTS-lane clips with move/trim/split/duplicate/delete support. The lane is directly below VIDEO for visibility, and preview plus FFmpeg use the same IDs and time ranges. Body/subject effects, masks, intensity controls, keyframes, and downloadable packs remain planned. |
| Scrub, transition, and fullscreen playback | Available | Scrub completion is single-owner and cancellable; Play invalidates delayed seek/audio work and rearms preview media. Structural transition edits stop the old playback loop and transition drift seeks are throttled. Fullscreen exposes Play/Pause, start, time, and scrubbing controls. |
| Static filters and color adjustment | Available for a curated library | Filters are per-source static color grades; fine controls cover brightness, contrast, saturation, hue, blur, and vignette. Per-channel HSL, curves, LUT import, wheels, and color matching remain planned. |
| Video transitions | Available for four native transition types | Dissolve, Dip to Black, Slide Left, and Slide Right are applied between adjacent clips. The preview and FFmpeg graph use the same transition data; advanced wipes, 3D transitions, and transition packs remain planned. |
| Audio gain/fades/speed | Available | Existing timeline/export controls. |
| Audio waveform / automation | Planned | Requires cached analysis and curve data in project storage. |
| Voice effects / beat sync | Planned | Requires Audio AI effect chain and beat-analysis cache. |
| Project save/open/autosave | Planned | Current timeline is session-memory state; no project files are represented as persistent yet. |
| Crash recovery / restore point | Planned | Depends on a validated project serializer. |
| Presets/templates | Planned | Requires persisted versioned project schema and asset packaging policy. |
| H.264/H.265 export profiles | Planned | Current native MP4 path is verified; profile UI and hardware capability reporting are not represented yet. |
| TikTok / Reels export | Partially available | 1080×1920, 60 FPS, CRF 20 H.264/AAC export is available with center-crop fill or letterbox. Auto reframe, safe-zone overlays, cover editing, bitrate controls, and direct publishing remain planned. |
| Captions/transcripts | Planned | Requires local inference/provider policy and editable caption data. |
| Proxy cache | Planned | Requires explicit cache/cleanup policy and project linking. |

## Current CapCut comparison baseline

The gap list is based on CapCut's current official product documentation, not visual imitation alone:

- CapCut describes effects as timeline content and separates them from filters; it also describes adjustable transition duration and drag/drop transition workflows ([effects and filters](https://www.capcut.com/tools/video-effect-and-filter), [transitions](https://www.capcut.com/tools/video-transition)).
- Its keyframe system covers position, opacity, scale, rotation, shape, and color with interpolation and speed curves ([keyframe animation](https://www.capcut.com/tools/keyframe-animation)).
- Its desktop workflow documents masks, blend modes, HSL/curves, speed curves, 9:16 sharing, 4K, bitrate, codec, and up to 60 FPS ([desktop workflow](https://www.capcut.com/resource/how-to-use-capcut)).
- Official desktop material also identifies auto reframe and auto captions, while separate official tools cover motion tracking, stabilization, and per-channel HSL grading ([desktop editor](https://www.capcut.com/tools/desktop-video-editor), [motion tracking](https://www.capcut.com/tools/motion-tracking), [stabilization](https://www.capcut.com/tools/video-stabilization), [HSL grading](https://www.capcut.com/tools/hsl-color)).

For a high-quality TikTok workflow, the highest-value remaining sequence is: editable text/captions and safe zones; per-clip crop/position/scale with keyframes; project save/autosave; speed curves and beat markers; then auto reframe, tracking, stabilization, masks, and larger effect/transition packs.

## Quality gates before calling a later milestone complete

1. Add project serialization/migration tests before persisting new timeline state.
2. Validate preview and exported pixels/audio against the same project settings.
3. Add error, cancellation, recovery, missing-media, and reopen coverage.
4. Rebuild the NSIS installer and test the installed build, not only the Vite page.
5. Keep the permanent EMX watermark invariant in all export paths.
