import os
import uuid
import threading
import queue
import random
import shutil
import json
import io
import subprocess
import zipfile
from contextlib import redirect_stdout, redirect_stderr

from flask import Flask, render_template, request, jsonify, Response, send_from_directory

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024 * 1024

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "source_clips")
DONE_DIR = os.path.join(SOURCE_DIR, "done")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
THUMB_DIR = os.path.join(BASE_DIR, "thumbnails")

CLIPS_PER_VIDEO = 6
SUB_CLIPS = 3
CLIP_DURATION = 18.0
SEGMENT_DURATION = CLIP_DURATION / SUB_CLIPS
MAX_HEIGHT = 2160
DARKEN_FACTOR = 0.6
STRETCH_FACTOR = 1.15
CONTRAST_BOOST = 1.2
VIDEO_EXTENSIONS = (".mp4", ".mov")

QUALITY_PRESETS = {
    "draft":  {"crf": "28", "preset": "fast"},
    "normal": {"crf": "23", "preset": "medium"},
    "high":   {"crf": "18", "preset": "slow"},
    "max":    {"crf": "14", "preset": "veryslow"},
}

for d in [SOURCE_DIR, DONE_DIR, OUTPUT_DIR, THUMB_DIR]:
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------------------
# Job system
# ---------------------------------------------------------------------------

jobs = {}
jobs_lock = threading.Lock()


def new_job(job_type: str, meta: dict = None) -> str:
    jid = str(uuid.uuid4())[:8]
    with jobs_lock:
        jobs[jid] = {
            "id": jid,
            "type": job_type,
            "status": "running",
            "logs": [],
            "meta": meta or {},
            "_queue": queue.Queue(),
        }
    return jid


def job_log(jid: str, msg: str):
    with jobs_lock:
        if jid in jobs:
            jobs[jid]["logs"].append(msg)
            jobs[jid]["_queue"].put(("log", msg))


def job_done(jid: str, success: bool, result=None):
    with jobs_lock:
        if jid in jobs:
            jobs[jid]["status"] = "done" if success else "error"
            jobs[jid]["result"] = result
            jobs[jid]["_queue"].put(("done", "ok" if success else "error"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_video_resolution(path):
    try:
        result = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", "-select_streams", "v:0", path,
        ], capture_output=True, text=True, timeout=10)
        streams = json.loads(result.stdout).get("streams", [])
        if streams:
            return streams[0].get("width", 0), streams[0].get("height", 0)
    except Exception:
        pass
    return 0, 0


# ---------------------------------------------------------------------------
# Video processing
# ---------------------------------------------------------------------------

def fit_to_ratio(clip, ratio_str="9:16", random_crop=False, stretch=False):
    w_part, h_part = (int(x) for x in ratio_str.split(":"))
    target_ratio = w_part / h_part
    clip_ratio = clip.w / clip.h
    if stretch:
        if abs(clip_ratio - target_ratio) > 0.001:
            if clip_ratio > target_ratio:
                clip = clip.resized((int(clip.h * target_ratio), clip.h))
            else:
                clip = clip.resized((clip.w, int(clip.w / target_ratio)))
    else:
        if clip_ratio > target_ratio:
            new_w = int(clip.h * target_ratio)
            if random_crop:
                x_center = clip.w * random.uniform(0.35, 0.65)
                x_center = max(new_w / 2, min(clip.w - new_w / 2, x_center))
            else:
                x_center = clip.w / 2
            clip = clip.cropped(x1=x_center - new_w / 2, x2=x_center + new_w / 2)
        else:
            new_h = int(clip.w / target_ratio)
            if random_crop:
                y_center = clip.h * random.uniform(0.35, 0.65)
                y_center = max(new_h / 2, min(clip.h - new_h / 2, y_center))
            else:
                y_center = clip.h / 2
            clip = clip.cropped(y1=y_center - new_h / 2, y2=y_center + new_h / 2)
    long_side = max(clip.w, clip.h)
    if long_side > MAX_HEIGHT:
        scale = MAX_HEIGHT / long_side
        clip = clip.resized((int(clip.w * scale), int(clip.h * scale)))
    return clip


def apply_ug_look(clip):
    import numpy as np
    w, h = clip.size
    stretched_h = int(h * STRETCH_FACTOR)
    clip = clip.resized((w, stretched_h))
    y_center = stretched_h / 2
    clip = clip.cropped(y1=y_center - h / 2, y2=y_center + h / 2)
    clip = clip.resized((w, h))

    def color_grade(frame):
        img = frame.astype("float32") / 255.0
        img = (img - 0.5) * CONTRAST_BOOST + 0.5
        img = img * DARKEN_FACTOR
        return (img.clip(0, 1) * 255).astype("uint8")

    return clip.image_transform(color_grade)


