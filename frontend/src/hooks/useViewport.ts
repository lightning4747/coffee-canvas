import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import * as PIXI from 'pixi.js';

export const useViewport = (
  pixiApp: PIXI.Application | null,
  worldContainer: PIXI.Container | null
) => {
  const { viewport, setViewport, activeTool } = useStore();

  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!pixiApp || !worldContainer) return;
      e.preventDefault();

      const { zoom, x, y } = viewportRef.current;
      const zoomSpeed = 0.001;
      const delta = -e.deltaY * zoomSpeed;
      const newZoom = Math.max(0.1, Math.min(10, zoom + delta));

      // Zoom towards mouse position
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // World coordinates of the mouse before zoom
      const worldMouseX = (mouseX - x) / zoom;
      const worldMouseY = (mouseY - y) / zoom;

      // New viewport offset to keep mouse over the same world coordinate
      const newX = mouseX - worldMouseX * newZoom;
      const newY = mouseY - worldMouseY * newZoom;

      setViewport({ x: newX, y: newY, zoom: newZoom });
    },
    [pixiApp, worldContainer, setViewport]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      // Pan: middle-mouse (buttons=4) on any tool, OR left-drag (buttons=1) when pan tool active
      const isPanGesture =
        e.buttons === 4 ||
        (e.buttons === 1 && (activeTool === 'pan' || activeTool === 'pour'));

      if (isPanGesture) {
        const { x, y } = viewportRef.current;
        setViewport({
          x: x + e.movementX,
          y: y + e.movementY,
        });
      }
    },
    [setViewport, activeTool]
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
