import * as PIXI from 'pixi.js';

/**
 * Utility for rendering and updating user cursors on the PixiJS canvas.
 */
export class CursorRenderer {
  /**
   * Creates a new cursor indicator container.
   * @param name - The user's display name.
   * @param color - The user's assigned color.
   */
  static createCursor(name: string, color: string): PIXI.Container {
    const container = new PIXI.Container();

    // 1. Draw Cursor Shape (a small arrow or circle)
    const cursor = new PIXI.Graphics();

    // Fill with user color, outline with white for visibility on dark/mixed backgrounds
    cursor.lineStyle(1, 0xffffff, 1);
    cursor.beginFill(PIXI.utils.string2hex(color));

    // A simple cursor arrow shape
    cursor.moveTo(0, 0);
    cursor.lineTo(0, 15);
    cursor.lineTo(4, 11);
    cursor.lineTo(8, 16);
    cursor.lineTo(10, 15);
    cursor.lineTo(6, 10);
    cursor.lineTo(12, 10);
    cursor.closePath();
    cursor.endFill();

    container.addChild(cursor);

    // 2. Add Name Label
    const label = new PIXI.Text(name, {
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
      fill: 0xffffff,
      align: 'center',
      fontWeight: 'bold',
      dropShadow: true,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
      dropShadowColor: 0x000000,
    });

    label.position.set(15, 15);
    container.addChild(label);

    return container;
  }

  /**
   * Smoothly moves a cursor to a new position.
   * @param container - The cursor container to move.
   * @param x - Target X-coordinate.
   * @param y - Target Y-coordinate.
   */
  static updatePosition(container: PIXI.Container, x: number, y: number) {
    // Basic immediate move, can be extended with interpolation if needed.
    container.position.set(x, y);
  }
}
