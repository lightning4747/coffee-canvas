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
   * Animates the appearance and spread of a coffee stain.
   * Simulates the "hit and spread" effect of liquid.
   */
  static async animateStain(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: string,
    targetOpacity: number,
    durationMs: number = 800
  ) {
    const colorNum = parseInt(color.replace(/^#/, ''), 16);
    const origin = this.calculateCentroid(points);

    return new Promise<void>(resolve => {
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        // Easing function for a more organic feel
        const easeOutQuad = (t: number) => t * (2 - t);
        const currentProgress = easeOutQuad(progress);

        graphics.clear();
        graphics.alpha = currentProgress * targetOpacity;

        // Draw points with a scaling effect from the centroid
        graphics.beginFill(colorNum, 1);
        const currentPoints = points.map(p => ({
          x: origin.x + (p.x - origin.x) * (0.8 + 0.2 * currentProgress),
          y: origin.y + (p.y - origin.y) * (0.8 + 0.2 * currentProgress),
        }));

        graphics.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          graphics.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        graphics.closePath();
        graphics.endFill();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  private static calculateCentroid(points: Point2D[]): Point2D {
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
}
