import Phaser from 'phaser';
import { gameBridge, GAME_EVENTS } from '../bridge.js';

/**
 * Input, normalised to a single axis vector plus two intents.
 *
 * Keyboard, virtual joystick and anything added later (gamepad, click-to-move)
 * all feed the same axis, so the player controller never learns about input
 * devices. Adding a device means adding a source here.
 */
export class ControlSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.locked = false;
    this.externalAxis = { x: 0, y: 0 };
    this.unsubscribers = [];

    const keyboard = scene.input.keyboard;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      close: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    this.unsubscribers.push(
      gameBridge.on(GAME_EVENTS.COMMAND_SET_AXIS, (axis) => {
        this.externalAxis = { x: axis?.x ?? 0, y: axis?.y ?? 0 };
      }),
      gameBridge.on(GAME_EVENTS.COMMAND_RELEASE_KEYS, () => this.release()),
    );
  }

  /**
   * Stop reading input without tearing the system down — used while a panel is
   * open so WASD does not walk the avatar behind the interface.
   */
  setLocked(locked) {
    if (locked === this.locked) return;
    this.locked = locked;
    if (locked) this.release();
  }

  release() {
    this.externalAxis = { x: 0, y: 0 };
    this.scene.input.keyboard.resetKeys();
  }

  /** @returns {{ x: number, y: number }} */
  getAxis() {
    if (this.locked) return { x: 0, y: 0 };

    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.left.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.right.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.up.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.down.isDown) y += 1;

    // The joystick wins when it is actually being held, so a stray key does not
    // fight a thumb on a touchscreen.
    if (Math.abs(this.externalAxis.x) > 0.08 || Math.abs(this.externalAxis.y) > 0.08) {
      return { x: this.externalAxis.x, y: this.externalAxis.y };
    }

    return { x, y };
  }

  /** True on the frame E was pressed. */
  consumeInteract() {
    if (this.locked) return false;
    return Phaser.Input.Keyboard.JustDown(this.keys.interact);
  }

  /** ESC is handled globally by the interface; the scene only needs to know. */
  consumeClose() {
    return Phaser.Input.Keyboard.JustDown(this.keys.close);
  }

  destroy() {
    this.unsubscribers.forEach((off) => off());
    this.unsubscribers = [];
  }
}
