import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Download, Play, Trash2, RefreshCw, X, Music, Shuffle,
  Folder, ChevronDown, ChevronRight, Star, CheckCircle,
  Zap, Move, ZoomIn, Archive,
} from 'lucide-react'

interface ClipFile   { name: string; size_mb: number }
interface ClipFolder { folder: string; clips: ClipFile[]; total_mb: number }
interface SourceFile { name: string; size_mb: number; resolution: string }

type JobStatus = 'idle' | 'running' | 'done' | 'error'
interface Playing { folder: string; clip: ClipFile }

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

// ---------------------------------------------------------------------------
// Video modal
// ---------------------------------------------------------------------------
function VideoModal({ folder, clip, onClose }: { folder: string; clip: ClipFile; onClose: () => void }) {
  const url = `/api/clips/${encodeURIComponent(folder)}/${encodeURIComponent(clip.name)}`
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 12,
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: -36, right: 0,
          background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4,
        }}><X size={18} /></button>
        <video src={url} controls autoPlay style={{
          maxHeight: '82vh', maxWidth: '92vw', borderRadius: 10, background: '#000', aspectRatio: '3/4',
        }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={url} download style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6,
            background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.2)',
            color: 'var(--accent)', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}><Download size={12} /> Save</a>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {clip.size_mb} MB · {clip.name}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clip card
