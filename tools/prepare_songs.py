"""
Cadencia song-pack builder (for example Plim Plim videos you have).

Cuts each song out of long videos and turns it into a small audio file for the app.
Where the songs are comes from, in this order:
  1. a spreadsheet "canciones.csv" in the folder, if there is one (see below), or
  2. a text file with the same name as the video or MP3 (for example "plimplim 1.txt" next to
     "plimplim 1.mp3") holding the chapter list copied from the YouTube description:
         0:00 Intro
         3:15 Lavarse las manos
         5:40 La canción del baño
     Each song ends where the next one starts; the last one ends with the file. Or
  3. the chapters inside each video file (most downloaded .webm videos keep them).

Needs only Python and ffmpeg (the same as for the clips). No transcription, no translation.

Usage (PowerShell, in the folder with this script):
    python prepare_songs.py "C:\\path\\to\\plimplim"
    python prepare_songs.py "C:\\path\\to\\plimplim" --ver        (only list the songs it finds)

Options:
    --show "Plim Plim"   name shown in the app (default: Plim Plim)
    --minimo 40          skip chapters shorter than this many seconds (intros, credits)
    --saltar "Intro,Créditos"   skip chapters whose title contains any of these words
    --repetidas          keep a song even if the same title already came up in another video

canciones.csv (export from Excel or Google Sheets as CSV), one row per song:
    archivo,inicio,fin,titulo
    plimplim_ep1.webm,3:15,5:40,Lavarse las manos
Times can be m:ss or h:mm:ss. Commas or semicolons both work.

Output: folder "cadencia-canciones" next to this script with canciones-1.zip, canciones-2.zip …
to import on your phone (Perfil > Importar paquete). These songs are for your personal use; do not
upload them anywhere public.
"""
import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import zipfile
from pathlib import Path

EXTS = {".webm", ".mp4", ".mkv", ".m4a", ".mp3", ".ogg", ".opus", ".wav"}
PACK_LIMIT = 100 * 1024 * 1024


def natural_key(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.stem)]


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(s):
    return re.sub(r"[^\w\-]+", "_", s, flags=re.UNICODE).strip("_")[:60] or "cancion"


def to_seconds(t):
    t = str(t).strip().replace(",", ".")
    if not t:
        raise ValueError("vacío")
    parts = [float(x) for x in t.split(":")]
    sec = 0.0
    for x in parts:
        sec = sec * 60 + x
    return sec


def clock(s):
    s = int(s)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def chapters(ffprobe, path):
    out = subprocess.run([ffprobe, "-v", "error", "-print_format", "json", "-show_chapters", str(path)],
                         capture_output=True, text=True)
    try:
        data = json.loads(out.stdout or "{}")
    except json.JSONDecodeError:
        return []
    res = []
    for c in data.get("chapters", []):
        title = (c.get("tags") or {}).get("title", "").strip()
        res.append({"start": float(c["start_time"]), "end": float(c["end_time"]), "title": title})
    return res


TIME_RE = re.compile(r"(?<![\d:])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])")


def file_duration(ffprobe, path):
    try:
        out = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                             capture_output=True, text=True, check=True).stdout.strip()
        return float(out)
    except Exception:
        return 0.0


def read_chapter_txt(path, src, ffprobe):
    """YouTube-style chapter list: a time and a title on each line, in either order."""
    marks = []
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        m = TIME_RE.search(line)
        if not m:
            continue
        title = (line[:m.start()] + " " + line[m.end():]).strip(" \t-\u2013\u2014|:.\u00b7")
        marks.append((to_seconds(m.group(1)), title))
    marks.sort(key=lambda x: x[0])
    total = file_duration(ffprobe, src)
    out = []
    for i, (start, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else total
        if end > start:
            out.append({"start": start, "end": end, "title": title})
    return out


def read_csv(path, files_by_name):
    text = path.read_text(encoding="utf-8-sig")
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",;\t") if text.strip() else csv.excel
    rows = list(csv.reader(text.splitlines(), dialect))
    songs, problems = [], []
    for i, r in enumerate(rows, 1):
        if not r or not "".join(r).strip():
            continue
        if i == 1 and norm(r[0]) in ("archivo", "file", "video"):
            continue
        if len(r) < 4:
            problems.append(f"fila {i}: faltan columnas (archivo, inicio, fin, título)")
            continue
        name, a, b, title = r[0].strip(), r[1], r[2], r[3].strip()
        src = files_by_name.get(name.lower()) or files_by_name.get(Path(name).stem.lower())
        if not src:
            problems.append(f"fila {i}: no encuentro el video «{name}»")
            continue
        try:
            start, end = to_seconds(a), to_seconds(b)
        except ValueError:
            problems.append(f"fila {i}: no entiendo los tiempos «{a}» / «{b}»")
            continue
        if end <= start:
            problems.append(f"fila {i}: el fin ({b}) es antes del inicio ({a})")
            continue
        songs.append({"src": src, "start": start, "end": end, "title": title or f"Canción {len(songs) + 1}"})
    return songs, problems


