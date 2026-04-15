import {
  CursorPositionPayload,
  Point2D,
  StainResult,
  StrokeBeginPayload,
  StrokeEndPayload,
  StrokeSegmentPayload,
} from '@shared/types';
import { generateId } from '@shared/utils';
import * as PIXI from 'pixi.js';
import React, { useEffect, useRef, useState } from 'react';
import { useCanvas } from '../../hooks/useCanvas';
import { useViewport } from '../../hooks/useViewport';
import { useSocket } from '../../store/SocketContext';
import { useStore } from '../../store/useStore';
import { CursorRenderer } from './renderers/CursorRenderer';
import { StainRenderer } from './renderers/StainRenderer';
import { StrokeRenderer } from './renderers/StrokeRenderer';

console.log('[Canvas] Module evaluating...');

export const Canvas: React.FC = () => {
  console.log('[Canvas] Rendering...');
  // 1. Context & Infrastructure
  const { canvasRef, worldContainer, pixiApp } = useCanvas();
  const { viewport, activeTool, brushSettings, brushStyle } = useStore();
  const {
    emitStrokeBegin,
    emitStrokeSegment,
    emitStrokeEnd,
    emitCoffeePour,
    emitCursorMove,
    socket,
  } = useSocket();
  const [drawingLayer, setDrawingLayer] = useState<PIXI.Container | null>(null);
  const [cursorsLayer, setCursorsLayer] = useState<PIXI.Container | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activeStrokeRef = useRef<{
    id: string;
    graphics: PIXI.Graphics;
    points: { x: number; y: number }[];
  } | null>(null);

  const remoteStrokesRef = useRef<
    Map<
      string,
      {
        graphics: PIXI.Graphics;
        points: { x: number; y: number }[];
        settings: { color: string; width: number; opacity: number };
      }
    >
  >(new Map());

  const remoteCursorsRef = useRef<
    Map<
      string,
      {
        container: PIXI.Container;
        lastUpdate: number;
      }
    >
  >(new Map());

  // 2. Viewport Management
  const { screenToWorld } = useViewport(pixiApp, worldContainer);

  // Initialize the isolated drawing layer inside the world container
  useEffect(() => {
    if (!worldContainer || drawingLayer) return;

    const layer = new PIXI.Container();
    layer.name = 'drawing-layer';
    worldContainer.addChild(layer);
    setDrawingLayer(layer);

    const curLayer = new PIXI.Container();
    curLayer.name = 'cursors-layer';
    worldContainer.addChild(curLayer);
    setCursorsLayer(curLayer);
  }, [worldContainer, drawingLayer, cursorsLayer]);

  useEffect(() => {
    if (worldContainer) {
      worldContainer.position.set(viewport.x, viewport.y);
      worldContainer.scale.set(viewport.zoom, viewport.zoom);
    }
  }, [viewport.x, viewport.y, viewport.zoom, worldContainer]);

  // 3. Remote Event Listeners
  useEffect(() => {
    if (!socket || !drawingLayer) return;

    const handleRemoteStrokeBegin = (payload: StrokeBeginPayload) => {
      if (remoteStrokesRef.current.has(payload.strokeId)) return;

      const graphics = StrokeRenderer.createGraphics();
      if (payload.tool === 'eraser') {
        graphics.blendMode = PIXI.BLEND_MODES.DST_OUT;
      }

      drawingLayer.addChild(graphics);
      remoteStrokesRef.current.set(payload.strokeId, {
        graphics,
        points: [],
        settings: {
          color: payload.color,
          width: payload.width,
          opacity: 1, // Default opacity for remote
        },
      });
    };

    const handleRemoteStrokeSegment = (payload: StrokeSegmentPayload) => {
      const stroke = remoteStrokesRef.current.get(payload.strokeId);
      if (!stroke) return;

      stroke.points.push(...payload.points);

      StrokeRenderer.render(stroke.graphics, stroke.points, stroke.settings);
    };

    const handleRemoteStrokeEnd = (payload: StrokeEndPayload) => {
      // We no longer remove the graphics from the stage.
      // This ensures the stroke stays visible after completion.
      remoteStrokesRef.current.delete(payload.strokeId);
    };

    const handleStainResult = (payload: StainResult) => {
      // 1. Render new stain polygons
      payload.stainPolygons.forEach(stain => {
        const g = StrokeRenderer.createGraphics();
        drawingLayer.addChild(g);
        StainRenderer.animateStain(g, stain.path, stain.color, stain.opacity);
      });

      // 2. Apply mutations to existing strokes (not implemented yet in StrokeRenderer, but possible)
      // For now we just log it as Task 8.2 focus is sync.
      console.log(
        `Received ${payload.strokeMutations.length} stroke mutations`
      );
    };

    const handleRemoteCursorMove = (payload: CursorPositionPayload) => {
      // Ignore self
      const { userId, userName, userColor, position } = payload;
      let remoteCursor = remoteCursorsRef.current.get(userId);

      if (!remoteCursor) {
        if (!cursorsLayer) return;
        const container = CursorRenderer.createCursor(userName, userColor);
        cursorsLayer.addChild(container);
        remoteCursor = { container, lastUpdate: Date.now() };
        remoteCursorsRef.current.set(userId, remoteCursor);
      }

      remoteCursor.lastUpdate = Date.now();
      CursorRenderer.updatePosition(
        remoteCursor.container,
        position.x,
        position.y
      );
    };

    socket.on('stroke_begin', handleRemoteStrokeBegin);
    socket.on('stroke_segment', handleRemoteStrokeSegment);
    socket.on('stroke_end', handleRemoteStrokeEnd);
    socket.on('stain_result', handleStainResult);
    socket.on('cursor_move', handleRemoteCursorMove);

    return () => {
      socket.off('stroke_begin', handleRemoteStrokeBegin);
      socket.off('stroke_segment', handleRemoteStrokeSegment);
      socket.off('stroke_end', handleRemoteStrokeEnd);
      socket.off('stain_result', handleStainResult);
      socket.off('cursor_move', handleRemoteCursorMove);
    };
  }, [socket, drawingLayer, cursorsLayer]);

  // 4. User Interaction Handlers
  useEffect(() => {
    const canvas = pixiApp?.view as HTMLCanvasElement;
    if (!canvas || !drawingLayer) return;

    const handlePointerDown = (e: PointerEvent) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (e.buttons !== 1) return;

      // Pan tool — let useViewport handle it, don't draw
      if (activeTool === 'pan') {
        setIsDragging(true);
        return;
      }

      // Handle Coffee Pour Interaction
      if (activeTool === 'pour') {
        const g = StrokeRenderer.createGraphics();
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
        StainRenderer.animateStain(g, points, '#4c3327', 0.65);

        // Emit coffee_pour
        emitCoffeePour({
          pourId: generateId('pour'),
          origin: worldPos,
          intensity: brushSettings.width,
        });
        return;
      }

      // Handle Drawing (Pen / Eraser - Task 7.2)
      const graphics = StrokeRenderer.createGraphics();

      // Subtractive mode for Eraser
      if (activeTool === 'eraser') {
        graphics.blendMode = PIXI.BLEND_MODES.DST_OUT;
      }

      drawingLayer.addChild(graphics);

      const strokeId = generateId('stroke');
      activeStrokeRef.current = {
        id: strokeId,
        graphics,
        points: [worldPos],
      };

      StrokeRenderer.render(graphics, [worldPos], {
        ...brushSettings,
        brushStyle,
      });

      // Emit stroke_begin
      emitStrokeBegin({
        strokeId,
        tool: activeTool,
        color: brushSettings.color,
        width: brushSettings.width,
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!activeStrokeRef.current) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      activeStrokeRef.current.points.push(worldPos);

      StrokeRenderer.render(
        activeStrokeRef.current.graphics,
        activeStrokeRef.current.points,
        { ...brushSettings, brushStyle }
      );

      // Emit stroke_segment
      emitStrokeSegment({
        strokeId: activeStrokeRef.current.id,
        points: [worldPos],
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      if (!activeStrokeRef.current) return;

      // Emit stroke_end
      emitStrokeEnd({
        strokeId: activeStrokeRef.current.id,
      });

      activeStrokeRef.current = null;
    };

    const handleGeneralPointerMove = (e: PointerEvent) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      emitCursorMove({ position: worldPos });
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointermove', handleGeneralPointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointermove', handleGeneralPointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    pixiApp,
    drawingLayer,
    screenToWorld,
    activeTool,
    brushSettings,
    emitCursorMove,
    emitStrokeBegin,
    emitStrokeSegment,
    emitStrokeEnd,
    emitCoffeePour,
  ]);

  // 5. Cleanup Inactive Cursors
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      remoteCursorsRef.current.forEach((data, userId) => {
        if (now - data.lastUpdate > 60000) {
          // 60 seconds timeout
          if (cursorsLayer && data.container.parent) {
            cursorsLayer.removeChild(data.container);
            data.container.destroy({ children: true });
          }
          remoteCursorsRef.current.delete(userId);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [cursorsLayer]);

  // 6. Viewport Culling (Phase 10.2)
  useEffect(() => {
    if (!drawingLayer || !pixiApp) return;

    // Viewport bounds in world coordinates
    const worldLeft = -viewport.x / viewport.zoom;
    const worldTop = -viewport.y / viewport.zoom;
    const worldWidth = pixiApp.screen.width / viewport.zoom;
    const worldHeight = pixiApp.screen.height / viewport.zoom;
    const worldRight = worldLeft + worldWidth;
    const worldBottom = worldTop + worldHeight;

    const buffer = 100 / viewport.zoom; // 100px buffer in world units

    drawingLayer.children.forEach(child => {
      // Use getLocalBounds for efficiency as children of drawingLayer are in world space
      const bounds = child.getLocalBounds();
      const isVisible =
        bounds.right >= worldLeft - buffer &&
        bounds.left <= worldRight + buffer &&
        bounds.bottom >= worldTop - buffer &&
        bounds.top <= worldBottom + buffer;

      child.visible = isVisible;
    });
  }, [viewport, drawingLayer, pixiApp]);

  // Compute CSS cursor based on active tool
  const getCursor = () => {
    if (activeTool === 'pan') return isDragging ? 'grabbing' : 'grab';
    if (activeTool === 'pen') return 'crosshair';
    if (activeTool === 'pour') return 'cell';
    if (activeTool === 'eraser') {
      // SVG circle sized to brush width (min 8px so it's always clickable)
      const r = Math.max(brushSettings.width / 2, 4);
      const d = r * 2;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r}' cy='${r}' r='${r - 1}' fill='none' stroke='%23666' stroke-width='1.5'/></svg>`;
      return `url("data:image/svg+xml,${svg}") ${r} ${r}, crosshair`;
    }
    return 'default';
  };

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
        cursor: getCursor(),
      }}
    />
  );
};

export default Canvas;
