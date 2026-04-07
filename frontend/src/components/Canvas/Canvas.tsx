import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { useCanvas } from '../../hooks/useCanvas';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../store/useStore';
import { StrokeRenderer } from './renderers/StrokeRenderer';

export const Canvas: React.FC = () => {
  const { canvasRef, worldContainer, pixiApp } = useCanvas();
  const { viewport, activeTool, brushSettings } = useStore();
  const activeStrokeRef = useRef<{
    graphics: PIXI.Graphics;
    points: { x: number; y: number }[];
  } | null>(null);

  // Initialize viewport interactions (pan/zoom)
  const { screenToWorld } = useViewport(pixiApp, worldContainer);

  // Sync viewport store with PixiJS world container
  useEffect(() => {
    if (worldContainer) {
      worldContainer.position.set(viewport.x, viewport.y);
      worldContainer.scale.set(viewport.zoom, viewport.zoom);
    }
  }, [viewport.x, viewport.y, viewport.zoom, worldContainer]);

  // Drawing Event Handlers
  useEffect(() => {
    const canvas = pixiApp?.view as HTMLCanvasElement;
    if (!canvas || !worldContainer) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.buttons !== 1 || activeTool === 'pour') return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      const graphics = StrokeRenderer.createGraphics();
      worldContainer.addChild(graphics);

      activeStrokeRef.current = {
        graphics,
        points: [worldPos],
      };

      StrokeRenderer.render(graphics, [worldPos], brushSettings);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!activeStrokeRef.current) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      activeStrokeRef.current.points.push(worldPos);

      StrokeRenderer.render(
        activeStrokeRef.current.graphics,
        activeStrokeRef.current.points,
        brushSettings
      );
    };

    const handlePointerUp = () => {
      if (!activeStrokeRef.current) return;

      // Finalize stroke (Phase 8 will send to server)
      // For now, we just leave it on the worldContainer
      activeStrokeRef.current = null;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pixiApp, worldContainer, screenToWorld, activeTool, brushSettings]);

  return (
    <div
      ref={canvasRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        cursor: 'crosshair',
        backgroundColor: '#1a1a1a',
      }}
    />
  );
};

export default Canvas;
