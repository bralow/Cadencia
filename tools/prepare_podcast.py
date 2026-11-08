"""
Cadencia podcast-pack builder (ArgenTalk and other episodes you have).

Three steps, all on your computer, safe to stop and run again (finished work is skipped):
  1. Compress: each episode (.webm, .mp3, .m4a, .mp4, .wav…) becomes small mono Opus audio
     (about 11 MB per hour). Only needs ffmpeg.
  2. Transcribe: Whisper writes down every word with its exact time, using your NVIDIA card.
  3. Pack: groups episodes into .zip files of about 100 MB to import on your phone
     (Cadencia > Perfil > Importar paquete).

Setup, once (PowerShell, in the folder with this script):
    pip install faster-whisper
  (with an NVIDIA card, also: pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*")

Speed: on a normal processor the "medium" model takes very roughly 1/3 of the audio's length
(20 minutes of audio in about 7). After the first episode it prints how long is left; if that is
too long, stop it (Ctrl+C) and run again with --modelo small (about twice as fast, a bit less exact).

Usage:
    python prepare_podcast.py "C:\\path\\to\\argentalk"
    python prepare_podcast.py "C:\\path\\to\\argentalk" --solo-comprimir     (step 1 only)

Output goes to a folder "cadencia-podcast" next to this script (or --out PATH):
    audio\\        compressed episodes
    transcripciones\\   one .json per episode
    argentalk-1.zip, argentalk-2.zip …   the packs for the phone

The audio and transcripts are for your personal use on your own phone. Do not upload them anywhere public.
"""
import argparse
import faulthandler
import glob
import json
import os
import re
import shutil
import site
import subprocess
import sys
import time
import zipfile
from pathlib import Path

EXTS = {".webm", ".mp3", ".m4a", ".mp4", ".mkv", ".wav", ".ogg", ".opus", ".aac", ".flac"}
PACK_LIMIT = 100 * 1024 * 1024  # bytes of audio per .zip


def natural_key(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.stem)]


def slug(name):
    s = re.sub(r"[^\w\-]+", "_", name, flags=re.UNICODE).strip("_")
    return s[:80] or "episodio"


def nice_title(stem):
    t = re.sub(r"[_]+", " ", stem)
    t = re.sub(r"\s*\[[^\]]{6,}\]\s*$", "", t)  # drop trailing video ids like [abc123xyz]
    return t.strip()


def duration(ffprobe, path):
    try:
        out = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                             capture_output=True, text=True, check=True).stdout.strip()
        return float(out)
    except Exception:
        return 0.0


def compress(ffmpeg, src, dst):
    tmp = dst.with_suffix(".part.ogg")
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-vn",
           "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-ac", "1", "-ar", "48000",
           "-c:a", "libopus", "-b:a", "24k", "-vbr", "constrained", "-application", "voip", str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(dst)


def add_cuda_dlls():
    """On Windows, the pip packages nvidia-cublas/cudnn put their DLLs where Python can't see them."""
    if os.name != "nt":
        return
    roots = site.getsitepackages() + [site.getusersitepackages()]
    for root in roots:
        for d in glob.glob(os.path.join(root, "nvidia", "*", "bin")):
            try:
                os.add_dll_directory(d)
            except Exception:
                pass
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def has_nvidia():
    try:
        return subprocess.run(["nvidia-smi"], capture_output=True).returncode == 0
    except Exception:
        return False


def load_whisper(model_name):
    add_cuda_dlls()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Falta Whisper. Corré:  pip install faster-whisper")
    gpu = has_nvidia()
    options = ([("cuda", "float16"), ("cuda", "int8_float16")] if gpu else []) + [("cpu", "int8")]
    for device, compute in options:
        name = model_name or ("large-v3" if device == "cuda" else "medium")
        try:
            print(f"Cargando Whisper ({name}) en {'la placa NVIDIA' if device == 'cuda' else 'el procesador'}… (la primera vez se descarga el modelo)")
            kw = {"cpu_threads": os.cpu_count() or 4} if device == "cpu" else {}
            m = WhisperModel(name, device=device, compute_type=compute, **kw)
            print("  Modelo cargado. Probando el motor con un segundo de silencio…", flush=True)
            import numpy as np
            list(m.transcribe(np.zeros(16000, dtype=np.float32), language="es")[0])
            print("  El motor funciona. Empiezo con los episodios (el primero tarda unos minutos).", flush=True)
            return m
        except Exception as err:
            print(f"  No funcionó ({str(err)[:160]}). Pruebo otra opción…")
    sys.exit("No pude cargar Whisper.")


def load_audio(ffmpeg, path):
    """Decode with ffmpeg to 16 kHz mono floats, so Whisper never has to open the file itself
    (its own reader, PyAV, breaks with some versions)."""
    import numpy as np
    out = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.int16).astype(np.float32) / 32768.0


def transcribe(model, ffmpeg, audio_path):
    segments, info = model.transcribe(load_audio(ffmpeg, audio_path), language="es", word_timestamps=True, vad_filter=True,
                                      beam_size=5, condition_on_previous_text=False)
    out = []
    for s in segments:
        words = [[w.word.strip(), round(w.start, 2), round(w.end, 2)] for w in (s.words or []) if w.word.strip()]
        out.append({"s": round(s.start, 2), "e": round(s.end, 2), "t": s.text.strip(), "w": words})
    return out


def fmt(sec):
    sec = int(sec)
    return f"{sec // 3600}h {sec % 3600 // 60:02d}m" if sec >= 3600 else f"{sec // 60}m {sec % 60:02d}s"


