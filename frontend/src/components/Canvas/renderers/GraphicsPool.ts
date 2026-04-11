import * as PIXI from 'pixi.js';

/**
 * A simple object pool for PIXI.Graphics objects to reduce GC pressure.
 * Reusing graphics objects is more efficient than creating new ones for every stroke/stain.
 */
export class GraphicsPool {
  private static pool: PIXI.Graphics[] = [];
  private static activeCount = 0;

  /**
   * Gets a PIXI.Graphics object from the pool or creates a new one.
   */
  public static get(): PIXI.Graphics {
    const graphics = this.pool.pop() || new PIXI.Graphics();
    this.activeCount++;
    graphics.visible = true;
    graphics.alpha = 1;
    graphics.blendMode = PIXI.BLEND_MODES.NORMAL;
    return graphics;
  }

  /**
   * Returns a PIXI.Graphics object to the pool for later reuse.
   * Important: The object should be removed from its parent before being returned.
   */
  public static release(graphics: PIXI.Graphics): void {
    graphics.clear();
    graphics.visible = false;
    // Remove all children if any
    graphics.removeChildren();
    this.pool.push(graphics);
    this.activeCount--;
  }

  /**
   * Gets the total number of objects in the pool.
   */
  public static getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * Gets the number of currently active objects.
   */
  public static getActiveCount(): number {
    return this.activeCount;
  }
}