// ---------------------------------------------------------------------------
function ClipCard({ folder, clip, onPlay, onDelete, starred, posted, onToggleStar, onTogglePosted }: {
  folder: string; clip: ClipFile
  onPlay: () => void; onDelete: () => void
  starred: boolean; posted: boolean
  onToggleStar: () => void; onTogglePosted: () => void
}) {
  const url     = `/api/clips/${encodeURIComponent(folder)}/${encodeURIComponent(clip.name)}`
  const thumbUrl= `/api/thumbnails/${encodeURIComponent(folder)}/${encodeURIComponent(clip.name)}`
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)', borderRadius: 6,
        border: `1px solid ${starred ? 'rgba(251,191,36,0.35)' : posted ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
        transition: 'border-color .15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* thumbnail */}
      <div onClick={onPlay} style={{
        width: '100%', aspectRatio: '3/4', cursor: 'pointer',
        position: 'relative', overflow: 'hidden', background: '#0a0a0a',
        borderRadius: '5px 5px 0 0',
      }}>
        <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

        {/* posted badge */}
        {posted && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(74,222,128,0.85)', borderRadius: 99,
            padding: '2px 7px', fontSize: 9, fontWeight: 700,
            color: '#000', letterSpacing: '.04em',
          }}>POSTED</div>
        )}

        {/* play overlay */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0)', transition: 'background .15s',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: hovered ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s',
          }}>
            <Play size={13} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: '5px 7px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {clip.size_mb} MB
          </span>
          {/* star */}
          <Tooltip text={starred ? 'Unfavourite' : 'Favourite — floats to top of grid'}>
            <button onClick={e => { e.stopPropagation(); onToggleStar() }} style={{
              display: 'inline-flex', padding: '2px 4px', borderRadius: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: starred ? '#fbbf24' : 'var(--text-3)',
            }}><Star size={10} fill={starred ? '#fbbf24' : 'none'} /></button>
          </Tooltip>
          {/* posted */}
          <Tooltip text={posted ? 'Mark as not posted' : 'Mark as posted to TikTok'}>
            <button onClick={e => { e.stopPropagation(); onTogglePosted() }} style={{
              display: 'inline-flex', padding: '2px 4px', borderRadius: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: posted ? 'var(--green)' : 'var(--text-3)',
            }}><CheckCircle size={10} /></button>
          </Tooltip>
          {/* download */}
          <a href={url} download onClick={e => e.stopPropagation()} style={{
            display: 'inline-flex', padding: '2px 5px', borderRadius: 4,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-3)', textDecoration: 'none', cursor: 'pointer',
          }}><Download size={10} /></a>
          {/* delete */}
          <button onClick={e => { e.stopPropagation(); onDelete() }} style={{
            display: 'inline-flex', padding: '2px 4px', borderRadius: 4,
            background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer',
          }}><Trash2 size={10} /></button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)',
          background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7, padding: '6px 11px',
          fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5,
          whiteSpace: 'nowrap', zIndex: 200, pointerEvents: 'none',
          fontFamily: 'var(--font-ui)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1c1c1f',
          }} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle helper
// ---------------------------------------------------------------------------
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={onToggle} style={{
        width: 32, height: 18, borderRadius: 99, flexShrink: 0,
        background: on ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${on ? 'rgba(129,140,248,0.5)' : 'var(--border)'}`,
        position: 'relative', transition: 'background .2s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: on ? 15 : 2,
          width: 12, height: 12, borderRadius: '50%',
          background: on ? 'var(--accent)' : 'var(--text-3)',
          transition: 'left .2s, background .2s',
        }} />
      </div>
      <span style={{ fontSize: 12, color: on ? 'var(--text)' : 'var(--text-3)' }}>{label}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Clips() {
  const isMobile = useIsMobile()
  const [urls,        setUrls]        = useState('')
  const [sources,     setSources]     = useState<SourceFile[]>([])
  const [folders,     setFolders]     = useState<ClipFolder[]>([])
  const [logs,        setLogs]        = useState<{ msg: string; kind: 'default'|'ok'|'err'|'info' }[]>(() => {
    try { return JSON.parse(localStorage.getItem('cf_logs') || '[]') } catch { return [] }
  })
  const [jobStatus,   setJobStatus]   = useState<JobStatus>('idle')
  const [dlBusy,      setDlBusy]      = useState(false)
  const [runBusy,     setRunBusy]     = useState(false)
  const [playing,     setPlaying]     = useState<Playing | null>(null)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())

  // starred / posted — persisted to localStorage
  const [starred, setStarred] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cf_starred') || '[]')) } catch { return new Set() }
  })
  const [posted, setPosted] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cf_posted') || '[]')) } catch { return new Set() }
  })

  // generate options
  const [clipsCount,   setClipsCount]   = useState('6')
  const [nSegments,    setNSegments]    = useState('3')
  const [segDur,       setSegDur]       = useState('6')
  const [ratio,        setRatio]        = useState('9:16')
  const [randomCrop,   setRandomCrop]   = useState(false)
  const [zoomEffect,   setZoomEffect]   = useState(false)
  const [speedRamp,    setSpeedRamp]    = useState(false)

  // download options
  const [autoProcess,  setAutoProcess]  = useState(false)

  // beat sync
  const [beatSync,     setBeatSync]     = useState(false)
  const [bpm,          setBpm]          = useState('')
  const [beatsPerCut,  setBeatsPerCut]  = useState('8')
  const [analyzing,    setAnalyzing]    = useState(false)
  const [analyzingSrc, setAnalyzingSrc] = useState(false)

  const logRef = useRef<HTMLDivElement>(null)
  const esRef  = useRef<EventSource | null>(null)

  // Keep startProcess accessible from the download callback
  const startProcessRef = useRef<(() => void) | null>(null)

  const appendLog = useCallback((msg: string, kind: 'default'|'ok'|'err'|'info' = 'default') => {
    setLogs(prev => {
      const next = [...prev, { msg, kind }]
      try { localStorage.setItem('cf_logs', JSON.stringify(next.slice(-500))) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const refreshSources = useCallback(async () => {
    const data = await fetch('/api/source').then(r => r.json()).catch(() => [])
    setSources(data)
  }, [])

  const refreshClips = useCallback(async () => {
    const data = await fetch('/api/clips').then(r => r.json()).catch(() => [])
    setFolders(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { refreshSources(); refreshClips() }, [refreshSources, refreshClips])

  function streamJob(jid: string, onDone: () => void) {
    esRef.current?.close()
    const ev = new EventSource(`/api/stream/${jid}`)
    esRef.current = ev
    ev.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.type === 'log') {
        const kind: 'ok'|'err'|'default' =
          d.msg.includes('ERROR') ? 'err'
          : d.msg.includes('✓') || d.msg.toLowerCase().includes('done') || d.msg.toLowerCase().includes('complete') ? 'ok'
          : 'default'
        appendLog(d.msg, kind)
      } else if (d.type === 'done') {
        setJobStatus(d.status === 'done' ? 'done' : 'error')
        ev.close(); esRef.current = null
        onDone()
      }
    }
    ev.onerror = () => {
      setJobStatus('error'); ev.close(); esRef.current = null; onDone()
    }
  }

  async function startDownload() {
    const list = urls.trim().split('\n').map(u => u.trim()).filter(Boolean)
    if (!list.length) return
    setDlBusy(true); setJobStatus('running')
    appendLog(`Downloading ${list.length} URL(s)…`, 'info')
    const { job_id } = await fetch('/api/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: list }),
    }).then(r => r.json())
    streamJob(job_id, () => {
      setDlBusy(false)
      refreshSources()
      if (autoProcess) startProcessRef.current?.()
    })
  }

  async function startProcess() {
    setRunBusy(true); setJobStatus('running')
    appendLog('Starting clip generation…', 'info')
    const body: Record<string, unknown> = {
      ratio,
      n_segments: parseInt(nSegments),
      seg_duration: parseFloat(segDur),
      random_crop: randomCrop,
      zoom_effect: zoomEffect,
      speed_ramp: speedRamp,
    }
    if (clipsCount && parseInt(clipsCount) !== 6) body.clips_per_video = parseInt(clipsCount)
    if (beatSync && bpm) { body.bpm = parseFloat(bpm); body.beats_per_cut = parseInt(beatsPerCut) }
    const { job_id } = await fetch('/api/process', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json())
    streamJob(job_id, () => { setRunBusy(false); refreshClips(); refreshSources() })
  }

  // keep the ref current
  useEffect(() => { startProcessRef.current = startProcess })

  async function analyzeAudio(file: File) {
    setAnalyzing(true)
    appendLog(`Analyzing ${file.name}…`, 'info')
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: fd }).then(r => r.json())
      if (res.bpm) { setBpm(String(res.bpm)); appendLog(`Detected BPM: ${res.bpm}`, 'ok') }
      else appendLog(`Analysis failed: ${res.error}`, 'err')
    } catch { appendLog('Analysis request failed', 'err') }
    setAnalyzing(false)
  }

  async function analyzeSourceBpm() {
    setAnalyzingSrc(true)
    appendLog('Detecting BPM from source video…', 'info')
    try {
      const res = await fetch('/api/analyze-source', { method: 'POST' }).then(r => r.json())
      if (res.bpm) {
        setBpm(String(res.bpm))
        setBeatSync(true)
        appendLog(`Detected BPM: ${res.bpm} (from ${res.source})`, 'ok')
      } else appendLog(`BPM detection failed: ${res.error}`, 'err')
    } catch { appendLog('BPM detection request failed', 'err') }
    setAnalyzingSrc(false)
  }

  function toggleStar(folder: string, name: string) {
    const key = `${folder}/${name}`
    setStarred(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem('cf_starred', JSON.stringify([...next]))
      return next
    })
  }

  function togglePosted(folder: string, name: string) {
    const key = `${folder}/${name}`
    setPosted(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      localStorage.setItem('cf_posted', JSON.stringify([...next]))
      return next
    })
  }

  async function deleteClip(folder: string, name: string) {
    await fetch(`/api/clips/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    refreshClips()
  }

  function toggleExpanded(folder: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(folder) ? n.delete(folder) : n.add(folder); return n })
  }

  function sortedClips(folder: string, clips: ClipFile[]) {
    return [...clips].sort((a, b) => {
      const aStarred = starred.has(`${folder}/${a.name}`) ? 0 : 1
      const bStarred = starred.has(`${folder}/${b.name}`) ? 0 : 1
      return aStarred - bStarred
    })
  }

  const latest   = folders[0] ?? null
  const archived = folders.slice(1)
  const totalGB  = folders.reduce((s, f) => s + f.total_mb, 0) / 1024

  const dotColor    = jobStatus === 'running' ? 'var(--orange)' : jobStatus === 'done' ? 'var(--green)' : jobStatus === 'error' ? 'var(--red)' : 'var(--text-3)'
  const statusLabel = jobStatus === 'running' ? 'Running…' : jobStatus === 'done' ? 'Done' : jobStatus === 'error' ? 'Error' : 'Idle'

  const clipGrid = (folder: string, clips: ClipFile[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 185}px, 1fr))`, gap: 8 }}>
      {sortedClips(folder, clips).map(c => (
        <ClipCard
          key={c.name}
          folder={folder} clip={c}
          starred={starred.has(`${folder}/${c.name}`)}
          posted={posted.has(`${folder}/${c.name}`)}
          onPlay={() => setPlaying({ folder, clip: c })}
          onDelete={() => deleteClip(folder, c.name)}
          onToggleStar={() => toggleStar(folder, c.name)}
          onTogglePosted={() => togglePosted(folder, c.name)}
        />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Download + Source ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="section-header">
            <span className="label">Download</span>
            <span className="section-header rule" />
          </div>
          <textarea
            value={urls} onChange={e => setUrls(e.target.value)}
            className="clean-input"
            style={{ minHeight: 96, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            placeholder={'Paste URLs here, one per line\nhttps://www.youtube.com/watch?v=...'}
          />
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button disabled={dlBusy} onClick={startDownload} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(129,140,248,0.2)',
              background: 'rgba(129,140,248,0.12)', color: 'var(--accent)',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
              cursor: dlBusy ? 'not-allowed' : 'pointer', opacity: dlBusy ? .4 : 1,
            }}>
              <Download size={12} />
              {dlBusy ? 'Downloading…' : 'Download'}
            </button>
            <Tooltip text="Automatically generate clips after download finishes">
              <Toggle on={autoProcess} onToggle={() => setAutoProcess(p => !p)} label="Auto-process" />
            </Tooltip>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="section-header">
            <span className="label">Source clips</span>
            <span className="section-header rule" />
            <span className="section-header count">{sources.length}</span>
            <button onClick={refreshSources} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
              <RefreshCw size={11} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
            {sources.length === 0
              ? <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No videos in source_clips/</span>
              : sources.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', whiteSpace: 'nowrap', background: 'rgba(129,140,248,0.1)', padding: '1px 6px', borderRadius: 4 }}>{f.resolution}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{f.size_mb} MB</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* ── Generate clips ────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Generate clips</div>
            {!isMobile && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>add audio on TikTok</div>}
          </div>
          <button disabled={runBusy} onClick={startProcess} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(129,140,248,0.2)',
            background: 'rgba(129,140,248,0.12)', color: 'var(--accent)',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
            cursor: runBusy ? 'not-allowed' : 'pointer', opacity: runBusy ? .4 : 1,
          }}>
            <Play size={12} fill="currentColor" />
            {runBusy ? 'Running…' : 'Run'}
          </button>
        </div>

        {/* main options */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 12 : 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <Tooltip text="Output aspect ratio — 9:16 is standard TikTok portrait">
              <div className="label" style={{ marginBottom: 6, cursor: 'default' }}>Ratio</div>
            </Tooltip>
            <div style={{ display: 'flex', gap: 4 }}>
              {['9:16', '3:4', '4:5', '1:1', '16:9'].map(r => (
                <button key={r} onClick={() => setRatio(r)} style={{
                  padding: '4px 9px', borderRadius: 5, border: '1px solid',
                  fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  borderColor: ratio === r ? 'rgba(129,140,248,0.5)' : 'var(--border)',
                  background: ratio === r ? 'rgba(129,140,248,0.12)' : 'transparent',
                  color: ratio === r ? 'var(--accent)' : 'var(--text-3)', transition: 'all .15s',
                }}>{r}</button>
              ))}
            </div>
          </div>

          {!isMobile && <div style={{ alignSelf: 'stretch', width: 1, background: 'var(--border)', flexShrink: 0 }} />}

          <div>
            <Tooltip text="How many random pieces get stitched into one clip">
              <div className="label" style={{ marginBottom: 6, cursor: 'default' }}>Segments</div>
            </Tooltip>
            <input type="number" min="1" max="20" value={nSegments} onChange={e => setNSegments(e.target.value)}
              className="clean-input" style={{ width: 60, textAlign: 'center' }} />
          </div>

          <div>
            <Tooltip text="Duration of each individual segment before stitching">
              <div className="label" style={{ marginBottom: 6, cursor: 'default' }}>Segment length</div>
            </Tooltip>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="number" min="1" max="120" step="0.5" value={segDur} onChange={e => setSegDur(e.target.value)}
                className="clean-input" style={{ width: 68, textAlign: 'center' }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>s</span>
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6, visibility: 'hidden' }}>·</div>
            <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                = {(parseFloat(segDur || '0') * parseInt(nSegments || '0')).toFixed(1)}s total
              </span>
            </div>
          </div>

          {!isMobile && <div style={{ alignSelf: 'stretch', width: 1, background: 'var(--border)', flexShrink: 0 }} />}

          <div>
            <Tooltip text="How many output clips to generate per source video">
              <div className="label" style={{ marginBottom: 6, cursor: 'default' }}>Clips per video</div>
            </Tooltip>
            <input type="number" min="1" max="50" value={clipsCount} onChange={e => setClipsCount(e.target.value)}
              className="clean-input" style={{ width: 60, textAlign: 'center' }} />
          </div>
        </div>

        {/* effects row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 20, flexWrap: 'wrap',
          paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Effects</span>
          <Tooltip text="Slightly shifts the crop position each segment so clips from the same source look different">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Move size={11} color={randomCrop ? 'var(--accent)' : 'var(--text-3)'} />
              <Toggle on={randomCrop} onToggle={() => setRandomCrop(p => !p)} label="Random crop" />
            </div>
          </Tooltip>
          <Tooltip text="Slow push-in or pull-out zoom on each segment (Ken Burns effect)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ZoomIn size={11} color={zoomEffect ? 'var(--accent)' : 'var(--text-3)'} />
              <Toggle on={zoomEffect} onToggle={() => setZoomEffect(p => !p)} label="Zoom / Ken Burns" />
            </div>
          </Tooltip>
          <Tooltip text="Randomly speeds each segment up or down (0.8×–1.25×) for a less robotic feel">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={11} color={speedRamp ? 'var(--accent)' : 'var(--text-3)'} />
              <Toggle on={speedRamp} onToggle={() => setSpeedRamp(p => !p)} label="Speed variation" />
            </div>
          </Tooltip>
        </div>
      </div>

      {/* ── Beat Sync ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: beatSync ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Music size={13} color={beatSync ? 'var(--accent)' : 'var(--text-3)'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: beatSync ? 'var(--text)' : 'var(--text-2)' }}>Beat Sync</span>
            {!isMobile && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>— cuts snap to the beat grid</span>}
          </div>
          <div onClick={() => setBeatSync(p => !p)} style={{
            width: 36, height: 20, borderRadius: 99, cursor: 'pointer',
            background: beatSync ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${beatSync ? 'rgba(129,140,248,0.5)' : 'var(--border)'}`,
            position: 'relative', transition: 'background .2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: beatSync ? 17 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: beatSync ? 'var(--accent)' : 'var(--text-3)',
              transition: 'left .2s, background .2s',
            }} />
          </div>
        </div>

        {beatSync && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>BPM</div>
              <input type="number" min="60" max="220" step="0.1" value={bpm} onChange={e => setBpm(e.target.value)}
                placeholder="128" className="clean-input" style={{ width: 90 }} />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Beats per cut</div>
              <select value={beatsPerCut} onChange={e => setBeatsPerCut(e.target.value)} className="clean-input" style={{ width: 100 }}>
                <option value="4">4 beats</option>
                <option value="8">8 beats</option>
                <option value="16">16 beats</option>
                <option value="32">32 beats</option>
              </select>
            </div>
            {bpm && (
              <div>
                <div className="label" style={{ marginBottom: 6, visibility: 'hidden' }}>·</div>
                <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {((parseInt(beatsPerCut) * 60) / parseFloat(bpm)).toFixed(2)}s/cut
                    &nbsp;·&nbsp;
                    {((parseInt(beatsPerCut) * parseInt(nSegments) * 60) / parseFloat(bpm)).toFixed(2)}s clip
                  </span>
                </div>
              </div>
            )}
            {/* detect from uploaded audio */}
            <div>
              <div className="label" style={{ marginBottom: 6, visibility: 'hidden' }}>·</div>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                color: analyzing ? 'var(--text-3)' : 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-ui)',
              }}>
                {analyzing ? <><span className="spinner" /> Analyzing…</> : <><Shuffle size={11} /> From audio file</>}
                <input type="file" accept=".mp3,.wav,.m4a,.ogg,.flac" style={{ display: 'none' }} disabled={analyzing}
                  onChange={e => { const f = e.target.files?.[0]; if (f) analyzeAudio(f); e.target.value = '' }} />
              </label>
            </div>
            {/* detect from source video */}
            <div>
              <div className="label" style={{ marginBottom: 6, visibility: 'hidden' }}>·</div>
              <Tooltip text={sources.length === 0 ? 'Load a source video first' : 'Extract audio from source video and detect BPM automatically'}>
              <button
                onClick={analyzeSourceBpm}
                disabled={analyzingSrc || sources.length === 0}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 6, cursor: (analyzingSrc || sources.length === 0) ? 'not-allowed' : 'pointer',
                  background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)',
                  color: (analyzingSrc || sources.length === 0) ? 'var(--text-3)' : 'var(--accent)',
                  fontSize: 12, fontFamily: 'var(--font-ui)',
                  opacity: sources.length === 0 ? 0.4 : 1,
                }}
              >
                {analyzingSrc ? <><span className="spinner" /> Detecting…</> : <><Music size={11} /> From source video</>}
              </button>
              </Tooltip>
            </div>
          </div>
        )}
      </div>

      {/* ── Log ───────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: dotColor, boxShadow: jobStatus === 'running' ? `0 0 6px ${dotColor}` : 'none',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{statusLabel}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setLogs([]); setJobStatus('idle'); localStorage.removeItem('cf_logs') }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', padding: '2px 6px', borderRadius: 4 }}>
            Clear
          </button>
        </div>
        <div ref={logRef} style={{
          height: 180, overflowY: 'auto', background: 'rgba(0,0,0,0.35)', borderRadius: 6,
          padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7,
        }}>
          {logs.length === 0
            ? <span style={{ color: 'var(--text-3)' }}>No output yet</span>
            : logs.map((l, i) => (
              <div key={i} style={{
                color: l.kind === 'ok' ? 'var(--green)' : l.kind === 'err' ? 'var(--red)' : l.kind === 'info' ? 'var(--accent)' : 'var(--text-3)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{l.msg}</div>
            ))
          }
        </div>
      </div>

      {/* ── Latest clips ──────────────────────────────────────────────────── */}
      {latest && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
              color: 'var(--accent)', background: 'rgba(129,140,248,0.1)',
              border: '1px solid rgba(129,140,248,0.2)', padding: '2px 8px', borderRadius: 99, flexShrink: 0,
            }}>Latest</span>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={latest.folder}>{latest.folder}</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginLeft: 4 }}>
              {latest.total_mb} MB
            </span>
            <div style={{ flex: 1 }} />
            <Tooltip text="Download all clips in this folder as a ZIP file">
              <a
                href={`/api/clips/${encodeURIComponent(latest.folder)}/zip`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-3)', fontSize: 11,
                  fontFamily: 'var(--font-ui)', textDecoration: 'none', cursor: 'pointer',
                }}
              ><Archive size={10} /> Download all</a>
            </Tooltip>
            <button onClick={refreshClips} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
              <RefreshCw size={11} />
            </button>
          </div>
          {clipGrid(latest.folder, latest.clips)}
        </div>
      )}

      {/* ── Archived folders ──────────────────────────────────────────────── */}
      {archived.length > 0 && (
        <div className="card" style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Older · {archived.length} {archived.length === 1 ? 'video' : 'videos'}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {totalGB.toFixed(2)} GB total
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {archived.map(({ folder, clips, total_mb }, idx) => {
              const open = expanded.has(folder)
              return (
                <div key={folder} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => toggleExpanded(folder)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 9,
                      padding: '10px 0', background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                      <Folder size={13} color={open ? 'var(--accent)' : 'var(--text-3)'} style={{ flexShrink: 0 }} />
                      <span style={{
                        flex: 1, fontSize: 12, fontWeight: 500,
                        color: open ? 'var(--text)' : 'var(--text-2)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={folder}>{folder}</span>
                      <span style={{
                        fontSize: 10, color: 'var(--text-3)',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                        padding: '1px 7px', borderRadius: 99, fontFamily: 'var(--font-mono)', flexShrink: 0,
                      }}>{clips.length}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginRight: 4 }}>{total_mb} MB</span>
                      {open ? <ChevronDown size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />
                            : <ChevronRight size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                    </button>
                    <a
                      href={`/api/clips/${encodeURIComponent(folder)}/zip`}
                      title="Download all as zip"
                      style={{
                        display: 'inline-flex', padding: '3px 6px', borderRadius: 4,
                        background: 'transparent', border: 'none', color: 'var(--text-3)',
                        textDecoration: 'none', marginLeft: 4, flexShrink: 0,
                      }}
                    ><Archive size={11} /></a>
                  </div>

                  {open && (
                    <div style={{ paddingBottom: 14 }}>
                      {clipGrid(folder, clips)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {folders.length === 0 && (
        <div className="card" style={{ padding: '32px 16px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No clips yet — download a video and hit Run</span>
        </div>
      )}

      {playing && (
        <VideoModal folder={playing.folder} clip={playing.clip} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}
