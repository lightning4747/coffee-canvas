import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';
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
      const worldPos = screenToWorld(e.clientX, e.clientY);

      if (e.buttons === 1) {
        if (activeTool === 'pour') {
          // Trigger Coffee Pour (Local mock for now)
          const g = new PIXI.Graphics();
          worldContainer.addChild(g);

          // Mimic a stain appearing
          const radius = brushSettings.width * 5;
          const points: Point2D[] = [];
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const r = radius * (0.8 + Math.random() * 0.4);
            points.push({
              x: worldPos.x + Math.cos(angle) * r,
              y: worldPos.y + Math.sin(angle) * r,
            });
          }

          import('./renderers/StainRenderer').then(({ StainRenderer }) => {
            StainRenderer.animateStain(g, points, '#4c3327', 0.6);
          });
          return;
        }

        const graphics = StrokeRenderer.createGraphics();
        worldContainer.addChild(graphics);

        activeStrokeRef.current = {
          graphics,
          points: [worldPos],
        };

        StrokeRenderer.render(graphics, [worldPos], brushSettings);
      }
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