def apply_zoom(clip):
    import numpy as np
    from PIL import Image
    zoom_in = random.choice([True, False])
    z0, z1 = (1.0, 1.06) if zoom_in else (1.06, 1.0)
    w, h = clip.w, clip.h

    def zoom_frame(get_frame, t):
        frame = get_frame(t)
        progress = t / max(clip.duration, 0.001)
        zoom = z0 + (z1 - z0) * progress
        nw, nh = int(w / zoom), int(h / zoom)
        x1, y1 = (w - nw) // 2, (h - nh) // 2
        cropped = frame[y1:y1 + nh, x1:x1 + nw]
        return np.array(Image.fromarray(cropped.astype("uint8")).resize((w, h), Image.BILINEAR))

    return clip.transform(zoom_frame)


def apply_speed_ramp(clip):
    factor = random.uniform(0.82, 1.25)
    try:
        return clip.with_speed_scaled(factor)
    except AttributeError:
        from moviepy import vfx
        return clip.with_effects([vfx.MultiplySpeed(factor)])


def pick_non_overlapping_segments(video_duration, n, seg_len, trim_start=0.0, trim_end=0.0):
    lo = float(trim_start or 0)
    hi = float(video_duration) - float(trim_end or 0)
    hi = max(lo + seg_len, hi)
    available = hi - lo
    if available < seg_len:
        return [(lo, lo + min(seg_len, available))] * n
    if available < n * seg_len:
        starts = sorted(random.uniform(lo, max(lo, hi - seg_len)) for _ in range(n))
        return [(s, s + seg_len) for s in starts]
    zone_size = available / n
    segments = []
    for i in range(n):
        zone_start = lo + i * zone_size
        zone_end = max(zone_start, zone_start + zone_size - seg_len)
        start = random.uniform(zone_start, zone_end)
        segments.append((start, start + seg_len))
    random.shuffle(segments)
    return segments


def make_clip(src_path, clip_index, source_name, jid,
              seg_duration=None, n_segments=None, ratio="9:16",
              random_crop=False, zoom_effect=False, speed_ramp=False,
              trim_start=0.0, trim_end=0.0, quality="high", stretch=False):
    from moviepy import VideoFileClip, concatenate_videoclips

    seg_dur = seg_duration if seg_duration else SEGMENT_DURATION
    n_seg = n_segments if n_segments else SUB_CLIPS
    full_clip = VideoFileClip(src_path)
    try:
        segments_times = pick_non_overlapping_segments(full_clip.duration, n_seg, seg_dur, trim_start=trim_start, trim_end=trim_end)
        sub_clips = []
        for start, end in segments_times:
            seg = full_clip.subclipped(start, end)
            seg = fit_to_ratio(seg, ratio, random_crop=random_crop, stretch=stretch)
            seg = seg.without_audio()
            if zoom_effect:
                seg = apply_zoom(seg)
            if speed_ramp:
                seg = apply_speed_ramp(seg)
            seg = apply_ug_look(seg)
            sub_clips.append(seg)

        combined = concatenate_videoclips(sub_clips)
        folder = os.path.join(OUTPUT_DIR, source_name)
        os.makedirs(folder, exist_ok=True)
        out_path = os.path.join(folder, f"clip_{clip_index}.mp4")

        qp = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["high"])
        buf = io.StringIO()
        with redirect_stdout(buf), redirect_stderr(buf):
            combined.write_videofile(
                out_path, fps=30, codec="libx264", audio=False, logger=None,
                ffmpeg_params=["-crf", qp["crf"], "-preset", qp["preset"], "-pix_fmt", "yuv420p"],
            )

        for s in sub_clips:
            s.close()
        combined.close()
        return out_path
    finally:
        full_clip.close()


