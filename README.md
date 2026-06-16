# Clip Factory

Download music videos and generate TikTok-ready clips automatically.

## Requirements

- Docker + Docker Compose

## Setup

```bash
git clone <repo-url>
cd clipfactory
docker compose up --build
```

Open **http://localhost:4000**

## Usage

1. Paste a YouTube/video URL and hit **Download**
2. Once downloaded, hit **Run** to generate clips
3. Clips appear in the grid — star your favourites, mark posted ones green
4. Download individual clips or grab the whole folder as a ZIP

## Data

All files are stored in `./data/` on your host machine:
- `data/source_clips/` — downloaded videos (moved to `done/` after processing)
- `data/output/` — generated clips, organised by video name
- `data/thumbnails/` — cached thumbnail images

## Notes

- First build takes a few minutes (installs ffmpeg, Python deps, Node deps)
- Processing is CPU-heavy — give it time, watch the log panel for progress
- Beat Sync requires knowing the BPM — use "From audio file" or "From source video" to detect it automatically
