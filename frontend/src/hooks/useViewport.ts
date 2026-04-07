import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import * as PIXI from 'pixi.js';

export const useViewport = (
  pixiApp: PIXI.Application | null,
  worldContainer: PIXI.Container | null
) => {
  const { viewport, setViewport, activeTool } = useStore();

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!pixiApp || !worldContainer) return;

      const zoomSpeed = 0.001;
      const delta = -e.deltaY * zoomSpeed;
      const newZoom = Math.max(0.1, Math.min(10, viewport.zoom + delta));

      // Zoom towards mouse position
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // World coordinates of the mouse before zoom
      const worldMouseX = (mouseX - viewport.x) / viewport.zoom;
      const worldMouseY = (mouseY - viewport.y) / viewport.zoom;

      // New viewport offset to keep mouse over the same world coordinate
      const newX = mouseX - worldMouseX * newZoom;
      const newY = mouseY - worldMouseY * newZoom;

      setViewport({ x: newX, y: newY, zoom: newZoom });
    },
    [pixiApp, worldContainer, viewport, setViewport]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      // Logic for panning (e.g., if middle click is held or special key)
      if (e.buttons === 4 || (e.buttons === 1 && activeTool === 'pour')) {
        // Simple panning for now if middle button (4) or left button in certain modes
        // But for "Infinite Canvas", we usually want space+drag or middle drag
        // Let's implement middle-drag panning
        setViewport({
          x: viewport.x + e.movementX,
          y: viewport.y + e.movementY,
        });
      }
    },
    [viewport, setViewport, activeTool]
  );

  useEffect(() => {
    const canvas = pixiApp?.view as HTMLCanvasElement;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('pointermove', handlePointerMove);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [pixiApp, handleWheel, handlePointerMove]);

  // Coordinate Conversion Utilities
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: (screenX - viewport.x) / viewport.zoom,
        y: (screenY - viewport.y) / viewport.zoom,
      };
    },
    [viewport]
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: worldX * viewport.zoom + viewport.x,
        y: worldY * viewport.zoom + viewport.y,
      };
    },
    [viewport]
  );

  return { screenToWorld, worldToScreen };
};