def process_source_video(src_path, jid, seg_duration=None, n_clips=None, n_segments=None,
                         ratio="9:16", random_crop=False, zoom_effect=False, speed_ramp=False,
                         trim_start=0.0, trim_end=0.0, quality="high", stretch=False):
    source_name = os.path.splitext(os.path.basename(src_path))[0]
    job_log(jid, f"Processing: {os.path.basename(src_path)}")
    failed = False
    n_clips = n_clips or CLIPS_PER_VIDEO

    for i in range(n_clips):
        try:
            out = make_clip(src_path, i, source_name, jid,
                            seg_duration=seg_duration, n_segments=n_segments, ratio=ratio,
                            random_crop=random_crop, zoom_effect=zoom_effect, speed_ramp=speed_ramp,
                            trim_start=trim_start, trim_end=trim_end, quality=quality, stretch=stretch)
            job_log(jid, f"  [{i+1}/{n_clips}] {os.path.basename(out)} ✓")
        except Exception as e:
            job_log(jid, f"  [{i+1}/{n_clips}] ERROR: {e}")
            failed = True

    if not failed:
        os.makedirs(DONE_DIR, exist_ok=True)
        dest = os.path.join(DONE_DIR, os.path.basename(src_path))
        shutil.move(src_path, dest)
        job_log(jid, f"  Moved to done/: {os.path.basename(src_path)}")
    else:
        job_log(jid, f"  Errors occurred — source NOT moved to done/")

    return not failed


def run_process_job(jid, bpm=None, beats_per_cut=None, clips_per_video=None,
                    n_segments=None, seg_dur_req=None, ratio="9:16",
                    random_crop=False, zoom_effect=False, speed_ramp=False,
                    trim_start=0.0, trim_end=0.0, quality="high", stretch=False):
    try:
        n_clips = clips_per_video if clips_per_video else CLIPS_PER_VIDEO
        n_seg = n_segments if n_segments else SUB_CLIPS
        seg_duration = None
        if bpm and beats_per_cut:
            seg_duration = round((beats_per_cut * 60.0) / bpm, 4)
            total_dur = round(seg_duration * n_seg, 2)
            job_log(jid, f"Beat sync: {bpm} BPM · {beats_per_cut} beats/cut · {seg_duration:.2f}s/seg · {n_seg} segs · {total_dur}s total")
        else:
            seg_duration = seg_dur_req if seg_dur_req else SEGMENT_DURATION
            total_dur = round(seg_duration * n_seg, 2)
            job_log(jid, f"Segments: {n_seg} × {seg_duration}s = {total_dur}s · ratio {ratio}")

        job_log(jid, f"Quality: {quality} (CRF {QUALITY_PRESETS[quality]['crf']}, preset {QUALITY_PRESETS[quality]['preset']})")
        if trim_start or trim_end:
            job_log(jid, f"Trim: skip first {trim_start}s, skip last {trim_end}s")

        effects = []
        if stretch:      effects.append("stretch to fit")
        if random_crop: effects.append("random crop")
        if zoom_effect:  effects.append("zoom")
        if speed_ramp:   effects.append("speed ramp")
        if effects:
            job_log(jid, f"Effects: {', '.join(effects)}")

        source_files = [
            os.path.join(SOURCE_DIR, f)
            for f in os.listdir(SOURCE_DIR)
            if f.lower().endswith(VIDEO_EXTENSIONS) and os.path.isfile(os.path.join(SOURCE_DIR, f))
        ]
        if not source_files:
            job_log(jid, "No video files found in source_clips/")
            job_done(jid, False)
            return

        job_log(jid, f"Found {len(source_files)} source video(s) · {n_clips} clips each")
        total_clips = 0
        all_ok = True

        for src in source_files:
            ok = process_source_video(src, jid,
                                      seg_duration=seg_duration, n_clips=n_clips, n_segments=n_seg,
                                      ratio=ratio, random_crop=random_crop,
                                      zoom_effect=zoom_effect, speed_ramp=speed_ramp,
                                      trim_start=trim_start, trim_end=trim_end, quality=quality,
                                      stretch=stretch)
            if ok:
                total_clips += n_clips
            else:
                all_ok = False

        job_log(jid, f"Done. {len(source_files)} video(s) → {total_clips} clip(s) in output/")
        job_done(jid, all_ok)
    except Exception as e:
        job_log(jid, f"Fatal error: {e}")
        job_done(jid, False)


# ---------------------------------------------------------------------------
# Download logic
# ---------------------------------------------------------------------------

