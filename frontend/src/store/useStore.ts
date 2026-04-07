import { create } from 'zustand';

export type ToolType = 'pen' | 'eraser' | 'pour';

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface BrushSettings {
  color: string;
  width: number;
  opacity: number;
}

interface AppState {
  // Tool Selection
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Brush Settings
  brushSettings: BrushSettings;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;

  // Viewport Position & Zoom
  viewport: ViewportState;
  setViewport: (viewport: Partial<ViewportState>) => void;

  // Room Info (Placeholder for Phase 8)
  roomId: string | null;
  userId: string | null;
  setRoomInfo: (roomId: string, userId: string) => void;
}

export const useStore = create<AppState>(set => ({
  activeTool: 'pen',
  setActiveTool: tool => set({ activeTool: tool }),

  brushSettings: {
    color: '#3d2b1f', // Coffee brown default
    width: 4,
    opacity: 0.8,
  },
  setBrushSettings: settings =>
    set(state => ({ brushSettings: { ...state.brushSettings, ...settings } })),

  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  setViewport: viewport =>
    set(state => ({ viewport: { ...state.viewport, ...viewport } })),

  roomId: null,
  userId: null,
  setRoomInfo: (roomId, userId) => set({ roomId, userId }),
}));
