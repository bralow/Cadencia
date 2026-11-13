"""
Penumbra song-pack builder (for example Plim Plim audio or videos you have).

Cuts each song out of long recordings and turns it into a small audio file for the app, with its
lyrics when there are any.
Where the songs are comes from, in this order:
  1. a spreadsheet "canciones.csv" in the folder, if there is one (see below), or
  2. an Excel file with the same name as the MP3 (for example "plimplim 1.xlsx" next to
     "plimplim 1.mp3"), one row per song:   Canción | Inicio | Fin
     Fin can be left empty: the song then ends where the next one starts. A header row is fine.
     Write times as 0:03:15 (h:mm:ss) or 3:15; if Excel turns 3:15 into "3:15:00" the script notices
     and reads it as minutes and seconds. Or
  3. a text file with the same name as the video or MP3 (for example "plimplim 1.txt" next to
     "plimplim 1.mp3") holding the chapter list copied from the YouTube description:
         0:00 Intro
         3:15 Lavarse las manos
         5:40 La canción del baño
     Each song ends where the next one starts; the last one ends with the file. Or
  3. the chapters inside each video file (most downloaded .webm videos keep them).

Lyrics: a subtitle file with the same name (for example "plimplim 1.srt") gives each song its lyrics.
A file without one is transcribed with Whisper on the computer, like the ArgenTalk podcast (slow:
several times as long as the audio on a normal computer). Each song is transcribed on its own, with the
singing voice separated from the music first when Demucs is installed (pip install demucs), which helps a lot.
The result is saved next to it as "<name>.srt" (and "<name>.letra.json"), so it only happens once; correct the
.srt by hand if you like. --retranscribir "plimplim 4" starts that file over.
A recording with no spreadsheet, list or chapters is taken as one whole song, named after the file.
--sin-letra skips lyrics and Whisper altogether. No translations.

Needs Python and ffmpeg; for transcription also faster-whisper (pip install faster-whisper).

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

Output: folder "penumbra-canciones" next to this script with canciones-1.zip, canciones-2.zip …
to import on your phone (Perfil > Importar paquete). These songs are for your personal use; do not
upload them anywhere public.
"""
import argparse
import faulthandler
import os
import xml.etree.ElementTree as ET
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