def run_download_job(jid, urls):
    try:
        import yt_dlp

        class LogHook:
            def debug(self, msg):
                if not msg.startswith("[debug]"):
                    job_log(jid, msg)
            def warning(self, msg):
                job_log(jid, f"WARNING: {msg}")
            def error(self, msg):
                job_log(jid, f"ERROR: {msg}")

        def progress_hook(d):
            if d["status"] == "downloading":
                pct = d.get("_percent_str", "?%").strip()
                speed = d.get("_speed_str", "?").strip()
                job_log(jid, f"  {os.path.basename(d.get('filename', ''))}: {pct} @ {speed}")
            elif d["status"] == "finished":
                job_log(jid, f"  Downloaded: {os.path.basename(d.get('filename', ''))}")

        ydl_opts = {
            "format": "bestvideo+bestaudio/bestvideo/best",
            "merge_output_format": "mp4",
            "outtmpl": os.path.join(SOURCE_DIR, "%(title)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "logger": LogHook(),
            "progress_hooks": [progress_hook],
            "extractor_args": {"youtube": {"player_client": ["tv_embedded", "android_vr"]}},
        }

        job_log(jid, f"Downloading {len(urls)} URL(s)...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download(urls)

        job_log(jid, "Download complete. Files saved to source_clips/")
        job_done(jid, True)
    except ImportError:
        job_log(jid, "ERROR: yt-dlp not installed.")
        job_done(jid, False)
    except Exception as e:
        job_log(jid, f"Download error: {e}")
        job_done(jid, False)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


def find_source_for_folder(folder_name):
    for directory in [SOURCE_DIR, DONE_DIR]:
        if not os.path.isdir(directory):
            continue
        for f in os.listdir(directory):
            if os.path.splitext(f)[0] == folder_name and f.lower().endswith(VIDEO_EXTENSIONS):
                return os.path.join(directory, f)
    return None


@app.route("/api/storage")
def api_storage():
    def dir_mb(path):
        total = 0
        for dirpath, _, files in os.walk(path):
            for f in files:
                try: total += os.path.getsize(os.path.join(dirpath, f))
                except: pass
        return round(total / 1024 / 1024, 1)
    source_mb = dir_mb(SOURCE_DIR)
    output_mb = dir_mb(OUTPUT_DIR)
    thumb_mb  = dir_mb(THUMB_DIR)
    return jsonify({
        "source_mb": source_mb,
        "output_mb": output_mb,
        "thumbnails_mb": thumb_mb,
        "total_mb": round(source_mb + output_mb + thumb_mb, 1),
    })


@app.route("/api/source/<filename>")
def api_serve_source(filename):
    for directory in [SOURCE_DIR, DONE_DIR]:
        path = os.path.join(directory, filename)
        if os.path.exists(path):
            return send_from_directory(directory, filename)
    return jsonify({"error": "not found"}), 404


@app.route("/api/regenerate", methods=["POST"])
def api_regenerate():
    data        = request.get_json() or {}
    folder      = data.get("folder", "").strip()
    clip_index  = data.get("clip_index")
    if not folder or clip_index is None:
        return jsonify({"error": "Missing folder or clip_index"}), 400
    src_path = find_source_for_folder(folder)
    if not src_path:
        return jsonify({"error": f"Source video not found for '{folder}'"}), 404

    ratio        = data.get("ratio", "9:16")
    n_segments   = max(1, min(int(data.get("n_segments", SUB_CLIPS)), 20))
    seg_duration = max(1.0, min(float(data.get("seg_duration", SEGMENT_DURATION)), 120.0))
    random_crop  = bool(data.get("random_crop", False))
    zoom_effect  = bool(data.get("zoom_effect", False))
    speed_ramp   = bool(data.get("speed_ramp", False))
    stretch      = bool(data.get("stretch", False))
    trim_start   = max(0.0, float(data.get("trim_start", 0)))
    trim_end     = max(0.0, float(data.get("trim_end", 0)))
    quality      = data.get("quality", "high")
    clip_index   = max(0, int(clip_index))
    if ratio not in ("9:16", "3:4", "4:5", "1:1", "16:9"): ratio = "9:16"
    if quality not in QUALITY_PRESETS: quality = "high"

    bpm           = data.get("bpm")
    beats_per_cut = data.get("beats_per_cut")
    if bpm and beats_per_cut:
        seg_duration = round((float(beats_per_cut) * 60.0) / float(bpm), 4)

    jid = new_job("regenerate", {"folder": folder, "clip_index": clip_index})

    def run():
        try:
            job_log(jid, f"Regenerating clip_{clip_index}.mp4 for {folder}…")
            out = make_clip(src_path, clip_index, folder, jid,
                            seg_duration=seg_duration, n_segments=n_segments, ratio=ratio,
                            random_crop=random_crop, zoom_effect=zoom_effect, speed_ramp=speed_ramp,
                            trim_start=trim_start, trim_end=trim_end, quality=quality, stretch=stretch)
            job_log(jid, f"Done: {os.path.basename(out)} ✓")
            job_done(jid, True)
        except Exception as e:
            job_log(jid, f"ERROR: {e}")
            job_done(jid, False)

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"job_id": jid})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith((".mp4", ".mov", ".mkv", ".webm", ".avi")):
        return jsonify({"error": "Unsupported format"}), 400
    dest = os.path.join(SOURCE_DIR, os.path.basename(f.filename))
    f.save(dest)
    return jsonify({"ok": True, "name": os.path.basename(f.filename)})


