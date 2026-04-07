import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';

export class StainRenderer {
  /**
   * Renders a stain polygon on a PIXI.Graphics object.
   */
  static render(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: string,
    opacity: number
  ) {
    if (points.length < 3) return;

    graphics.clear();
    const colorNum = parseInt(color.replace(/^#/, ''), 16);

    graphics.beginFill(colorNum, opacity);
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
    graphics.endFill();
  }

  /**
   * Animates the appearance of a stain.
   */
  static async animateStain(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: string,
    targetOpacity: number
  ) {
    // Simple alpha animation using PixiJS ticker or just a loop
    graphics.alpha = 0;
    this.render(graphics, points, color, 1); // Render with full opacity internally

    return new Promise<void>(resolve => {
      let alpha = 0;
      const step = 0.05;
      const animate = () => {
        alpha += step;
        graphics.alpha = alpha;
        if (alpha >= targetOpacity) {
          graphics.alpha = targetOpacity;
          resolve();
        } else {
          requestAnimationFrame(animate);
        }
      };
      animate();
    });
  }
}
