import React, { useEffect } from 'react';
import { useCanvas } from '../../hooks/useCanvas';
import { useViewport } from '../../hooks/useViewport';
import { useStore } from '../../store/useStore';

export const Canvas: React.FC = () => {
  const { canvasRef, worldContainer, pixiApp } = useCanvas();
  const { viewport } = useStore();

  // Initialize viewport interactions (pan/zoom)
  useViewport(pixiApp, worldContainer);

  // Sync viewport store with PixiJS world container
  useEffect(() => {
    if (worldContainer) {
      worldContainer.position.set(viewport.x, viewport.y);
      worldContainer.scale.set(viewport.zoom, viewport.zoom);
    }
  }, [viewport.x, viewport.y, viewport.zoom, worldContainer]);

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
