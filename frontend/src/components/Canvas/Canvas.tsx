import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';
import { useCanvas } from '../../hooks/useCanvas';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../store/useStore';
import { StrokeRenderer } from './renderers/StrokeRenderer';
import { useSocket } from '../../store/SocketContext';
import { generateId } from '@shared/utils';
import {
  StrokeBeginPayload,
  StrokeSegmentPayload,
  StrokeEndPayload,
  StainResult,
  CursorPositionPayload,
} from '@shared/types';
import { StainRenderer } from './renderers/StainRenderer';
import { CursorRenderer } from './renderers/CursorRenderer';

export const Canvas: React.FC = () => {
  // 1. Context & Infrastructure
  const { canvasRef, worldContainer, pixiApp } = useCanvas();
  const { viewport, activeTool, brushSettings } = useStore();
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
      remoteStrokesRef.current.delete(payload.strokeId);
    };

    const handleStainResult = (payload: StainResult) => {
      // 1. Render new stain polygons
      payload.stainPolygons.forEach(stain => {
        const g = new PIXI.Graphics();
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

      StrokeRenderer.render(graphics, [worldPos], brushSettings);

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
        brushSettings
      );

      // Emit stroke_segment
      emitStrokeSegment({
        strokeId: activeStrokeRef.current.id,
        points: [worldPos],
      });
    };

    const handlePointerUp = () => {
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
  ]);

  // 5. Cleanup Inactive Cursors
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      remoteCursorsRef.current.forEach((data, userId) => {
        if (now - data.lastUpdate > 5000) {
          // 5 seconds timeout
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
