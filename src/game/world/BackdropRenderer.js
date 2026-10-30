import { sliceBands } from './backdrop.js';
import { walkMaskToRects } from './walkMask.js';

/**
 * Draws the painted city and builds its collision.
 *
 * The counterpart to `CityRenderer`, which draws the city from shapes. Only
 * one of the two runs: `CityScene` picks by whether there is art to show. They
 * are kept apart rather than merged because they share almost nothing — one
 * generates geometry, the other places three textures — and a single class
 * doing both would be a long branch pretending to be one thing.
 *
 * Collision comes out of the mask image rather than out of the layout data,
 * which is the whole bargain of Route B: the picture is the source of truth
 * for where the world is, so a wall exists because somebody painted it.
 */
export class BackdropRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ base: string, over: string, mask: string, width: number, height: number }} art
   */
  constructor(scene, art) {
    this.scene = scene;
    this.art = art;
    /** @type {Phaser.GameObjects.Image[]} */
    this.bands = [];
  }

  /**
   * Ground layer, then the foreground sliced into depth-sorted bands.
   *
   * The base sits below everything at the same depth the drawn city used for
   * its baked ground, so anything already sorting against that number keeps
   * working.
   */
  draw() {
    const { base, over, width, height } = this.art;

    this.scene.add.image(0, 0, base).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-1000);

    /*
     * Each band is the same texture cropped to one horizontal strip, placed
     * where that strip belongs and sorted by its own bottom edge. `setCrop`
     * rather than separate textures: one image in memory, N cheap quads out
     * of it.
     */
    const texture = this.scene.textures.get(over).getSourceImage();
    const scaleY = texture.height / height;

    this.bands = sliceBands(height).map((band) => {
      /*
       * Every band is the WHOLE layer, placed at the origin, showing only its
       * own strip. Cropping does not move what is left, so each strip lands
       * exactly where it belongs with no arithmetic — the only thing that
       * differs between bands is the crop and the depth.
       */
      const image = this.scene.add
        .image(0, 0, over)
        .setOrigin(0, 0)
        .setDisplaySize(width, height)
        .setDepth(band.depth);

      // Crop is expressed in texture pixels, which are not world pixels when
      // the art is authored at a different resolution than it is shown.
      image.setCrop(0, band.y * scaleY, texture.width, band.height * scaleY);

      return image;
    });
  }

  /**
   * Read the walk mask and return collision rectangles in world coordinates.
   *
   * The mask is read once, here, and never again — it is pulled through a
   * canvas to get at its pixels, which is not something to do per frame.
   *
   * The mask may be authored smaller than the art (a half-size mask is plenty
   * for 16-pixel cells and a quarter of the memory), so its rectangles are
   * scaled up to world size on the way out rather than requiring the artist
   * to match resolutions exactly.
   *
   * @returns {{ x: number, y: number, width: number, height: number }[]}
   *   positioned by top-left corner, in world pixels
   */
  readCollision() {
    const { mask, width, height } = this.art;
    const source = this.scene.textures.get(mask).getSourceImage();

    const canvas = this.scene.textures.createCanvas(`${mask}--read`, source.width, source.height);
    canvas.draw(0, 0, source);
    const { data } = canvas.context.getImageData(0, 0, source.width, source.height);

    const rects = walkMaskToRects(data, source.width, source.height);

    // Done with it: a full-size canvas texture held for the life of the scene
    // is megabytes of nothing.
    this.scene.textures.remove(`${mask}--read`);

    const scaleX = width / source.width;
    const scaleY = height / source.height;

    return rects.map((r) => ({
      x: r.x * scaleX,
      y: r.y * scaleY,
      width: r.width * scaleX,
      height: r.height * scaleY,
    }));
  }

  destroy() {
    this.bands.forEach((image) => image.destroy());
    this.bands = [];
  }
}
