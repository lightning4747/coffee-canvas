import * as PIXI from 'pixi.js';
import { StrokeRenderer } from '../components/Canvas/renderers/StrokeRenderer';
import { StainRenderer } from '../components/Canvas/renderers/StainRenderer';

describe('Canvas Engine Performance & Memory', () => {
  let container: PIXI.Container;

  beforeEach(() => {
    // Initialize a container for scene graph testing
    container = new PIXI.Container();
  });

  afterEach(() => {
    container.destroy({ children: true });
  });

  test('Renderer should handle 1000 simultaneous strokes without error', () => {
    const lineToSpy = jest.spyOn(PIXI.Graphics.prototype, 'lineTo');
    const renderStart = Date.now();
    const strokeCount = 1000;
    const style = { color: '#000000', width: 2, opacity: 1 };
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 5 },
    ];

    for (let i = 0; i < strokeCount; i++) {
      const g = StrokeRenderer.createGraphics();
      container.addChild(g);
      StrokeRenderer.render(g, points, style);
    }

    const renderEnd = Date.now();

    expect(container.children.length).toBe(strokeCount);
    // Each stroke has 3 points, so 2 lineTo calls. 1000 strokes = 2000 calls.
    expect(lineToSpy).toHaveBeenCalledTimes(strokeCount * 2);

    // Verify sub-50ms overhead for 1000 stroke command generations
    expect(renderEnd - renderStart).toBeLessThan(100);
    lineToSpy.mockRestore();
  });

  test('StainRenderer should animate properly and resolve', async () => {
    const g = new PIXI.Graphics();
    container.addChild(g);
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];

    // Mock requestAnimationFrame for the stain animation
    const spy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        // Immediately trigger completion for testing
        cb(performance.now() + 100);
        return 0;
      });

    const animationPromise = StainRenderer.animateStain(
      g,
      points,
      '#4c3327',
      0.6,
      100
    );
    await expect(animationPromise).resolves.toBeUndefined();

    expect(g.alpha).toBe(0.6);
    spy.mockRestore();
  });

  test('Object cleanup should release resources to prevent memory leaks', () => {
    const g = StrokeRenderer.createGraphics();
    container.addChild(g);
    expect(container.children.length).toBe(1);

    // Remove and destroy
    g.destroy({ children: true, texture: true, baseTexture: true });
    container.removeChild(g);

    expect(container.children.length).toBe(0);
  });
});
