# Cadencia

A personal app for practicing Rioplatense (Buenos Aires) Spanish: shadowing with dual waveforms, vos drills, Rioplatense IPA, and Anki export.

It runs as an installable web app (PWA) on Android. No build step: plain HTML, CSS, and JavaScript modules.

## Install on the phone

1. Open the app's address in Chrome on the phone (it's on the repo's GitHub Pages site).
2. Chrome menu (⋮) → **Add to home screen** → **Install**.

## Get the audio clips onto the phone (one time)

The clips come from OpenSLR's crowdsourced Argentine Spanish corpus (CC BY-SA 4.0). They stay on your phone; they're not in this repo.

On Windows:

1. Install Python (Microsoft Store → "Python 3.12") and ffmpeg (PowerShell: `winget install Gyan.FFmpeg`). Open a new PowerShell window afterward.
2. Unzip the OpenSLR downloads into one folder, e.g. `C:\openslr`.
3. Download `tools/prepare_openslr.py` from this repo and run:
   ```
   python prepare_openslr.py "C:\openslr" --max 1500
   ```
4. This creates `cadencia-clips.zip`. Send it to the phone (Google Drive, USB, or email).
5. In Cadencia: **Perfil → Importar paquete de clips** → pick the zip.

## Layout

- `index.html`, `css/app.css`: shell and theme (light/dark)
- `js/app.js`: router; `js/screens/*`: one file per screen
- `js/ipa.js`: Rioplatense IPA transcriber (yeísmo [ʃ], s-aspiration, b/d/g lenition, resyllabification)
- `js/audio.js`, `js/waveform.js`: recording, playback, waveforms
- `js/db.js`: on-phone storage (IndexedDB)
- `js/clippack.js`: imports the clip pack zip
- `tools/prepare_openslr.py`: builds the clip pack on a computer
