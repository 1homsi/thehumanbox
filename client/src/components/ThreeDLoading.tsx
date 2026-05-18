
export function ThreeDLoading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(ellipse at center, #1a1810 0%, #0a0806 70%)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 200,
        fontFamily: 'monospace',
        color: '#d8c89a',
      }}
    >
      <style>{`
        @keyframes thb-3d-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes thb-3d-pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1;   }
        }
        @keyframes thb-3d-shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: 200px 0;  }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div
          style={{
            position: 'relative',
            width: 72,
            height: 72,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid rgba(216, 200, 154, 0.15)',
              borderTopColor: '#d8c89a',
              borderRadius: '50%',
              animation: 'thb-3d-spin 1.1s linear infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 14,
              border: '2px solid rgba(216, 200, 154, 0.10)',
              borderBottomColor: '#a8956a',
              borderRadius: '50%',
              animation: 'thb-3d-spin 1.6s linear infinite reverse',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 28,
              background: '#d8c89a',
              borderRadius: '50%',
              animation: 'thb-3d-pulse 1.4s ease-in-out infinite',
            }}
          />
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, letterSpacing: 2, opacity: 0.95 }}>
          ENTERING 3D WORLD
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: '#988566',
            maxWidth: 280,
            lineHeight: 1.5,
            animation: 'thb-3d-pulse 2s ease-in-out infinite',
          }}
        >
          loading terrain meshes, biome textures, organism
          sprites… ~1 MB on first visit, cached thereafter.
        </div>
        <div
          style={{
            width: 220,
            height: 3,
            borderRadius: 2,
            background:
              'linear-gradient(90deg, transparent 0%, #d8c89a 50%, transparent 100%)',
            backgroundSize: '200px 100%',
            animation: 'thb-3d-shimmer 1.6s linear infinite',
          }}
        />
      </div>
    </div>
  )
}
