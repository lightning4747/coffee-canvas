import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';
import { useCanvas } from '../../hooks/useCanvas';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../store/useStore';
import { StrokeRenderer } from './renderers/StrokeRenderer';

export const Canvas: React.FC = () => {
  // 1. Context & Infrastructure
  const { canvasRef, worldContainer, pixiApp } = useCanvas();
  const { viewport, activeTool, brushSettings } = useStore();
  const [drawingLayer, setDrawingLayer] = useState<PIXI.Container | null>(null);

  const activeStrokeRef = useRef<{
    graphics: PIXI.Graphics;
    points: { x: number; y: number }[];
  } | null>(null);

  // 2. Viewport Management
  const { screenToWorld } = useViewport(pixiApp, worldContainer);

  // Initialize the isolated drawing layer inside the world container
  useEffect(() => {
    if (!worldContainer || drawingLayer) return;

    const layer = new PIXI.Container();
    layer.name = 'drawing-layer';
    worldContainer.addChild(layer);
    setDrawingLayer(layer);
  }, [worldContainer, drawingLayer]);

  // Sync viewport state with PixiJS world container
  useEffect(() => {
    if (worldContainer) {
      worldContainer.position.set(viewport.x, viewport.y);
      worldContainer.scale.set(viewport.zoom, viewport.zoom);
    }
  }, [viewport.x, viewport.y, viewport.zoom, worldContainer]);

  // 3. User Interaction Handlers
  useEffect(() => {
    const canvas = pixiApp?.view as HTMLCanvasElement;
    if (!canvas || !drawingLayer) return;

    const handlePointerDown = (e: PointerEvent) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (e.buttons !== 1) return;

      // Handle Coffee Pour Interaction (Task 7.3)
      if (activeTool === 'pour') {
        const g = new PIXI.Graphics();
        drawingLayer.addChild(g);

        // Generate organic splatter pattern
        const radius = brushSettings.width * 5;
        const points: Point2D[] = [];
        const segments = 12;
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const r = radius * (0.8 + Math.random() * 0.4);
          points.push({
            x: worldPos.x + Math.cos(angle) * r,
            y: worldPos.y + Math.sin(angle) * r,
          });
        }

        // Animate expansion
        import('./renderers/StainRenderer').then(({ StainRenderer }) => {
          StainRenderer.animateStain(g, points, '#4c3327', 0.65);
        });
        return;
      }

      // Handle Drawing (Pen / Eraser - Task 7.2)
      const graphics = StrokeRenderer.createGraphics();

      // Subtractive mode for Eraser
      if (activeTool === 'eraser') {
        graphics.blendMode = PIXI.BLEND_MODES.ERASE;
      }

      drawingLayer.addChild(graphics);
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
  }, [pixiApp, drawingLayer, screenToWorld, activeTool, brushSettings]);

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
        cursor: activeTool === 'eraser' ? 'cell' : 'crosshair',
        backgroundColor: '#1a1a1a',
      }}
    />
  );
};

export default Canvas;
