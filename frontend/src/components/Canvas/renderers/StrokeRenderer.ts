import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';

import { GraphicsPool } from './GraphicsPool';

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
    const parsed = parseInt(style.color.replace(/^#/, ''), 16);
    const color = Number.isNaN(parsed) ? 0x000000 : parsed;

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
   * Gets a Graphics object from the pool for a new stroke.
   */
  static createGraphics(): PIXI.Graphics {
    return GraphicsPool.get();
  }
}
