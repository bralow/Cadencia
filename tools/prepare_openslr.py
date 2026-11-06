"""
Cadencia clip-pack builder.

Turns the OpenSLR Argentine Spanish download into one .zip you import on your phone
(Cadencia > Perfil > Importar paquete de clips).

What it does to each clip: trims silence at both ends, evens out loudness,
converts to small mono Opus audio, and tags a CEFR level from sentence length.

Needs: Python 3.9+ and ffmpeg (Windows: `winget install Gyan.FFmpeg`).

Usage (in the folder where you unzipped the OpenSLR files):
    python prepare_openslr.py "C:\\path\\to\\openslr" --max 1500

Output: cadencia-clips.zip next to this script (or --out PATH).
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
FILTER = (
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,"
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,"
    "loudnorm=I=-18:TP=-2:LRA=11"
)


def level_for(text):
    n = len(text.split())
    for limit, lvl in ((5, "A1"), (8, "A2"), (12, "B1"), (16, "B2"), (22, "C1")):
        if n <= limit:
            return lvl
    return "C2"


def speaker_for(clip_id):
    parts = clip_id.split("_")
    if len(parts) >= 2 and parts[0] in ("arf", "arm"):
        who = "Mujer" if parts[0] == "arf" else "Hombre"
        return f"{who} {int(parts[1]) if parts[1].isdigit() else parts[1]}"
    return ""


def read_transcripts(root):
    texts = {}
    for tsv in root.rglob("*.tsv"):
        with open(tsv, encoding="utf-8") as f:
            for line in f:
                cols = line.rstrip("\n").split("\t")
                if len(cols) >= 2 and cols[0].strip() and cols[1].strip():
                    texts[cols[0].strip()] = cols[1].strip()
    return texts


def encode(ffmpeg, src, dst):
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
           "-af", FILTER, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", str(dst)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return dst


def main():
    ap = argparse.ArgumentParser(description="Build a Cadencia clip pack from OpenSLR Argentine Spanish.")
    ap.add_argument("folder", help="Folder holding the unzipped OpenSLR files (.wav + line_index .tsv)")
    ap.add_argument("--max", type=int, default=1500, help="How many clips to include (default 1500)")
    ap.add_argument("--out", default=str(Path(__file__).with_name("cadencia-clips.zip")), help="Output .zip path")
    ap.add_argument("--seed", type=int, default=7, help="Random seed for picking clips")
    args = ap.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("No encuentro ffmpeg. En Windows: abrí PowerShell y corré  winget install Gyan.FFmpeg  y después abrí una ventana nueva.")

    root = Path(args.folder)
    if not root.is_dir():
        sys.exit(f"La carpeta no existe: {root}")

    texts = read_transcripts(root)
    wavs = {p.stem: p for p in root.rglob("*.wav")}
    clips = [(cid, texts[cid], wavs[cid]) for cid in texts if cid in wavs]
    if not clips:
        sys.exit("No encontré pares .wav + transcripción (.tsv). ¿Descomprimiste los .zip de OpenSLR en esa carpeta?")
    print(f"Encontré {len(clips)} clips con transcripción.")

    # Balance across levels, then fill up.
    rng = random.Random(args.seed)
    by_level = defaultdict(list)
    for c in clips:
        by_level[level_for(c[1])].append(c)
    for lst in by_level.values():
        rng.shuffle(lst)
    picked, i = [], 0
    while len(picked) < min(args.max, len(clips)):
        added = False
        for lvl in LEVELS:
            if i < len(by_level[lvl]) and len(picked) < args.max:
                picked.append(by_level[lvl][i]); added = True
        if not added:
            break
        i += 1
    print(f"Voy a preparar {len(picked)} clips: " + ", ".join(f"{l} {sum(1 for c in picked if level_for(c[1]) == l)}" for l in LEVELS))

    out = Path(args.out)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        manifest, done, failed = [], 0, 0
        workers = max(1, (os.cpu_count() or 2) - 1)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(encode, ffmpeg, wav, tmp / f"{cid}.ogg"): (cid, text) for cid, text, wav in picked}
            for fut in as_completed(futures):
                cid, text = futures[fut]
                try:
                    fut.result()
                    manifest.append({"id": cid, "file": f"audio/{cid}.ogg", "text": text,
                                     "level": level_for(text), "speaker": speaker_for(cid)})
                except subprocess.CalledProcessError:
                    failed += 1
                done += 1
                if done % 50 == 0 or done == len(picked):
                    print(f"  {done}/{len(picked)}")

        manifest.sort(key=lambda c: c["id"])
        # Audio is already compressed, so store it as-is (fast to read on the phone).
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as z:
            z.writestr("clips.json", json.dumps(manifest, ensure_ascii=False, indent=0))
            for c in manifest:
                z.write(tmp / f"{c['id']}.ogg", c["file"])

    size_mb = out.stat().st_size / 1_000_000
    print(f"\nListo: {out}  ({len(manifest)} clips, {size_mb:.1f} MB" + (f", {failed} con error" if failed else "") + ")")
    print("Pasalo al teléfono (Google Drive, USB o mail) y en Cadencia: Perfil > Importar paquete de clips.")


if __name__ == "__main__":
    main()
