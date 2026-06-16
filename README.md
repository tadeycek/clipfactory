# Clip Factory

Download music videos and generate TikTok-ready clips automatically.

## Setup

### 1. Install Git

Download and install from **https://git-scm.com/download/win**

During install, keep all the default options.

### 2. Install Docker Desktop

Download and install from **https://www.docker.com/products/docker-desktop**

Once installed, open Docker Desktop and wait for it to fully start (the whale icon in the taskbar stops animating). You may need to restart your PC.

### 3. Clone and run

Open **PowerShell** or **Terminal** and run these commands one by one:

```powershell
git clone https://github.com/tadeycek/clipfactory
cd clipfactory
docker compose up --build
```

The first build takes 5–10 minutes — it's downloading and installing everything. You'll see a lot of output, that's normal. When you see this line it's ready:

```
✅  Clip Factory is ready → open http://localhost:4000 in your browser
```

### 4. Open the app

Go to **http://localhost:4000** in your browser.

---

## Usage

1. Paste a YouTube URL into the **Download** box and hit **Download**
2. Once downloaded, hit **Run** to generate clips
3. Clips appear in the grid below — star your favourites, mark posted ones green
4. Download individual clips or grab the whole folder as a ZIP

---

## Stopping and starting

To stop:
```powershell
docker compose down
```

To start again later (fast, no rebuild):
```powershell
docker compose up
```

## Updating to the latest version

```powershell
docker compose down
git pull
docker compose up --build
```

---

## Notes

- All your files are saved in the `data/` folder inside the project — clips, source videos, thumbnails
- Processing is CPU-heavy, give it time and watch the log panel for progress
- Beat Sync lets you cut clips exactly on the beat — use **From source video** to detect BPM automatically