def encode(ffmpeg, src, start, end, dst):
    tmp = dst.with_suffix(".part.ogg")
    # -ss/-to after -i would be exact but slow on long videos; before -i is fast and accurate for audio.
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-i", str(src), "-t", f"{end - start:.2f}",
           "-vn", "-af", f"afade=t=in:d=0.3,afade=t=out:st={max(0, end - start - 0.6):.2f}:d=0.6,loudnorm=I=-16:TP=-1.5:LRA=11",
           "-ac", "2", "-ar", "48000", "-c:a", "libopus", "-b:a", "64k", str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(dst)


def main():
    ap = argparse.ArgumentParser(description="Corta canciones de videos largos para Cadencia.")
    ap.add_argument("folder")
    ap.add_argument("--out", default=str(Path(__file__).with_name("cadencia-canciones")))
    ap.add_argument("--show", default="Plim Plim")
    ap.add_argument("--minimo", type=float, default=40)
    ap.add_argument("--saltar", default="intro,créditos,creditos,presentación,presentacion,suscrib,trailer,adelanto")
    ap.add_argument("--repetidas", action="store_true")
    ap.add_argument("--ver", action="store_true", help="Solo mostrar la lista de canciones, sin cortar nada")
    args = ap.parse_args()

    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        sys.exit("No encuentro ffmpeg. En Windows: winget install Gyan.FFmpeg  y abrí una ventana nueva.")
    folder = Path(args.folder)
    files = sorted([p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in EXTS], key=natural_key)
    if not files:
        sys.exit(f"No encontré videos en {folder}")
    by_name = {}
    for f in files:
        by_name[f.name.lower()] = f
        by_name[f.stem.lower()] = f

    csv_path = next((p for p in folder.iterdir() if p.suffix.lower() == ".csv"), None)
    if csv_path:
        print(f"Uso la planilla {csv_path.name}.")
        songs, problems = read_csv(csv_path, by_name)
        for pr in problems:
            print("  ⚠", pr)
    else:
        print(f"Busco las canciones de {len(files)} archivos…")
        songs, skip = [], [norm(w) for w in args.saltar.split(",") if w.strip()]
        for f in files:
            txt = f.with_suffix(".txt")
            if txt.exists():
                chs = read_chapter_txt(txt, f, ffprobe)
                print(f"  {f.name}: {len(chs)} capítulos de {txt.name}")
            else:
                chs = chapters(ffprobe, f)
            if not chs:
                print(f"  ⚠ {f.name}: no tiene capítulos. Poné al lado un {f.stem}.txt con la lista de la descripción de YouTube.")
                continue
            for c in chs:
                t = norm(c["title"])
                if c["end"] - c["start"] < args.minimo or any(w and w in t for w in skip):
                    continue
                songs.append({"src": f, "start": c["start"], "end": c["end"], "title": c["title"] or f"Canción {len(songs) + 1}"})

    if not args.repetidas:
        seen, unique = set(), []
        for s in songs:
            k = norm(s["title"])
            if k in seen:
                continue
            seen.add(k)
            unique.append(s)
        dropped = len(songs) - len(unique)
        songs = unique
        if dropped:
            print(f"Salteo {dropped} canciones repetidas (mismo título). Usá --repetidas para quedártelas.")
    if not songs:
        sys.exit("No encontré canciones.")

    print(f"\n{len(songs)} canciones:")
    for i, s in enumerate(songs, 1):
        print(f"  {i:>3}. {s['title'][:50]:<50} {clock(s['end'] - s['start']):>6}   ({s['src'].name} {clock(s['start'])})")
    if args.ver:
        print("\nSolo lista (--ver). Corré sin --ver para cortarlas.")
        return

    out = Path(args.out)
    (out / "audio").mkdir(parents=True, exist_ok=True)
    print("\nCortando y comprimiendo…")
    for i, s in enumerate(songs, 1):
        s["id"] = f"{i:03d}_{slug(s['title'])}"
        s["audio"] = out / "audio" / f"{s['id']}.ogg"
        if not s["audio"].exists():
            encode(ffmpeg, s["src"], s["start"], s["end"], s["audio"])
        print(f"  {i:>3}/{len(songs)}  {s['title'][:50]}  ({s['audio'].stat().st_size / 1e6:.1f} MB)")

    for old in out.glob("canciones-*.zip"):
        old.unlink()
    packs, cur, size = [], [], 0
    for s in songs:
        b = s["audio"].stat().st_size
        if cur and size + b > PACK_LIMIT:
            packs.append(cur); cur, size = [], 0
        cur.append(s); size += b
    if cur:
        packs.append(cur)
    for k, group in enumerate(packs, 1):
        manifest = {"type": "songs", "show": args.show, "pack": k, "packs": len(packs), "songs": [
            {"id": s["id"], "title": s["title"], "n": songs.index(s) + 1, "duration": round(s["end"] - s["start"], 1),
             "file": f"audio/{s['id']}.ogg", "source": s["src"].stem} for s in group]}
        zpath = out / f"canciones-{k}.zip"
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_STORED) as z:
            for s in group:
                z.write(s["audio"], f"audio/{s['id']}.ogg")
            z.writestr("canciones.json", json.dumps(manifest, ensure_ascii=False))
        print(f"\n{zpath.name}: {len(group)} canciones, {zpath.stat().st_size / 1e6:.0f} MB")
    print(f"\nListo. Pasá los .zip de {out} al teléfono e importalos en Perfil.")


if __name__ == "__main__":
    main()
