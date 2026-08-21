EMX CLIP STUDIO V1.7.2 — FRIEND READY DISTRIBUTION

FOR YOU (THE DEVELOPER)
Double-click:
  BUILD-DESKTOP-EXE.bat

It automatically prepares and bundles the private Audio AI runtime.

FOR YOUR FRIENDS
Give them the generated installer from:
  release\

They only install and open EMX Clip Studio.

THEY DO NOT NEED
- Python
- Node.js
- GitHub account
- Hugging Face account
- Audio Separator account
- Manual FFmpeg setup

AUDIO AI MODELS
The required public separation model downloads automatically the first time
they use that processing mode and is then cached locally.

Because models are large, they are not bundled by default with the installer.
This keeps your installer smaller and avoids unnecessary downloads for people
who never use a particular AI model.


V1.7.2 AUDIO AI PACKAGING FIX
- Explicitly installs audioread 3.1.0 because Audio Separator's UVR runtime imports it
  even though the current Audio Separator package metadata does not declare it.
- Runtime preparation now resumes an existing private Python installation instead of
  unnecessarily unpacking/reinstalling it from scratch after a verification failure.
- Verifies audioread, torch, onnxruntime, librosa and Separator imports before --env_info.
- HOTFIX-AUDIO-AI.bat repairs an already-downloaded V1.7.1 build runtime in-place.
