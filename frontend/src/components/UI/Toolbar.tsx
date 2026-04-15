import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { useStore, ToolType, BrushStyleType } from '../../store/useStore';

// ── Tools ────────────────────────────────────────────────────────────────────

interface Tool {
  id: ToolType;
  label: string;
  icon: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    id: 'pan',
    label: 'Pan (Hand)',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M18 11V6a2 2 0 0 0-4 0v5" />
        <path d="M14 10V4a2 2 0 0 0-4 0v2" />
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L8 15" />
      </svg>
    ),
  },
  {
    id: 'pen',
    label: 'Pen',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l5 5" />
        <path d="M11 11l1 1" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: 'Eraser',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" />
        <path d="M17 17L7 7" />
      </svg>
    ),
  },
  {
    id: 'pour',
    label: 'Coffee Pour',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
];

// ── 24-Color Palette ──────────────────────────────────────────────────────────
// Organised into 4 thematic rows: neutrals / warms / cools / vibrants

const COLORS: { hex: string; label: string }[][] = [
  // Row 1 — Neutrals
  [
    { hex: '#ffffff', label: 'White' },
    { hex: '#d1d5db', label: 'Light Grey' },
    { hex: '#9ca3af', label: 'Mid Grey' },
    { hex: '#4b5563', label: 'Dark Grey' },
    { hex: '#1e1e1e', label: 'Near Black' },
    { hex: '#000000', label: 'Black' },
  ],
  // Row 2 — Warms (yellows → oranges → coffee browns → reds)
  [
    { hex: '#fde68a', label: 'Butter' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#ea580c', label: 'Orange' },
    { hex: '#6f4e37', label: 'Coffee' },
    { hex: '#3d2b1f', label: 'Espresso' },
    { hex: '#dc2626', label: 'Red' },
  ],
  // Row 3 — Cools (greens → blues → cyans)
  [
    { hex: '#6ee7b7', label: 'Mint' },
    { hex: '#10b981', label: 'Emerald' },
    { hex: '#0ea5e9', label: 'Sky' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#6366f1', label: 'Indigo' },
    { hex: '#c0ffee', label: 'Cyan' },
  ],
  // Row 4 — Vibrants (purples → pinks → magentas)
  [
    { hex: '#8b5cf6', label: 'Violet' },
    { hex: '#a855f7', label: 'Purple' },
    { hex: '#ec4899', label: 'Pink' },
    { hex: '#f472b6', label: 'Rose' },
    { hex: '#fb7185', label: 'Blush' },
    { hex: '#fbbf24', label: 'Gold' },
  ],
];

// ── Brush Styles ──────────────────────────────────────────────────────────────

interface BrushStyleOption {
  id: BrushStyleType;
  label: string;
  preview: React.ReactNode;
}

const BRUSH_STYLES: BrushStyleOption[] = [
  {
    id: 'round',
    label: 'Round',
    preview: (
      <svg viewBox="0 0 28 10" width="28" height="10">
        <path
          d="M2 5 Q14 2 26 5"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'flat',
    label: 'Flat',
    preview: (
      <svg viewBox="0 0 28 10" width="28" height="10">
        <rect x="2" y="3" width="24" height="4" rx="0" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'marker',
    label: 'Marker',
    preview: (
      <svg viewBox="0 0 28 10" width="28" height="10">
        <rect
          x="2"
          y="2"
          width="24"
          height="6"
          rx="1"
          fill="currentColor"
          opacity="0.45"
        />
        <rect
          x="2"
          y="3"
          width="24"
          height="4"
          rx="0"
          fill="currentColor"
          opacity="0.35"
        />
      </svg>
    ),
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    preview: (
      <svg viewBox="0 0 28 12" width="28" height="12">
        <path
          d="M2 7 Q10 4 26 6"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          opacity="0.15"
        />
        <path
          d="M2 6 Q14 3 26 7"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.15"
        />
        <path
          d="M2 8 Q12 5 26 5"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          opacity="0.2"
        />
      </svg>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const Toolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    brushSettings,
    setBrushSettings,
    brushStyle,
    setBrushStyle,
    roomCode,
    userName,
    userColor,
  } = useStore();

  const colorInputRef = useRef<HTMLInputElement>(null);
  const showColorPalette = activeTool !== 'eraser' && activeTool !== 'pan';

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-5 pointer-events-auto"
      style={{
        transform: 'translateX(-50%)',
        position: 'absolute',
        left: '50%',
        top: '20px',
      }}
    >
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          background: 'rgba(20,20,28,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          pointerEvents: 'auto',
        }}
      >
        {/* Row 1: Color palette + custom picker */}
        {showColorPalette && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {COLORS.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'flex', gap: '5px' }}>
                {row.map(({ hex, label }) => (
                  <button
                    key={hex}
                    id={`color-${hex.replace('#', '')}`}
                    title={label}
                    onClick={() => setBrushSettings({ color: hex })}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: hex,
                      border:
                        brushSettings.color === hex
                          ? '2px solid #8b5cf6'
                          : '1.5px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      transform:
                        brushSettings.color === hex ? 'scale(1.2)' : 'scale(1)',
                      transition: 'transform 0.15s, border-color 0.15s',
                      boxShadow:
                        brushSettings.color === hex
                          ? '0 0 0 2px rgba(139,92,246,0.35)'
                          : 'none',
                      outline: 'none',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.transform =
                        brushSettings.color === hex
                          ? 'scale(1.2)'
                          : 'scale(1.15)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.transform =
                        brushSettings.color === hex ? 'scale(1.2)' : 'scale(1)';
                    }}
                  />
                ))}
                {/* Custom picker — only on last row */}
                {rowIdx === COLORS.length - 1 && (
                  <button
                    id="btn-custom-color"
                    title="Custom color"
                    onClick={() => colorInputRef.current?.click()}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background:
                        'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                      border: '1.5px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      transform: 'scale(1)',
                      transition: 'transform 0.15s',
                      outline: 'none',
                    }}
                    onMouseEnter={e =>
                      ((e.currentTarget as HTMLButtonElement).style.transform =
                        'scale(1.15)')
                    }
                    onMouseLeave={e =>
                      ((e.currentTarget as HTMLButtonElement).style.transform =
                        'scale(1)')
                    }
                  />
                )}
              </div>
            ))}
            <input
              ref={colorInputRef}
              type="color"
              value={brushSettings.color}
              onChange={e => setBrushSettings({ color: e.target.value })}
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                width: 0,
                height: 0,
              }}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Divider */}
        {showColorPalette && (
          <div
            style={{
              width: '100%',
              height: '1px',
              background: 'rgba(255,255,255,0.08)',
            }}
          />
        )}

        {/* Row 2: Tools + brush styles + size slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Tool selector */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              padding: '4px',
              borderRadius: '14px',
              gap: '2px',
            }}
          >
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                id={`tool-${tool.id}`}
                onClick={() => setActiveTool(tool.id)}
                title={tool.label}
                style={{
                  position: 'relative',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background:
                    activeTool === tool.id
                      ? 'rgba(139,92,246,0.25)'
                      : 'transparent',
                  color:
                    activeTool === tool.id
                      ? '#c4b5fd'
                      : 'rgba(255,255,255,0.4)',
                  border:
                    activeTool === tool.id
                      ? '1px solid rgba(139,92,246,0.4)'
                      : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {tool.icon}
                </span>
              </button>
            ))}
          </div>

          {/* Separator */}
          <div
            style={{
              width: '1px',
              height: '32px',
              background: 'rgba(255,255,255,0.08)',
            }}
          />

          {/* Brush style buttons (hidden for pan/eraser) */}
          {showColorPalette && (
            <>
              <div style={{ display: 'flex', gap: '4px' }}>
                {BRUSH_STYLES.map(bs => (
                  <button
                    key={bs.id}
                    id={`brush-${bs.id}`}
                    title={bs.label}
                    onClick={() => setBrushStyle(bs.id)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: '8px',
                      background:
                        brushStyle === bs.id
                          ? 'rgba(139,92,246,0.25)'
                          : 'rgba(255,255,255,0.04)',
                      border:
                        brushStyle === bs.id
                          ? '1px solid rgba(139,92,246,0.4)'
                          : '1px solid rgba(255,255,255,0.08)',
                      color:
                        brushStyle === bs.id
                          ? '#c4b5fd'
                          : 'rgba(255,255,255,0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {bs.preview}
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div
                style={{
                  width: '1px',
                  height: '32px',
                  background: 'rgba(255,255,255,0.08)',
                }}
              />
            </>
          )}

          {/* Brush size slider + live preview dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="brush-size-slider"
              type="range"
              min="1"
              max="40"
              value={brushSettings.width}
              onChange={e =>
                setBrushSettings({ width: parseInt(e.target.value) })
              }
              style={{
                width: '80px',
                accentColor: '#8b5cf6',
                cursor: 'pointer',
              }}
            />
            {/* Live size preview dot */}
            <div
              id="brush-size-preview"
              style={{
                width: `${Math.max(brushSettings.width, 4)}px`,
                height: `${Math.max(brushSettings.width, 4)}px`,
                borderRadius: '50%',
                backgroundColor:
                  activeTool === 'eraser'
                    ? 'rgba(255,255,255,0.3)'
                    : brushSettings.color,
                border:
                  activeTool === 'eraser'
                    ? '1.5px solid rgba(255,255,255,0.5)'
                    : 'none',
                transition: 'width 0.1s, height 0.1s, background-color 0.15s',
                flexShrink: 0,
                minWidth: '4px',
                minHeight: '4px',
                maxWidth: '40px',
                maxHeight: '40px',
              }}
            />
          </div>

          {/* Separator */}
          <div
            style={{
              width: '1px',
              height: '32px',
              background: 'rgba(255,255,255,0.08)',
            }}
          />

          {/* Room and User Identity */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 8px',
            }}
          >
            {roomCode && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.9)',
                  background: 'rgba(255,255,255,0.1)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
              >
                {roomCode}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: userColor || '#8b5cf6',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.7)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {userName || 'Artist'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Toolbar;
