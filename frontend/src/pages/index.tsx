import dynamic from 'next/dynamic';
import React from 'react';
import { Toolbar } from '../components/UI/Toolbar';

// Use dynamic import for Canvas to avoid SSR issues with PixiJS
const Canvas = dynamic(() => import('../components/Canvas/Canvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#f3f4f6',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <p>Initializing Canvas...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* The main drawing surface */}
      <Canvas />

      {/* Layered UI Container */}
      <div
        id="ui-container"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <Toolbar />

        <header
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 24px',
            pointerEvents: 'auto',
          }}
          className="glass transition-all"
        >
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 700,
              background: 'linear-gradient(to right, #8b5cf6, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Coffee & Canvas
          </h1>
          <div
            style={{
              width: '1px',
              height: '16px',
              backgroundColor: 'rgba(255,255,255,0.1)',
            }}
          />
          <p
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            v1.0.0 Alpha
          </p>
        </header>

        {/* Footer info or room info placeholder */}
        <footer
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
            pointerEvents: 'none',
          }}
        >
          Powered by PixiJS & Go Physics | [Phase 7 Execution]
        </footer>
      </div>
    </main>
  );
}
