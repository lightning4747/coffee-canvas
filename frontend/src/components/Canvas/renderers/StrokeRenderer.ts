import * as PIXI from 'pixi.js';
import { Point2D } from '@shared/types';
import { BrushStyleType } from '../../../store/useStore';
import { GraphicsPool } from './GraphicsPool';

export interface StrokeStyle {
  color: string;
  width: number;
  opacity: number;
  brushStyle?: BrushStyleType;
}

export class StrokeRenderer {
  /**
   * Renders a series of points as a styled stroke on a PIXI.Graphics object.
   * Supports four brush modes: round, flat, marker, watercolor.
   */
  static render(
    graphics: PIXI.Graphics,
    points: Point2D[],
    style: StrokeStyle
  ) {
    if (points.length < 2) return;

    const parsed = parseInt(style.color.replace(/^#/, ''), 16);
    const color = Number.isNaN(parsed) ? 0x1e1e1e : parsed;
    const brushStyle = style.brushStyle ?? 'round';

    switch (brushStyle) {
      case 'flat':
        StrokeRenderer._renderFlat(graphics, points, color, style);
        break;
      case 'marker':
        StrokeRenderer._renderMarker(graphics, points, color, style);
        break;
      case 'watercolor':
        StrokeRenderer._renderWatercolor(graphics, points, color, style);
        break;
      case 'round':
      default:
        StrokeRenderer._renderRound(graphics, points, color, style);
        break;
    }
  }

  // ── Round (smooth, default) ────────────────────────────────────────────────
  private static _renderRound(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: number,
    style: StrokeStyle
  ) {
    graphics.clear();
    graphics.lineStyle({
      width: style.width,
      color,
      alpha: style.opacity,
      cap: PIXI.LINE_CAP.ROUND,
      join: PIXI.LINE_JOIN.ROUND,
    });
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
  }

  // ── Flat (square cap, full opacity, crisp edges) ───────────────────────────
  private static _renderFlat(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: number,
    style: StrokeStyle
  ) {
    graphics.clear();
    graphics.lineStyle({
      width: style.width,
      color,
      alpha: Math.min(style.opacity * 1.2, 1),
      cap: PIXI.LINE_CAP.SQUARE,
      join: PIXI.LINE_JOIN.MITER,
    });
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
  }

  // ── Marker (wide, semi-transparent, slightly textured) ────────────────────
  private static _renderMarker(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: number,
    style: StrokeStyle
  ) {
    graphics.clear();
    // Two overlapping passes for that translucent marker feel
    const passes = [
      { widthMult: 1, alpha: 0.35 },
      { widthMult: 0.75, alpha: 0.3 },
    ];
    for (const pass of passes) {
      graphics.lineStyle({
        width: style.width * 2.5 * pass.widthMult,
        color,
        alpha: pass.alpha,
        cap: PIXI.LINE_CAP.SQUARE,
        join: PIXI.LINE_JOIN.MITER,
      });
      graphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        graphics.lineTo(points[i].x, points[i].y);
      }
    }
  }

  // ── Watercolor (multiple jittered passes, low alpha) ──────────────────────
  private static _renderWatercolor(
    graphics: PIXI.Graphics,
    points: Point2D[],
    color: number,
    style: StrokeStyle
  ) {
    graphics.clear();
    const jitter = style.width * 0.6; // ±jitter px per pass
    const passes = 4;

    for (let p = 0; p < passes; p++) {
      graphics.lineStyle({
        width: style.width * (0.8 + Math.random() * 0.5),
        color,
        alpha: 0.1 + Math.random() * 0.08,
        cap: PIXI.LINE_CAP.ROUND,
        join: PIXI.LINE_JOIN.ROUND,
      });

      // Apply slight jitter to each point per pass
      const jitterX = (Math.random() - 0.5) * jitter;
      const jitterY = (Math.random() - 0.5) * jitter;

      graphics.moveTo(points[0].x + jitterX, points[0].y + jitterY);
      for (let i = 1; i < points.length; i++) {
        const px = points[i].x + (Math.random() - 0.5) * jitter * 0.4;
        const py = points[i].y + (Math.random() - 0.5) * jitter * 0.4;
        graphics.lineTo(px, py);
      }
    }
  }

  /**
   * Gets a Graphics object from the pool for a new stroke.
   */
  static createGraphics(): PIXI.Graphics {
    return GraphicsPool.get();
  }
}
