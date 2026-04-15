import { create } from 'zustand';

export type ToolType = 'pan' | 'pen' | 'eraser' | 'pour';
export type BrushStyleType = 'round' | 'flat' | 'marker' | 'watercolor';

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

  // Brush Style
  brushStyle: BrushStyleType;
  setBrushStyle: (style: BrushStyleType) => void;

  // Viewport Position & Zoom
  viewport: ViewportState;
  setViewport: (viewport: Partial<ViewportState>) => void;

  // Room & User Info (populated after lobby auth)
  roomId: string | null;
  userId: string | null;
  userName: string | null;
  userColor: string | null;
  token: string | null;
  setRoomInfo: (
    roomId: string,
    userId: string,
    userName: string,
    userColor: string,
    token: string
  ) => void;
  clearRoomInfo: () => void;
}

export const useStore = create<AppState>(set => ({
  activeTool: 'pen',
  setActiveTool: tool => set({ activeTool: tool }),

  brushSettings: {
    color: '#1e1e1e', // Near-black — legible on white canvas
    width: 4,
    opacity: 0.9,
  },
  setBrushSettings: settings =>
    set(state => ({ brushSettings: { ...state.brushSettings, ...settings } })),

  brushStyle: 'round',
  setBrushStyle: style => set({ brushStyle: style }),

  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  setViewport: viewport =>
    set(state => ({ viewport: { ...state.viewport, ...viewport } })),

  roomId: null,
  userId: null,
  userName: null,
  userColor: null,
  token: null,
  setRoomInfo: (roomId, userId, userName, userColor, token) =>
    set({ roomId, userId, userName, userColor, token }),
  clearRoomInfo: () =>
    set({
      roomId: null,
      userId: null,
      userName: null,
      userColor: null,
      token: null,
    }),
}));
