import Phaser from 'phaser';
import { WORLD } from './locations.js';
import manifest from './cityManifest.json';
import { createLocationLabel } from './locationLabel.js';

/**
 * Draws Grooveli City from baked assets.
 *
 * The other renderer in this folder draws the city from shapes when the scene
 * starts. This one loads pictures that `npm run bake:city` drew earlier.
 *
 * Be clear about what that does and does not buy. It is NOT a frame-rate win:
 * CityRenderer already bakes its output into textures, so both settle at a
 * comparable steady-state cost — measured at 3 draw calls per frame for the
 * vector city against 7 for this one, and the extra four are the eighty
 * ambient actors, not the scenery.
 *
 * What it buys is a detail ceiling and a pipeline. CityRenderer pays for its
 * artwork in load time on every player's machine on every visit, so it has to
 * stay around a thousand drawing operations. The bake runs once on a build
 * machine and currently spends fifteen thousand, and could spend ten times
 * that without the player noticing. Every file it writes is also a plain image
 * at a known size and anchor, so commissioned art drops in over the generated
 * placeholder without a code change — which is the actual point.
 *
 * The public surface matches CityRenderer exactly, so the scene can hold
 * either one.
 */
const ASSET_ROOT = 'city';

export class PlateCityRenderer {
  /** Queue every baked asset. Call from the scene's `preload`. */
  static preload(scene) {
    scene.load.setBaseURL();
    scene.load.image('city-plate', `${ASSET_ROOT}/${manifest.plate}`);
    manifest.buildings.forEach((entry) => {
      scene.load.image(`city-building-${entry.id}`, `${ASSET_ROOT}/${entry.file}`);
    });
  }

  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, object>} */
    this.buildings = new Map();
    this.byId = Object.fromEntries(manifest.buildings.map((entry) => [entry.id, entry]));
  }

  /** The ground plate: the whole city in a single image. */
  drawEnvironment() {
    const plate = this.scene.add.image(0, 0, 'city-plate');
    plate.setOrigin(0, 0);
    plate.setDepth(-1000);
    // The bake renders at world scale, but guard against a stale asset: a
    // mismatched plate should stretch to the world rather than leave a seam.
    plate.setDisplaySize(WORLD.width, WORLD.height);
    this.environment = plate;
    return plate;
  }

  /**
   * Place one location's sprite.
   *
   * The anchor comes from the manifest rather than from the location's size,
   * because the artwork extends well beyond the footprint — a seven-floor tower
   * is three hundred pixels taller than the ground it stands on. Anchoring on
   * the centre of the footprint is what keeps the sprite registered to the
   * collision underneath it however tall the building gets.
   *
   * @param {import('./locations.js').CityLocation} location
   */
  createBuilding(location) {
    const entry = this.byId[location.id];
    if (!entry) {
      console.warn(`[grooveli] no baked art for "${location.id}" — run npm run bake:city`);
      return null;
    }

    const accentColor = Phaser.Display.Color.HexStringToColor(location.accent).color;
    const halfH = location.size.height / 2;

    const sprite = this.scene.add.image(location.position.x, location.position.y, `city-building-${location.id}`);
    sprite.setOrigin(entry.anchorX / entry.width, entry.anchorY / entry.height);
    // Sort by the base of the footprint, so walking below a building puts you
    // in front of it and walking above puts you behind it. Walkable surfaces
    // are ground decoration and stay beneath the player entirely.
    sprite.setDepth(location.walkable ? -900 : location.position.y + halfH);

    // The highlight is a second copy of the same sprite, drawn additively. It
    // lights the building from within rather than drawing a box around it, and
    // it costs one texture lookup because it shares the original's texture.
    const glow = this.scene.add.image(sprite.x, sprite.y, `city-building-${location.id}`);
    glow.setOrigin(sprite.originX, sprite.originY);
    glow.setDepth(sprite.depth + 0.5);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    glow.setTint(accentColor);
    glow.setAlpha(0);
    glow.setVisible(false);

    // A ring on the ground marks the footprint you have to stand next to.
    const ring = this.scene.add.graphics();
    ring.setDepth(-899);
    ring.lineStyle(3, accentColor, 1);
    ring.strokeRoundedRect(
      location.position.x - location.size.width / 2,
      location.position.y - halfH,
      location.size.width,
      location.size.height,
      location.walkable ? 28 : 16,
    );
    ring.setAlpha(0);
    ring.setVisible(false);

    // The top of the artwork, which for a tower is far above its footprint.
    const label = createLocationLabel(this.scene, location, location.position.y - entry.anchorY, accentColor);

    this.buildings.set(location.id, { sprite, glow, ring, label, location });
    return sprite;
  }

  /**
   * Lift the highlight on the building the player is standing next to.
   *
   * Called every frame, so it must do nothing unless the target changed — a
   * tween started per frame would pile up hundreds of concurrent tweens and
   * never settle. This bug has been written twice in this codebase; the guard
   * is the fix both times.
   */
  setHighlighted(locationId) {
    if (locationId === this.highlightedId) return;
    this.highlightedId = locationId;

    this.buildings.forEach((entry, id) => {
      const active = id === locationId;
      if (active) {
        entry.glow.setVisible(true);
        entry.ring.setVisible(true);
      }
      this.scene.tweens.add({
        targets: [entry.glow],
        alpha: active ? 0.3 : 0,
        duration: 180,
        ease: 'Cubic.easeOut',
        // Invisible objects are skipped by the renderer; alpha-0 ones are not.
        onComplete: () => entry.glow.setVisible(active),
      });
      this.scene.tweens.add({
        targets: [entry.ring],
        alpha: active ? 0.9 : 0,
        duration: 180,
        ease: 'Cubic.easeOut',
        onComplete: () => entry.ring.setVisible(active),
      });
      this.scene.tweens.add({
        targets: entry.label,
        alpha: active ? 1 : 0.9,
        scale: active ? 1.06 : 1,
        duration: 180,
        ease: 'Cubic.easeOut',
      });
    });
  }

  destroy() {
    this.environment?.destroy();
    this.environment = null;
    this.buildings.forEach((entry) => {
      entry.sprite.destroy();
      entry.glow.destroy();
      entry.ring.destroy();
      entry.label.destroy();
    });
    this.buildings.clear();
    this.highlightedId = undefined;
  }
}