def main():
    # If the speech engine crashes (it is native code), print where instead of closing silently.
    faulthandler.enable()
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    import warnings
    warnings.filterwarnings("ignore", message=".*symlinks.*")
    ap = argparse.ArgumentParser(description="Comprime, transcribe y empaqueta episodios para Cadencia.")
    ap.add_argument("folder", help="Carpeta con los episodios (.webm, .mp3…)")
    ap.add_argument("--out", default=str(Path(__file__).with_name("cadencia-podcast")), help="Carpeta de salida")
    ap.add_argument("--show", default="ArgenTalk", help="Nombre del programa (default: ArgenTalk)")
    ap.add_argument("--modelo", default=None, help="Modelo de Whisper: large-v3 (el mejor, lento sin NVIDIA), medium (por defecto sin NVIDIA), small (rápido)")
    ap.add_argument("--solo-comprimir", action="store_true", help="Solo el paso 1")
    args = ap.parse_args()

    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        sys.exit("No encuentro ffmpeg. En Windows: winget install Gyan.FFmpeg  y abrí una ventana nueva.")
    src_dir = Path(args.folder)
    files = sorted([p for p in src_dir.rglob("*") if p.suffix.lower() in EXTS and p.is_file()], key=natural_key)
    if not files:
        sys.exit(f"No encontré episodios en {src_dir}")
    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    (out / "transcripciones").mkdir(parents=True, exist_ok=True)
    eps = [{"src": p, "id": slug(p.stem), "title": nice_title(p.stem), "n": i + 1} for i, p in enumerate(files)]
    print(f"Encontré {len(eps)} episodios.\n")

    # 1. Compress
    print("PASO 1: comprimir")
    for e in eps:
        e["audio"] = out / "audio" / f"{e['id']}.ogg"
        if e["audio"].exists():
            continue
        t0 = time.time()
        compress(ffmpeg, e["src"], e["audio"])
        print(f"  {e['n']:>3}/{len(eps)}  {e['title'][:60]}  ({e['audio'].stat().st_size / 1e6:.1f} MB, {time.time() - t0:.0f}s)")
    total = sum(e["audio"].stat().st_size for e in eps)
    print(f"  Listo: {total / 1e6:.0f} MB en total.\n")
    if args.solo_comprimir:
        print("Solo comprimir: terminé. Corré el mismo comando sin --solo-comprimir para transcribir.")
        return

    # 2. Transcribe
    print("PASO 2: transcribir")
    todo = [e for e in eps if not (out / "transcripciones" / f"{e['id']}.json").exists()]
    if todo:
        model = load_whisper(args.modelo)
        start = time.time()
        for k, e in enumerate(todo, 1):
            dur = duration(ffprobe, e["audio"])
            t0 = time.time()
            print(f"  … transcribiendo {e['title'][:50]} ({fmt(dur)} de audio)", flush=True)
            try:
                segs = transcribe(model, ffmpeg, e["audio"])
            except Exception as err:
                print(f"  ⚠ Falló este episodio ({str(err)[:200]}). Sigo con el próximo.", flush=True)
                continue
            if not segs:
                print("  ⚠ No se entendió nada en este episodio; lo salteo.", flush=True)
                continue
            data = {"id": e["id"], "title": e["title"], "n": e["n"], "duration": round(dur, 1), "segments": segs}
            tmp = out / "transcripciones" / f"{e['id']}.part.json"
            tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            tmp.replace(out / "transcripciones" / f"{e['id']}.json")
            spent = time.time() - start
            left = spent / k * (len(todo) - k)
            print(f"  {k:>3}/{len(todo)}  {e['title'][:50]}  ({fmt(dur)} de audio en {fmt(time.time() - t0)}; faltan ~{fmt(left)})")
    missing = [e for e in eps if not (out / "transcripciones" / f"{e['id']}.json").exists()]
    if missing:
        print(f"  ⚠ {len(missing)} episodios quedaron sin transcripción. Corré el mismo comando otra vez para reintentarlos.\n")
    else:
        print("  Todas las transcripciones listas.\n")

    # 3. Pack
    print("PASO 3: empaquetar")
    for old in out.glob(f"{slug(args.show).lower()}-*.zip"):
        old.unlink()
    packs, cur, size = [], [], 0
    for e in eps:
        s = e["audio"].stat().st_size
        if cur and size + s > PACK_LIMIT:
            packs.append(cur); cur, size = [], 0
        cur.append(e); size += s
    if cur:
        packs.append(cur)
    for i, group in enumerate(packs, 1):
        manifest = {"type": "podcast", "show": args.show, "pack": i, "packs": len(packs), "episodes": []}
        zpath = out / f"{slug(args.show).lower()}-{i}.zip"
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_STORED) as z:
            for e in group:
                tp = out / "transcripciones" / f"{e['id']}.json"
                t = json.loads(tp.read_text(encoding="utf-8")) if tp.exists() else {"id": e["id"], "title": e["title"], "n": e["n"], "duration": round(duration(ffprobe, e["audio"]), 1), "segments": []}
                manifest["episodes"].append({**t, "file": f"audio/{e['id']}.ogg"})
                z.write(e["audio"], f"audio/{e['id']}.ogg")
            z.writestr("podcast.json", json.dumps(manifest, ensure_ascii=False))
        print(f"  {zpath.name}: {len(group)} episodios, {zpath.stat().st_size / 1e6:.0f} MB")
    print(f"\nListo. Pasá los .zip de {out} al teléfono (por ejemplo a Google Drive).")


if __name__ == "__main__":
    main()
