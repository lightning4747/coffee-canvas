import { renderHook } from '@testing-library/react';
import { useViewport } from '../hooks/useViewport';
import { useStore } from '../store/useStore';

// Mock the store
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

describe('useViewport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStore as any).mockReturnValue({
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
      },
      setViewport: jest.fn(),
    });
  });

  it('should transform screen coordinates to world coordinates (scale: 1, pan: 0)', () => {
    const { result } = renderHook(() => useViewport(null, null));
    const worldPos = result.current.screenToWorld(100, 100);
    expect(worldPos).toEqual({ x: 100, y: 100 });
  });

  it('should transform screen coordinates to world coordinates with panning', () => {
    (useStore as any).mockReturnValue({
      viewport: {
        x: -50,
        y: -50,
        zoom: 1,
      },
    });

    const { result } = renderHook(() => useViewport(null, null));
    const worldPos = result.current.screenToWorld(100, 100);
    expect(worldPos).toEqual({ x: 150, y: 150 });
  });

  it('should transform screen coordinates to world coordinates with scaling', () => {
    (useStore as any).mockReturnValue({
      viewport: {
        x: 0,
        y: 0,
        zoom: 2,
      },
    });

    const { result } = renderHook(() => useViewport(null, null));
    const worldPos = result.current.screenToWorld(100, 100);
    expect(worldPos).toEqual({ x: 50, y: 50 });
  });

  it('should transform world coordinates to screen coordinates', () => {
    (useStore as any).mockReturnValue({
      viewport: {
        x: -100,
        y: -100,
        zoom: 2,
      },
    });

    const { result } = renderHook(() => useViewport(null, null));
    const screenPos = result.current.worldToScreen(50, 50);
    // (50 * 2) + (-100) = 0
    expect(screenPos).toEqual({ x: 0, y: 0 });
  });
});