# ---------- Excel (.xlsx) without extra packages: an .xlsx is a zip of XML files ----------
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx(path):
    """Rows of the first sheet as lists of str/float (empty cells become '')."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
        rows = []
        for row in ET.fromstring(z.read(sheet)).iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                ref, kind = c.get("r", ""), c.get("t", "")
                col = 0
                for ch in re.match(r"[A-Z]+", ref).group(0):
                    col = col * 26 + ord(ch) - 64
                v = c.find("m:v", NS)
                if kind == "s" and v is not None:
                    val = shared[int(v.text)]
                elif kind == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                elif v is not None and v.text is not None:
                    try:
                        val = float(v.text)
                    except ValueError:
                        val = v.text
                else:
                    val = ""
                cells[col] = val
            if cells:
                rows.append([cells.get(i, "") for i in range(1, max(cells) + 1)])
    return rows


def excel_time(v, total):
    """A cell as seconds. Excel stores times as a fraction of a day; '3:15' typed in Excel becomes
    3 h 15 min, so a time longer than the whole recording is read as minutes:seconds instead."""
    if isinstance(v, float):
        sec = v * 86400 if v < 1 else v  # a plain number is taken as seconds
    else:
        if not TIME_RE.fullmatch(v.strip()) and not re.fullmatch(r"\d+(\.\d+)?", v.strip()):
            return None
        sec = to_seconds(v)
    if total and sec > total + 1 and sec / 60 <= total + 1:
        sec /= 60
    return round(sec, 2)


def read_song_sheet(path, src, ffprobe):
    total = file_duration(ffprobe, src)
    rows, songs = read_xlsx(path), []
    for r in rows:
        times, title = [], ""
        for v in r:
            if v == "" or v is None:
                continue
            # Excel times are fractions of a day (< 1); a whole number is a song number, not a time.
            t = excel_time(v, total) if (isinstance(v, float) and v < 1) or (isinstance(v, str) and TIME_RE.fullmatch(v.strip())) else None
            if t is not None:
                times.append(t)
            elif not title and isinstance(v, str):
                title = v.strip()
        if not times:
            continue  # header or empty row
        songs.append({"start": times[0], "end": times[1] if len(times) > 1 else None, "title": title})
    songs.sort(key=lambda x: x["start"])
    for i, x in enumerate(songs):
        if x["end"] is None or x["end"] <= x["start"]:
            x["end"] = songs[i + 1]["start"] if i + 1 < len(songs) else total
    return [x for x in songs if x["end"] > x["start"]]


# ---------- Lyrics: .srt files, or Whisper for recordings without one ----------
def read_srt(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace").replace("\r", "")
    out = []
    for block in re.split(r"\n\s*\n", text):
        m = re.search(r"(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)\s*\n(.*)", block, re.S)
        if not m:
            continue
        line = re.sub(r"<[^>]+>|\{[^}]+\}", "", m.group(3)).strip().replace("\n", " ")
        if line:
            out.append({"s": to_seconds(m.group(1)), "e": to_seconds(m.group(2)), "t": re.sub(r"\s+", " ", line)})
    return out


_model = None
_sep = None


def get_whisper(model_name):
    global _model
    if _model is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  ⚠ Falta Whisper para transcribir (pip install faster-whisper). Sigo sin letra para este archivo.")
        return None
    for name in ([model_name] if model_name else ["large-v3-turbo", "medium"]):
        try:
            print(f"  Cargando Whisper ({name})… (la primera vez se descarga el modelo, puede tardar)", flush=True)
            _model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
            return _model
        except Exception as err:
            print(f"  No se pudo cargar {name} ({str(err)[:120]}).")
    return None


def get_separator():
    """Demucs (optional): takes the singing voice out of the music, which helps Whisper a lot with songs.
    pip install demucs   (the first time it also downloads its model, about 80 MB)."""
    global _sep
    if _sep is not None:
        return _sep or None
    try:
        import torch
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        model = get_model("htdemucs")
        model.eval()
        _sep = (torch, model, apply_model)
        print("  Separo la voz de la música con Demucs.", flush=True)
    except Exception as err:
        _sep = False
        print(f"  (Sin Demucs: {str(err)[:100]}. Para mejores letras: pip install demucs)", flush=True)
    return _sep or None


def song_audio(ffmpeg, src, start, end):
    """The song as 16 kHz mono floats for Whisper; with only the voice when Demucs is installed."""
    import numpy as np
    sep = get_separator()
    if sep:
        torch, model, apply_model = sep
        sr = model.samplerate
        raw = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}",
                              "-i", str(src), "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"], capture_output=True, check=True).stdout
        wav = torch.from_numpy(np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy())
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / (ref.std() + 1e-8)
        with torch.no_grad():
            out = apply_model(model, wav[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
        voice = out[model.sources.index("vocals")] * (ref.std() + 1e-8) + ref.mean()
        mono = voice.mean(0).numpy().astype(np.float32)
        pcm = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
                              "-f", "s16le", "-ar", "16000", "-ac", "1", "-"], input=mono.tobytes(), capture_output=True, check=True).stdout
    else:
        pcm = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}",
                              "-i", str(src), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0


def whisper_lines(ffmpeg, src, model_name, songs):
    """Transcribes each song of a recording on its own (sung lyrics need different settings from speech)."""
    cache = src.with_suffix(".letra.json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    model = get_whisper(model_name)
    if model is None:
        return []
    out = []
    for song in sorted(songs, key=lambda x: x["start"]):
        a, b = song["start"], song["end"]
        print(f"  Transcribiendo «{song['title']}» ({clock(b - a)})…", flush=True)
        audio = song_audio(ffmpeg, src, a, b)
        opts = dict(language="es", word_timestamps=True, beam_size=5,
                    vad_filter=False,                      # the speech filter throws away singing
                    condition_on_previous_text=True,       # songs repeat; context keeps spelling consistent
                    initial_prompt=f"Letra de la canción infantil argentina «{song['title']}», de Plim Plim.",
                    hallucination_silence_threshold=2.0,   # drop invented lines over long instrumental parts
                    no_speech_threshold=0.6)
        try:
            segs, _ = model.transcribe(audio, **opts)
            segs = list(segs)
        except TypeError:  # an older faster-whisper without that setting
            opts.pop("hallucination_silence_threshold")
            segs, _ = model.transcribe(audio, **opts)
            segs = list(segs)
        last = None
        for sg in segs:
            text = sg.text.strip()
            # Typical Whisper inventions on music: very low confidence, endless repeats, lines lasting ages.
            if not text or sg.avg_logprob < -1.2 or sg.compression_ratio > 2.6 or (sg.end - sg.start) > 20:
                continue
            if last and text.lower() == last.lower() and sg.start - out[-1]["e"] < 0.5 and len(text) < 4:
                continue
            words = [[w.word.strip(), round(a + w.start, 2), round(a + w.end, 2)] for w in (sg.words or []) if w.word.strip()]
            out.append({"s": round(a + sg.start, 2), "e": round(a + sg.end, 2), "t": text, "w": words})
            last = text
            print(f"    {clock(a + sg.start)}  {text[:70]}", flush=True)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    # Also a normal subtitle file, so the recording has its own .srt from now on (you can correct it by hand).
    def ts(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"
    srt = src.with_suffix(".srt")
    if not srt.exists():
        srt.write_text("\n".join(f"{i}\n{ts(x['s'])} --> {ts(x['e'])}\n{x['t']}\n" for i, x in enumerate(out, 1)), encoding="utf-8")
        print(f"  Guardé {srt.name}")
    return out


def lyrics_for(song, lines):
    """The lines inside one song, with times counted from the start of the song."""
    a, b, out = song["start"], song["end"], []
    for ln in lines:
        mid = (ln["s"] + ln["e"]) / 2
        if a <= mid < b:
            item = {"s": round(max(0, ln["s"] - a), 2), "e": round(min(b, ln["e"]) - a, 2), "t": ln["t"]}
            if ln.get("w"):
                item["w"] = [[w, round(max(0, s - a), 2), round(e - a, 2)] for w, s, e in ln["w"] if a <= s < b]
            out.append(item)
    return out


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
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.2f}", "-i", str(src), "-t", f"{end - start:.2f}",
           "-vn", "-af", f"afade=t=in:d=0.3,afade=t=out:st={max(0, end - start - 0.6):.2f}:d=0.6,loudnorm=I=-16:TP=-1.5:LRA=11",
           "-ac", "2", "-ar", "48000", "-c:a", "libopus", "-b:a", "64k", str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(dst)


def main():
    ap = argparse.ArgumentParser(description="Corta canciones de audios o videos largos para Penumbra, con su letra.")
    ap.add_argument("folder")
    ap.add_argument("--out", default=str(Path(__file__).with_name("penumbra-canciones")))
    ap.add_argument("--show", default="Plim Plim")
    ap.add_argument("--minimo", type=float, default=40)
    ap.add_argument("--saltar", default="intro,créditos,creditos,presentación,presentacion,suscrib,trailer,adelanto")
    ap.add_argument("--repetidas", action="store_true")
    ap.add_argument("--ver", action="store_true", help="Solo mostrar la lista de canciones, sin cortar nada")
    ap.add_argument("--sin-letra", action="store_true", help="No agregar letras ni transcribir")
    ap.add_argument("--modelo", default="", help="Modelo de Whisper (por defecto: large-v3-turbo, o medium si no se puede)")
    ap.add_argument("--retranscribir", default="", help='Volver a transcribir estos archivos, por ejemplo "plimplim 4"')
    args = ap.parse_args()
    faulthandler.enable()

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
            txt, xlsx = f.with_suffix(".txt"), f.with_suffix(".xlsx")
            if xlsx.exists():
                chs = read_song_sheet(xlsx, f, ffprobe)
                print(f"  {f.name}: {len(chs)} canciones de {xlsx.name}")
                for c in chs:
                    songs.append({"src": f, "start": c["start"], "end": c["end"], "title": c["title"] or f"Canción {len(songs) + 1}"})
                continue
            if txt.exists():
                chs = read_chapter_txt(txt, f, ffprobe)
                print(f"  {f.name}: {len(chs)} capítulos de {txt.name}")
            else:
                chs = chapters(ffprobe, f)
            if not chs:
                # No sheet, no list, no chapters: the whole recording is one song, named after the file.
                total = file_duration(ffprobe, f)
                if total <= 0:
                    print(f"  ⚠ {f.name}: no pude leer la duración. Lo salteo.")
                    continue
                print(f"  {f.name}: sin planilla ni capítulos, lo tomo como una sola canción ({clock(total)})")
                songs.append({"src": f, "start": 0.0, "end": total, "title": f.stem})
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

    # Lyrics: from a same-name .srt, or transcribed (once per recording, saved next to it).
    redo = {norm(x) for x in args.retranscribir.split(",") if x.strip()}
    if not args.sin_letra:
        print("\nLetras…")
        by_src = {}
        for x in songs:
            by_src.setdefault(x["src"], []).append(x)
        for src, group in by_src.items():
            srt = src.with_suffix(".srt")
            if norm(src.stem) in redo:
                # Start over: forget the earlier transcription (and the .srt it wrote).
                for old in (src.with_suffix(".letra.json"), srt):
                    if old.exists():
                        old.rename(old.with_name(old.name + ".viejo"))
                print(f"  {src.name}: transcribo de nuevo (guardé lo anterior como .viejo)")
            if srt.exists():
                lines = read_srt(srt)
                print(f"  {src.name}: {len(lines)} líneas de {srt.name}")
            else:
                lines = whisper_lines(ffmpeg, src, args.modelo, group)
            for x in group:
                x["lines"] = lyrics_for(x, lines)

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
             "file": f"audio/{s['id']}.ogg", "source": s["src"].stem, "lines": s.get("lines", [])} for s in group]}
        zpath = out / f"canciones-{k}.zip"
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_STORED) as z:
            for s in group:
                z.write(s["audio"], f"audio/{s['id']}.ogg")
            z.writestr("canciones.json", json.dumps(manifest, ensure_ascii=False))
        print(f"\n{zpath.name}: {len(group)} canciones, {zpath.stat().st_size / 1e6:.0f} MB")
    print(f"\nListo. Pasá los .zip de {out} al teléfono y a la compu e importalos en Perfil.")


if __name__ == "__main__":
    main()
