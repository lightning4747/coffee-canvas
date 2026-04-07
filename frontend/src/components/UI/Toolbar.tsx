import React from 'react';
import { useStore, ToolType } from '../../store/useStore';
import { motion } from 'framer-motion';

const TOOLS: { id: ToolType; icon: React.ReactNode; label: string }[] = [
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

const COLORS = [
  '#3d2b1f', // Espresso
  '#6f4e37', // Coffee
  '#c0ffee', // Cyan-ish (Pun)
  '#f3f4f6', // Paper White
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
];

export const Toolbar: React.FC = () => {
  const { activeTool, setActiveTool, brushSettings, setBrushSettings } =
    useStore();

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-8 pointer-events-auto">
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass flex items-center gap-4 p-3 px-6 shadow-2xl"
        style={{ borderRadius: '24px' }}
      >
        {/* Tool Selectors */}
        <div className="flex bg-white/5 p-1 rounded-2xl gap-1">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`p-2.5 rounded-xl transition-all relative ${
                activeTool === tool.id
                  ? 'text-white bg-white/10'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title={tool.label}
            >
              {tool.icon}
              {activeTool === tool.id && (
                <motion.div
                  layoutId="activeTool"
                  className="absolute inset-0 rounded-xl border border-white/20"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-white/10" />

        {/* Color Palette */}
        {activeTool !== 'eraser' && (
          <div className="flex gap-2">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setBrushSettings({ color })}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-125 border ${
                  brushSettings.color === color
                    ? 'border-white scale-110 shadow-lg'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        <div className="w-px h-8 bg-white/10" />

        {/* Brush Size */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="40"
            value={brushSettings.width}
            onChange={e =>
              setBrushSettings({ width: parseInt(e.target.value) })
            }
            className="w-24 accent-violet-500 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-gray-500 w-4">
            {brushSettings.width}
          </span>
        </div>
      </motion.div>
    </div>
  );
};

export default Toolbar;
