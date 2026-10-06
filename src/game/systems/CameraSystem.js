import { GAME_SETTINGS } from '../config.js';

/**
 * Camera behaviour, kept out of the scene so the framing rules live in one
 * place: follow the player smoothly, stay inside the world, and pull back on
 * small screens so a phone still shows enough context to navigate by.
 */
export class CameraSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ width: number, height: number }} world
   */
  constructor(scene, world) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.camera.setBounds(0, 0, world.width, world.height);
    this.camera.setRoundPixels(false);
  }

  follow(target) {
    this.camera.startFollow(target, true, GAME_SETTINGS.cameraLerp, GAME_SETTINGS.cameraLerp);
    // Deadzone keeps small adjustments from sliding the whole city around.
    this.camera.setDeadzone(120, 90);
  }

  /** @param {boolean} compact */
  applyViewport(compact) {
    const zoom = compact ? GAME_SETTINGS.cameraZoom.compact : GAME_SETTINGS.cameraZoom.desktop;
    if (Math.abs(this.camera.zoom - zoom) < 0.001) return;
    this.scene.tweens.add({
      targets: this.camera,
      zoom,
      duration: 260,
      ease: 'Cubic.easeOut',
    });
  }

  introduce() {
    this.camera.fadeIn(520, 7, 10, 20);
  }

  /** Brief nudge when the player enters a location — acknowledgement, not spectacle. */
  pulse() {
    this.camera.shake(90, 0.0016);
  }

  /**
   * Frame a whole space rather than following within it.
   *
   * Interiors are small enough to show at once, and a camera that chases the
   * player around a single room is more disorienting than useful. Falls back to
   * following when the space cannot be shown at a legible zoom — a phone, for
   * instance.
   *
   * @param {{ width: number, height: number }} space
   * @param {Phaser.GameObjects.GameObject} target
   * @param {number} minZoom below this the space is too small to read
   */
  frameOrFollow(space, target, minZoom = 0.8) {
    const view = this.camera;
    const fit = Math.min(view.width / space.width, view.height / space.height);

    if (fit >= minZoom) {
      view.stopFollow();
      view.setZoom(fit);
      view.centerOn(space.width / 2, space.height / 2);
      return 'framed';
    }

    view.setZoom(minZoom);
    this.follow(target);
    return 'following';
  }
}
