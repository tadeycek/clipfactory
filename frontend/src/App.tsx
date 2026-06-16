import Clips from './Clips'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      <div style={{ minHeight: '100%', maxWidth: 1440, margin: '0 auto', padding: '0 16px 32px' }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 0', marginBottom: 20,
          background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'var(--accent)', display: 'grid',
            gridTemplateColumns: '1fr 1fr', gap: 3, padding: 6,
          }}>
            {[0.9, 0.35, 0.35, 0.9].map((o, i) => (
              <div key={i} style={{ background: `rgba(255,255,255,${o})`, borderRadius: 1 }} />
            ))}
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-.01em' }}>
            Clip Factory
          </span>
        </header>
        <Clips />
      </div>
    </div>
  )
}
