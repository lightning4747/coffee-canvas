import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';

export interface StrokeStyle {
  color: string;
  width: number;
  opacity: number;
}

export class StrokeRenderer {
  /**
   * Renders a series of points as a smooth stroke on a PIXI.Graphics object.
   */
  static render(
    graphics: PIXI.Graphics,
    points: Point2D[],
    style: StrokeStyle
  ) {
    if (points.length < 2) return;

    graphics.clear();

    // Parse hex color string to numeric
    const color = parseInt(style.color.replace(/^#/, ''), 16);

    graphics.lineStyle({
      width: style.width,
      color: color,
      alpha: style.opacity,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND,
    });

    graphics.moveTo(points[0].x, points[0].y);

    // Use quadratic curves for smoothing if we have enough points,
    // but for now simple lineTo is safer for performance during active drawing
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
  }

  /**
   * Creates a new Graphics object for an active stroke.
   */
  static createGraphics(): PIXI.Graphics {
    const g = new PIXI.Graphics();
    // Enable performance optimizations for frequently updated graphics
    return g;
  }
}
