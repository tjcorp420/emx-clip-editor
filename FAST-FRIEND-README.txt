EMX CLIP STUDIO V1.7.3 — FAST FRIEND READY

USE THIS FOR NORMAL DISTRIBUTION:
  BUILD-FAST-FRIEND-EXE.bat

WHY THIS IS FASTER
The previous offline build bundled the complete Python/Torch/Audio Separator
directory inside Electron. Electron Builder then processed a large number of
embedded EXE files and built both a portable EXE and installer.

V1.7.3 changes the default:
- Builds ONE NSIS installer only.
- Does not bundle the giant Python/Torch runtime tree.
- Skips unnecessary Windows executable signing passes during this unsigned build.
- Keeps EMX icon/metadata resource editing.
- EMX automatically downloads/prepares its private Audio AI runtime when needed.
- Friends do not manually install Python.
- Friends do not need GitHub/Hugging Face/other accounts for public model workflow.
- FFmpeg / FFprobe remain bundled with the app.
- Public AI models download automatically on first use and are cached.

FOR YOUR FRIENDS
They receive only the installer from release\.
They install it and open EMX Clip Studio.
No BAT files are given to them.

OPTIONAL
BUILD-OFFLINE-AI-EXE.bat exists only if you specifically need a giant offline
Audio AI installer. It is expected to be much slower and much larger.

CODE SIGNING
The V1.7.3 fast build sets electron-builder win.signExecutable=false because this
project does not currently include a Windows code-signing certificate. EMX still
gets its configured icon and metadata through Electron Builder resource editing.
If you later purchase/configure a real code-signing certificate, re-enable
signExecutable before producing signed public releases.
