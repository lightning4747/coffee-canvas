import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { createRoom, joinRoom } from '../lib/graphql';
import { useStore } from '../store/useStore';

type Mode = 'home' | 'create' | 'join';

export default function Lobby() {
  const router = useRouter();
  const { setRoomInfo } = useStore();

  const [mode, setMode] = useState<Mode>('home');
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await createRoom(roomName || undefined);
      setRoomInfo(
        payload.room.id,
        payload.room.code,
        payload.user.id,
        payload.user.displayName,
        payload.user.color,
        payload.token
      );
      // Persist to localStorage for route guard on canvas page
      localStorage.setItem('cc_token', payload.token);
      localStorage.setItem('cc_roomId', payload.room.id);
      localStorage.setItem('cc_roomCode', payload.room.code);
      localStorage.setItem('cc_userId', payload.user.id);
      localStorage.setItem('cc_userName', payload.user.displayName);
      localStorage.setItem('cc_userColor', payload.user.color);
      router.push(`/canvas/${payload.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== 6) {
      setError('Room code must be exactly 6 characters');
      return;
    }
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await joinRoom(roomCode, displayName.trim());
      setRoomInfo(
        payload.room.id,
        payload.room.code,
        payload.user.id,
        payload.user.displayName,
        payload.user.color,
        payload.token
      );
      localStorage.setItem('cc_token', payload.token);
      localStorage.setItem('cc_roomId', payload.room.id);
      localStorage.setItem('cc_roomCode', payload.room.code);
      localStorage.setItem('cc_userId', payload.user.id);
      localStorage.setItem('cc_userName', payload.user.displayName);
      localStorage.setItem('cc_userColor', payload.user.color);
      router.push(`/canvas/${payload.room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Coffee &amp; Canvas — Collaborative Drawing</title>
        <meta
          name="description"
          content="Create or join a collaborative drawing room on Coffee & Canvas"
        />
      </Head>

      <div className="lobby-root">
        {/* Animated background blobs */}
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />

        <main className="lobby-main">
          {/* Hero */}
          <div className="hero">
            <div className="steam-wrap">
              <span className="steam s1" />
              <span className="steam s2" />
              <span className="steam s3" />
            </div>
            <div className="coffee-cup">☕</div>
            <h1 className="logo-text">Coffee &amp; Canvas</h1>
            <p className="tagline">
              Real-time collaborative drawing, brewed together.
            </p>
          </div>

          {/* Card */}
          <div className="lobby-card">
            {mode === 'home' && (
              <div className="home-actions">
                <button
                  id="btn-create-room"
                  className="action-btn primary"
                  onClick={() => {
                    setMode('create');
                    setError('');
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Create a Room
                </button>
                <button
                  id="btn-join-room"
                  className="action-btn secondary"
                  onClick={() => {
                    setMode('join');
                    setError('');
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Join a Room
                </button>
              </div>
            )}

            {mode === 'create' && (
              <form className="room-form" onSubmit={handleCreate}>
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => {
                    setMode('home');
                    setError('');
                  }}
                >
                  ← Back
                </button>
                <h2>Create a Room</h2>
                <p className="form-hint">
                  A unique 6-character code will be generated for others to
                  join.
                </p>

                <label className="field-label" htmlFor="room-name">
                  Room name <span className="optional">(optional)</span>
                </label>
                <input
                  id="room-name"
                  className="field-input"
                  type="text"
                  placeholder="e.g. Friday Sketches"
                  maxLength={64}
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                />

                {error && <p className="form-error">{error}</p>}

                <button
                  id="btn-create-submit"
                  className="action-btn primary full"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Creating…' : 'Create & Enter Canvas'}
                </button>
              </form>
            )}

            {mode === 'join' && (
              <form className="room-form" onSubmit={handleJoin}>
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => {
                    setMode('home');
                    setError('');
                  }}
                >
                  ← Back
                </button>
                <h2>Join a Room</h2>
                <p className="form-hint">
                  Enter the 6-character code shared by the room creator.
                </p>

                <label className="field-label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="field-input code-input"
                  type="text"
                  placeholder="ABC123"
                  maxLength={6}
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                />

                <label className="field-label" htmlFor="display-name">
                  Your display name
                </label>
                <input
                  id="display-name"
                  className="field-input"
                  type="text"
                  placeholder="e.g. Alice"
                  maxLength={32}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />

                {error && <p className="form-error">{error}</p>}

                <button
                  id="btn-join-submit"
                  className="action-btn primary full"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Joining…' : 'Join Canvas'}
                </button>
              </form>
            )}
          </div>

          <p className="anon-notice">
            No account required — all sessions are anonymous.
          </p>
        </main>

        <style jsx>{`
          /* ── Root & Background ── */
          .lobby-root {
            min-height: 100vh;
            background: radial-gradient(
              ellipse at 20% 10%,
              #1a0a2e 0%,
              #0d0d1a 60%,
              #0a0a0a 100%
            );
            display: flex;
            align-items: center;
            justify-content: center;
            font-family:
              Inter,
              -apple-system,
              sans-serif;
            position: relative;
            overflow: hidden;
          }

          /* Decorative blobs */
          .blob {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.18;
            pointer-events: none;
          }
          .blob-1 {
            width: 500px;
            height: 500px;
            background: #8b5cf6;
            top: -100px;
            left: -100px;
            animation: drift 18s ease-in-out infinite alternate;
          }
          .blob-2 {
            width: 400px;
            height: 400px;
            background: #6366f1;
            bottom: -80px;
            right: -80px;
            animation: drift 22s ease-in-out infinite alternate-reverse;
          }
          .blob-3 {
            width: 300px;
            height: 300px;
            background: #6f4e37;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation: drift 14s ease-in-out infinite alternate;
          }
          @keyframes drift {
            from {
              transform: translate(0, 0) scale(1);
            }
            to {
              transform: translate(40px, 30px) scale(1.1);
            }
          }

          /* ── Layout ── */
          .lobby-main {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 32px;
            padding: 24px;
            width: 100%;
            max-width: 440px;
          }

          /* ── Hero ── */
          .hero {
            text-align: center;
            position: relative;
          }
          .steam-wrap {
            position: relative;
            height: 40px;
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-bottom: -8px;
          }
          .steam {
            display: block;
            width: 6px;
            border-radius: 10px;
            background: linear-gradient(
              to top,
              rgba(255, 255, 255, 0.4),
              transparent
            );
            animation: steam-rise 2.4s ease-in-out infinite;
          }
          .s1 {
            height: 28px;
            animation-delay: 0s;
          }
          .s2 {
            height: 38px;
            animation-delay: 0.4s;
          }
          .s3 {
            height: 22px;
            animation-delay: 0.8s;
          }
          @keyframes steam-rise {
            0% {
              opacity: 0;
              transform: translateY(0) scaleX(1);
            }
            40% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translateY(-32px) scaleX(1.6);
            }
          }
          .coffee-cup {
            font-size: 56px;
            line-height: 1;
            margin-bottom: 12px;
            filter: drop-shadow(0 4px 24px rgba(111, 78, 55, 0.6));
          }
          .logo-text {
            font-size: 36px;
            font-weight: 800;
            letter-spacing: -0.04em;
            background: linear-gradient(
              135deg,
              #c4b5fd 0%,
              #818cf8 50%,
              #6f4e37 100%
            );
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
          }
          .tagline {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.45);
            letter-spacing: 0.01em;
          }

          /* ── Card ── */
          .lobby-card {
            width: 100%;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            backdrop-filter: blur(16px);
            padding: 32px;
          }

          /* ── Home Mode ── */
          .home-actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          /* ── Buttons ── */
          .action-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 24px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition:
              transform 0.15s,
              box-shadow 0.15s,
              opacity 0.15s;
          }
          .action-btn svg {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
          }
          .action-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          }
          .action-btn:active:not(:disabled) {
            transform: translateY(0);
          }
          .action-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .action-btn.primary {
            background: linear-gradient(135deg, #8b5cf6, #6366f1);
            color: #fff;
          }
          .action-btn.secondary {
            background: rgba(255, 255, 255, 0.07);
            color: rgba(255, 255, 255, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.12);
          }
          .action-btn.full {
            width: 100%;
            margin-top: 8px;
          }

          /* ── Form ── */
          .room-form {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .back-btn {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.45);
            font-size: 13px;
            cursor: pointer;
            padding: 0;
            margin-bottom: 4px;
            text-align: left;
            transition: color 0.15s;
          }
          .back-btn:hover {
            color: rgba(255, 255, 255, 0.8);
          }
          .room-form h2 {
            font-size: 20px;
            font-weight: 700;
            color: #f3f4f6;
            letter-spacing: -0.02em;
            margin-bottom: 2px;
          }
          .form-hint {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 12px;
          }
          .field-label {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.6);
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin-top: 8px;
          }
          .optional {
            font-weight: 400;
            color: rgba(255, 255, 255, 0.3);
            text-transform: none;
            letter-spacing: 0;
          }
          .field-input {
            width: 100%;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 11px 14px;
            font-size: 15px;
            color: #f3f4f6;
            outline: none;
            transition:
              border-color 0.2s,
              background 0.2s;
            margin-top: 4px;
          }
          .field-input::placeholder {
            color: rgba(255, 255, 255, 0.25);
          }
          .field-input:focus {
            border-color: #8b5cf6;
            background: rgba(139, 92, 246, 0.08);
          }
          .code-input {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            letter-spacing: 0.2em;
            font-size: 20px;
            text-align: center;
            text-transform: uppercase;
          }
          .form-error {
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 13px;
            color: #fca5a5;
            margin-top: 4px;
          }

          /* ── Footer notice ── */
          .anon-notice {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.25);
            text-align: center;
          }
        `}</style>
      </div>
    </>
  );
}
