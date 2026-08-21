EMX CLIP STUDIO V1.7.2 — DESKTOP BUILD

TEST:
  RUN-DESKTOP-DEV.bat

VERIFY ALL BUILD/ENGINE CHECKS:
  VERIFY-PROJECT.bat

BUILD EXE + INSTALLER:
  BUILD-DESKTOP-EXE.bat

OUTPUT:
  release\

IMPORTANT:
- V1.7.2 extraction/export use native FFmpeg + FFprobe through Electron.
- RUN-DESKTOP-DEV.bat uses that same desktop backend.
- A normal browser-only Vite session does NOT have the native bridge.
- BUILD-DESKTOP-EXE.bat runs the native engine smoke test before packaging.
- Packaged EXE launches without a CMD window.


V1.7.2 CAPCUT-LIKE CORE EDITING PASS
- Timeline clip selection no longer rebuilds the DOM during a pointer gesture.
  This fixes the root cause that broke dragging and edge-trimming.
- Drag a clip body freely to move/rearrange it.
- Drag the left/right edge handles to trim visually.
- Right-clicking a clip moves the playhead to the clicked point and opens:
  Split Here, Trim Start, Trim End, Duplicate, Separate Audio, Mute, Delete.
- Ctrl+B and S split at the current playhead.
- Adding a clip no longer auto-plays. It shows the frame and leaves Play in a valid state.
- Audio-only timeline projects can play, pause, scrub, mute and preview.
- Extracted/imported audio gets waveform visuals in the Media Bin and timeline when decoding is supported.
- Separate Audio creates an aligned editable AUDIO clip and mutes the original video clip audio.
- Audio fade-in/fade-out controls are included and exported.
- Undo / Redo added for core timeline edits.
- Default fitted timeline leaves extra editing room instead of making one clip fill the lane.
- Timeline blank-area clicks move the playhead.
- Custom EMX watermark / branding panel:
  default EMX logo, custom logo, custom text, EMX green/purple/white colors,
  opacity, size, position and margin.
- Native FFmpeg export renders the watermark into the final MP4.
- VERIFY-PROJECT.bat now tests timeline math AND native watermark export.


V1.7.2 POLISH + AUDIO AI PASS
- Added a large dedicated UNDO LAST button in the top bar.
- Normal Undo and Redo are still available.
- Fixed transport seek/scrub behavior:
  drag the seek bar continuously, preview follows without fighting the thumb,
  final pointer release seeks exactly to that location.
- Right-click Delete Clip is permanently visible and context-menu placement uses its real rendered height.
- New rich EMX toast notifications: success, warning, error and loading states.
- Top operation progress/loading bar for imports, extraction, Audio AI and export.
- Export and extraction dialogs now show:
  percent, animated spinner, Prepare/Process/Verify/Done stages, elapsed time, logs and success/error state.
- Buttons show proper disabled/loading states while long jobs run.
- Added real local Audio AI integration:
  EMX checks and prepares its private Audio AI runtime automatically.
  Remove Voices uses a source-separation model.
  4-Stem Split outputs vocals/drums/bass/other.
  Game Audio Focus creates an experimental effect-focused remix without the vocals stem.
  Denoise uses native FFmpeg noise reduction and does not require AI installation.
- Audio Separator model files download automatically on first model use and are cached in EMX app data.
- AI output can be added to Media Bin or aligned with a selected timeline clip.
- Original video audio can automatically be muted when processed audio is aligned.
- VERIFY-PROJECT.bat now checks UI contracts and the Audio AI integration contract too.

AUDIO AI REQUIREMENT
- Python 3.10 or newer must be installed on Windows for the one-time local AI setup.
- Internet is needed for the initial Python package/model downloads.
- Native FFmpeg is already packaged with the EMX desktop build.


V1.7.2 FRIEND-READY AUDIO AI
- The final installer can now carry its own private Python 3.12 + Audio Separator CPU runtime.
- Friends/customers do NOT need to install Python.
- Friends/customers do NOT need GitHub, Hugging Face, Patreon or other accounts for the standard public-model workflow.
- EMX verifies Audio AI automatically at startup. There is no normal "Install Audio AI" step anymore.
- If the packaged runtime is missing/corrupt, EMX can automatically create a managed private runtime under its own AppData.
- Audio AI includes a Repair button for exceptional cases.
- Public model files are downloaded automatically the first time a separation mode uses them, then cached under EMX AppData.
- Model downloads do not require a user account.
- The friend-ready installer is larger because it includes the Python/runtime dependencies.
- BUILD-DESKTOP-EXE.bat and BUILD-FRIEND-READY-EXE.bat both produce the friend-ready package automatically.

DEVELOPER BUILD FLOW
1. Double-click BUILD-DESKTOP-EXE.bat.
2. The builder prepares FFmpeg.
3. It downloads official Python 3.12 embedded x64 into build\ai-runtime.
4. It installs the CPU Audio Separator dependencies into that private runtime.
5. electron-builder packages the private runtime inside the installer.
6. Give friends the installer in release\.

END USER FLOW
1. Install EMX Clip Studio.
2. Open EMX Clip Studio.
3. Audio AI reports READY automatically.
4. Press Remove Voices / 4-Stem / Game Audio Focus.
5. The needed public model downloads automatically on first use and is cached.
6. Future uses reuse the cached model.

No separate Python installation or third-party account is part of the normal user flow.


V1.7.2 AUDIO AI PACKAGING FIX
- Explicitly installs audioread 3.1.0 because Audio Separator's UVR runtime imports it
  even though the current Audio Separator package metadata does not declare it.
- Runtime preparation now resumes an existing private Python installation instead of
  unnecessarily unpacking/reinstalling it from scratch after a verification failure.
- Verifies audioread, torch, onnxruntime, librosa and Separator imports before --env_info.
- HOTFIX-AUDIO-AI.bat repairs an already-downloaded V1.7.1 build runtime in-place.