@app.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json()
    urls = [u.strip() for u in data.get("urls", []) if u.strip()]
    if not urls:
        return jsonify({"error": "No URLs provided"}), 400
    jid = new_job("download", {"urls": urls})
    threading.Thread(target=run_download_job, args=(jid, urls), daemon=True).start()
    return jsonify({"job_id": jid})


@app.route("/api/process", methods=["POST"])
def api_process():
    data = request.get_json() or {}
    bpm            = data.get("bpm")
    beats_per_cut  = data.get("beats_per_cut")
    clips_per_video= data.get("clips_per_video")
    n_segments     = data.get("n_segments")
    seg_dur_req    = data.get("seg_duration")
    ratio          = data.get("ratio", "9:16")
    random_crop    = bool(data.get("random_crop", False))
    zoom_effect    = bool(data.get("zoom_effect", False))
    speed_ramp     = bool(data.get("speed_ramp", False))
    stretch        = bool(data.get("stretch", False))
    trim_start     = data.get("trim_start", 0)
    trim_end       = data.get("trim_end", 0)
    quality        = data.get("quality", "high")

    if bpm:             bpm             = float(bpm)
    if beats_per_cut:   beats_per_cut   = int(beats_per_cut)
    if clips_per_video: clips_per_video = max(1, min(int(clips_per_video), 50))
    if n_segments:      n_segments      = max(1, min(int(n_segments), 20))
    if seg_dur_req:     seg_dur_req     = max(1.0, min(float(seg_dur_req), 120.0))
    if ratio not in ("9:16", "3:4", "4:5", "1:1", "16:9"): ratio = "9:16"
    if quality not in QUALITY_PRESETS: quality = "high"
    trim_start = max(0.0, float(trim_start or 0))
    trim_end   = max(0.0, float(trim_end   or 0))

    jid = new_job("process", {"ratio": ratio, "clips_per_video": clips_per_video})
    threading.Thread(
        target=run_process_job,
        args=(jid, bpm, beats_per_cut, clips_per_video, n_segments, seg_dur_req,
              ratio, random_crop, zoom_effect, speed_ramp, trim_start, trim_end, quality, stretch),
        daemon=True,
    ).start()
    return jsonify({"job_id": jid})


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith((".mp3", ".wav", ".m4a", ".ogg", ".flac")):
        return jsonify({"error": "Unsupported audio format"}), 400

    tmp_path = f"/tmp/cf_analyze_{uuid.uuid4().hex[:8]}{os.path.splitext(f.filename)[1]}"
    try:
        f.save(tmp_path)
        import librosa
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return jsonify({"bpm": round(float(tempo), 1)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.route("/api/analyze-source", methods=["POST"])
def api_analyze_source():
    source_files = [
        os.path.join(SOURCE_DIR, f)
        for f in os.listdir(SOURCE_DIR)
        if f.lower().endswith(VIDEO_EXTENSIONS) and os.path.isfile(os.path.join(SOURCE_DIR, f))
    ]
    if not source_files:
        return jsonify({"error": "No source videos found"}), 400

    src = source_files[0]
    tmp_path = f"/tmp/cf_src_audio_{uuid.uuid4().hex[:8]}.wav"
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", src, "-vn",
            "-acodec", "pcm_s16le", "-ar", "22050", "-ac", "1", tmp_path,
        ], capture_output=True, timeout=120)
        import librosa
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return jsonify({"bpm": round(float(tempo), 1), "source": os.path.basename(src)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.route("/api/stream/<jid>")
def api_stream(jid):
    def generate():
        with jobs_lock:
            if jid not in jobs:
                yield f"data: {json.dumps({'type': 'error', 'msg': 'Job not found'})}\n\n"
                return
            existing = list(jobs[jid]["logs"])
            status   = jobs[jid]["status"]
            q        = jobs[jid]["_queue"]

        for msg in existing:
            yield f"data: {json.dumps({'type': 'log', 'msg': msg})}\n\n"

        if status != "running":
            yield f"data: {json.dumps({'type': 'done', 'status': status})}\n\n"
            return

        while True:
            try:
                event_type, payload = q.get(timeout=30)
                if event_type == "log":
                    yield f"data: {json.dumps({'type': 'log', 'msg': payload})}\n\n"
                elif event_type == "done":
                    with jobs_lock:
                        final_status = jobs[jid]["status"]
                    yield f"data: {json.dumps({'type': 'done', 'status': final_status})}\n\n"
                    return
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/api/jobs")
def api_jobs():
    with jobs_lock:
        result = [
            {"id": j["id"], "type": j["type"], "status": j["status"], "meta": j["meta"]}
            for j in jobs.values()
        ]
    return jsonify(result)


@app.route("/api/clips")
def api_clips():
    entries = []
    for folder_name in os.listdir(OUTPUT_DIR):
        folder_path = os.path.join(OUTPUT_DIR, folder_name)
        if not os.path.isdir(folder_path):
            continue
        clips = []
        total_mb = 0.0
        for f in sorted(os.listdir(folder_path)):
            if f.lower().endswith(".mp4"):
                path = os.path.join(folder_path, f)
                mb = round(os.path.getsize(path) / 1024 / 1024, 1)
                clips.append({"name": f, "size_mb": mb})
                total_mb += mb
        if clips:
            entries.append({
                "folder": folder_name,
                "clips": clips,
                "total_mb": round(total_mb, 1),
                "_mtime": os.path.getmtime(folder_path),
            })
    entries.sort(key=lambda x: x["_mtime"], reverse=True)
    return jsonify([{"folder": e["folder"], "clips": e["clips"], "total_mb": e["total_mb"]} for e in entries])


@app.route("/api/clips/<folder>/zip")
def api_zip_folder(folder):
    folder_path = os.path.join(OUTPUT_DIR, folder)
    if not os.path.isdir(folder_path):
        return jsonify({"error": "not found"}), 404
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(os.listdir(folder_path)):
            if f.lower().endswith(".mp4"):
                zf.write(os.path.join(folder_path, f), f)
    buf.seek(0)
    safe_name = folder.replace("/", "_")
    return Response(
        buf.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'},
    )


@app.route("/api/clips/<folder>/<filename>")
def api_download_clip(folder, filename):
    return send_from_directory(os.path.join(OUTPUT_DIR, folder), filename, as_attachment=True)


@app.route("/api/thumbnails/<folder>/<filename>")
def api_thumbnail(folder, filename):
    name = os.path.splitext(os.path.basename(filename))[0]
    thumb_folder = os.path.join(THUMB_DIR, folder)
    os.makedirs(thumb_folder, exist_ok=True)
    thumb_path = os.path.join(thumb_folder, f"{name}.jpg")
    if not os.path.exists(thumb_path):
        src_path = os.path.join(OUTPUT_DIR, folder, filename)
        if not os.path.exists(src_path):
            return jsonify({"error": "not found"}), 404
        subprocess.run([
            "ffmpeg", "-y", "-ss", "0.5", "-i", src_path,
            "-vframes", "1", "-q:v", "3", "-vf", "scale=270:360",
            thumb_path,
        ], capture_output=True)
    if not os.path.exists(thumb_path):
        return jsonify({"error": "thumbnail generation failed"}), 500
    return send_from_directory(thumb_folder, f"{name}.jpg")


@app.route("/api/clips/<folder>/<filename>", methods=["DELETE"])
def api_delete_clip(folder, filename):
    path = os.path.join(OUTPUT_DIR, folder, filename)
    if os.path.exists(path):
        os.remove(path)
        thumb = os.path.join(THUMB_DIR, folder, os.path.splitext(filename)[0] + ".jpg")
        if os.path.exists(thumb):
            os.remove(thumb)
        return jsonify({"ok": True})
    return jsonify({"error": "File not found"}), 404


@app.route("/api/source")
def api_source():
    files = []
    for f in sorted(os.listdir(SOURCE_DIR)):
        path = os.path.join(SOURCE_DIR, f)
        if f.lower().endswith(VIDEO_EXTENSIONS) and os.path.isfile(path):
            w, h = get_video_resolution(path)
            files.append({
                "name": f,
                "size_mb": round(os.path.getsize(path) / 1024 / 1024, 1),
                "resolution": f"{w}×{h}" if w else "?",
            })
    return jsonify(files)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5757, debug=False, threaded=True)
