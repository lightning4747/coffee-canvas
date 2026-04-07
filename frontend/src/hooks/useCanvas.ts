import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

export interface UseCanvasResult {
  pixiApp: PIXI.Application | null;
  canvasRef: React.RefObject<HTMLDivElement>;
  worldContainer: PIXI.Container | null;
}

export const useCanvas = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pixiApp, setPixiApp] = useState<PIXI.Application | null>(null);
  const [worldContainer, setWorldContainer] = useState<PIXI.Container | null>(
    null
  );

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize PixiJS Application
    const app = new PIXI.Application({
      antialias: true,
      backgroundColor: 0x1a1a1a, // Dark grey background
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: canvasRef.current,
    });

    // Create a container for the world (the infinite canvas)
    const world = new PIXI.Container();
    app.stage.addChild(world);

    // Initial positioning: center the world
    world.position.set(app.screen.width / 2, app.screen.height / 2);

    // Attach to DOM
    canvasRef.current.appendChild(app.view as unknown as HTMLCanvasElement);

    setPixiApp(app);
    setWorldContainer(world);

    // Resize handler
    const handleResize = () => {
      app.resize();
      // Re-center if needed, or maintain relative position
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  return { pixiApp, canvasRef, worldContainer };
};
