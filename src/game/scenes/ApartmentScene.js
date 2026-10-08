import Phaser from 'phaser';
import { APARTMENT, apartmentObjects } from '../world/apartment.js';
import { Player } from '../entities/Player.js';
import { ControlSystem } from '../systems/ControlSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { gameBridge, GAME_EVENTS } from '../bridge.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { useUiStore } from '../../stores/uiStore.js';

/**
 * The player apartment.
 *
 * A second scene rather than a second game: same player, same controls, same
 * interaction system. Only the furniture and the room differ, which is the
 * point — the interaction architecture is shared, not duplicated.
 */
const PALETTE = {
  floor: 0x141b2d,
  floorPlank: 0x182036,
  wall: 0x1c2440,
  wallTrim: 0x2a3454,
  shadow: 0x05080f,
  wood: 0x3a2f27,
  woodLight: 0x4b3c31,
  metal: 0x2b3756,
  screen: 0x0d1322,
};

export class ApartmentScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ApartmentScene' });
  }

  create() {
    const { width, height, padding, wallHeight } = APARTMENT;
    this.physics.world.setBounds(
      padding,
      padding + wallHeight,
      width - padding * 2,
      height - padding * 2 - wallHeight,
    );

    this.drawRoom();

    this.obstacles = this.physics.add.staticGroup();
    this.interaction = new InteractionSystem(this);

    apartmentObjects.forEach((object) => {
      this.drawObject(object);

      // Furniture blocks movement; rugs, and things sitting on top of other
      // furniture, do not.
      if (!object.passable) {
        const body = this.add.rectangle(
          object.position.x,
          object.position.y,
          object.size.width,
          object.size.height * 0.8,
        );
        body.setVisible(false);
        this.obstacles.add(body);
      }

      if (object.interactions.length > 0) {
        this.interaction.register({
          id: object.id,
          x: object.position.x,
          y: object.position.y + object.size.height * 0.4,
          width: object.size.width,
          height: object.size.height,
          padding: 44,
        });
      }
    });

    this.player = new Player(this, APARTMENT.spawn.x, APARTMENT.spawn.y);
    this.physics.add.collider(this.player.container, this.obstacles);

    this.controls = new ControlSystem(this);
    this.cameraSystem = new CameraSystem(this, APARTMENT);
    this.frameRoom();
    this.cameraSystem.introduce();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.frameRoom, this);

    this.unsubscribers = [
      useUiStore.subscribe((state) => {
        this.controls?.setLocked(state.modalStack.length > 0 || state.menuOpen);
      }),
    ];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    gameBridge.emit(GAME_EVENTS.WORLD_READY, { scene: 'ApartmentScene' });
  }

  /**
   * The room shell: wall, window, floor and skirting.
   *
   * Baked into a texture for the same reason the city is — a Graphics object
   * replays every command each frame, and the floor alone is forty lines.
   */
  drawRoom() {
    const { width, height, padding, wallHeight } = APARTMENT;
    const g = this.make.graphics({ add: false });

    const floorTop = padding + wallHeight;
    const floorBottom = height - padding;
    const innerWidth = width - padding * 2;

    // Room shell
    g.fillStyle(PALETTE.wall, 1);
    g.fillRoundedRect(padding - 30, padding - 30, innerWidth + 60, height - padding * 2 + 60, 28);

    // Back wall
    g.fillStyle(PALETTE.wall, 1);
    g.fillRect(padding, padding, innerWidth, wallHeight);
    g.fillStyle(PALETTE.wallTrim, 1);
    g.fillRect(padding, padding, innerWidth, wallHeight - 10);

    // Window on the back wall, with a hint of the city beyond it
    const winW = 210;
    const winH = 44;
    const winX = width - padding - winW - 40;
    const winY = padding + 12;
    g.fillStyle(0x0b1222, 1);
    g.fillRoundedRect(winX, winY, winW, winH, 7);
    g.fillStyle(0x6c8cff, 0.26);
    g.fillRoundedRect(winX + 5, winY + 5, winW - 10, winH - 10, 5);
    // Distant towers
    g.fillStyle(0x2b3a63, 0.85);
    [18, 52, 86, 128, 164].forEach((offset, i) => {
      const h = 12 + ((i * 7) % 16);
      g.fillRect(winX + offset, winY + winH - 5 - h, 22, h);
    });
    g.lineStyle(2, PALETTE.metal, 1);
    g.strokeRoundedRect(winX, winY, winW, winH, 7);
    g.lineBetween(winX + winW / 2, winY, winX + winW / 2, winY + winH);

    // A framed print to balance the window
    g.fillStyle(0x1a2238, 1);
    g.fillRoundedRect(padding + 50, padding + 16, 120, 40, 6);
    g.lineStyle(2, 0x5be3c8, 0.45);
    g.strokeRoundedRect(padding + 50, padding + 16, 120, 40, 6);

    // Skirting
    g.fillStyle(0x5be3c8, 0.16);
    g.fillRect(padding, floorTop - 6, innerWidth, 5);

    // Floor
    g.fillStyle(PALETTE.floor, 1);
    g.fillRect(padding, floorTop, innerWidth, floorBottom - floorTop);
    g.lineStyle(1, PALETTE.floorPlank, 1);
    for (let y = floorTop + 34; y < floorBottom; y += 34) {
      g.lineBetween(padding, y, width - padding, y);
    }
    for (let x = padding + 150; x < width - padding; x += 150) {
      g.lineBetween(x, floorTop, x, floorBottom);
    }

    const baked = this.add.renderTexture(0, 0, width, height);
    baked.setOrigin(0, 0);
    baked.setDepth(-1000);
    baked.draw(g);
    g.destroy();
    this.room = baked;
  }

  /** @param {import('../world/apartment.js').ApartmentObject} object */
  drawObject(object) {
    const { position, size } = object;
    const accent = Phaser.Display.Color.HexStringToColor(object.accent).color;
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    const container = this.add.container(position.x, position.y);
    container.setDepth(position.y + halfH + (object.depthBias ?? 0));

    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.34);
    g.fillRoundedRect(-halfW + 4, -halfH + 8, size.width, size.height, 10);

    switch (object.kind) {
      case 'desk':
        g.fillStyle(PALETTE.wood, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 8);
        g.fillStyle(PALETTE.woodLight, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, 14, { tl: 8, tr: 8, bl: 0, br: 0 });
        g.fillStyle(accent, 0.5);
        g.fillRect(-halfW + 12, halfH - 8, size.width - 24, 3);
        break;

      case 'laptop':
        g.fillStyle(PALETTE.metal, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 5);
        g.fillStyle(PALETTE.screen, 1);
        g.fillRoundedRect(-halfW + 5, -halfH + 5, size.width - 10, size.height - 18, 3);
        g.fillStyle(accent, 0.65);
        g.fillRect(-halfW + 10, -halfH + 11, size.width - 20, 3);
        g.fillRect(-halfW + 10, -halfH + 19, (size.width - 20) * 0.6, 3);
        g.fillStyle(0x47557c, 1);
        g.fillRoundedRect(-halfW + 2, halfH - 12, size.width - 4, 10, 3);
        break;

      case 'folder':
        g.fillStyle(0x8a6a2f, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 6);
        g.fillStyle(accent, 0.85);
        g.fillRoundedRect(-halfW, -halfH, size.width, 16, { tl: 6, tr: 6, bl: 0, br: 0 });
        g.fillStyle(0xe7eefc, 0.85);
        g.fillRect(-halfW + 12, -halfH + 26, size.width - 24, 3);
        g.fillRect(-halfW + 12, -halfH + 36, size.width - 34, 3);
        break;

      case 'shelf':
        g.fillStyle(PALETTE.wood, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 6);
        g.fillStyle(PALETTE.woodLight, 1);
        g.fillRect(-halfW, -halfH + size.height / 2 - 3, size.width, 5);
        for (let i = 0; i < 4; i += 1) {
          const x = -halfW + 26 + i * ((size.width - 52) / 3);
          g.fillStyle(i % 2 === 0 ? 0xffc46b : accent, 0.9);
          g.fillCircle(x, -halfH + 16, 7);
          g.fillRect(x - 3, -halfH + 20, 6, 10);
          g.fillRect(x - 8, -halfH + 30, 16, 4);
        }
        break;

      case 'wall':
        g.fillStyle(0x121a2c, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 8);
        g.lineStyle(2, accent, 0.6);
        g.strokeRoundedRect(-halfW, -halfH, size.width, size.height, 8);
        for (let i = 0; i < 5; i += 1) {
          const barHeight = 10 + ((i * 13) % 26);
          g.fillStyle(accent, 0.45 + i * 0.1);
          g.fillRect(-halfW + 24 + i * 52, halfH - 14 - barHeight, 30, barHeight);
        }
        break;

      case 'phone':
        g.fillStyle(PALETTE.metal, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 10);
        g.fillStyle(PALETTE.screen, 1);
        g.fillRoundedRect(-halfW + 5, -halfH + 7, size.width - 10, size.height - 16, 6);
        g.fillStyle(accent, 0.8);
        g.fillCircle(halfW - 12, -halfH + 14, 5);
        break;

      case 'sofa':
        // Back, arms, then cushions, so it reads as seating from above.
        g.fillStyle(0x24315a, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 16);
        g.fillStyle(accent, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, 26, { tl: 16, tr: 16, bl: 0, br: 0 });
        g.fillRoundedRect(-halfW, -halfH, 24, size.height, { tl: 16, tr: 0, bl: 16, br: 0 });
        g.fillRoundedRect(halfW - 24, -halfH, 24, size.height, { tl: 0, tr: 16, bl: 0, br: 16 });
        g.fillStyle(0x3b4e85, 1);
        g.fillRoundedRect(-halfW + 30, -halfH + 32, (size.width - 72) / 2, size.height - 44, 8);
        g.fillRoundedRect(2, -halfH + 32, (size.width - 72) / 2, size.height - 44, 8);
        break;

      case 'rug':
        g.fillStyle(accent, 0.85);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 18);
        g.lineStyle(3, 0x2f4070, 0.9);
        g.strokeRoundedRect(-halfW + 16, -halfH + 16, size.width - 32, size.height - 32, 12);
        g.lineStyle(2, 0x3a4871, 0.7);
        g.strokeRoundedRect(-halfW + 34, -halfH + 34, size.width - 68, size.height - 68, 8);
        container.setDepth(-900); // the rug is floor, not furniture
        break;

      case 'table':
        g.fillStyle(PALETTE.wood, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 10);
        g.fillStyle(PALETTE.woodLight, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, 16, { tl: 10, tr: 10, bl: 0, br: 0 });
        g.lineStyle(2, 0x241d18, 1);
        g.strokeRoundedRect(-halfW, -halfH, size.width, size.height, 10);
        break;

      case 'bookshelf':
        g.fillStyle(PALETTE.wood, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 8);
        for (let shelf = 0; shelf < 3; shelf += 1) {
          const y = -halfH + 16 + shelf * ((size.height - 24) / 3);
          g.fillStyle(PALETTE.woodLight, 1);
          g.fillRect(-halfW + 6, y + 24, size.width - 12, 4);
          for (let book = 0; book < 5; book += 1) {
            const colors = [0x6c8cff, 0x5be3c8, 0xffc46b, 0xd98cff, 0xff9f7a];
            g.fillStyle(colors[(shelf + book) % colors.length], 0.85);
            g.fillRect(-halfW + 10 + book * 18, y + 6, 13, 18);
          }
        }
        break;

      case 'lamp':
        g.fillStyle(PALETTE.metal, 1);
        g.fillRect(-3, -halfH + 30, 6, size.height - 44);
        g.fillRoundedRect(-18, halfH - 16, 36, 12, 5);
        g.fillStyle(accent, 0.9);
        g.fillTriangle(-24, -halfH + 34, 24, -halfH + 34, 0, -halfH + 2);
        g.fillStyle(accent, 0.05);
        g.fillCircle(0, -halfH + 40, 34);
        break;

      case 'plant':
        g.fillStyle(0x7a4a32, 1);
        g.fillRoundedRect(-18, 6, 36, 26, 6);
        g.fillStyle(accent, 1);
        g.fillCircle(0, -6, 24);
        g.fillCircle(-16, 4, 15);
        g.fillCircle(16, 2, 13);
        break;

      default:
        g.fillStyle(PALETTE.metal, 1);
        g.fillRoundedRect(-halfW, -halfH, size.width, size.height, 8);
    }

    const outline = this.add.graphics();
    outline.lineStyle(3, accent, 1);
    outline.strokeRoundedRect(-halfW - 6, -halfH - 6, size.width + 12, size.height + 12, 12);
    outline.setAlpha(0);
    outline.setVisible(false);

    container.add([g, outline]);

    if (object.interactions.length > 0) {
      const label = this.add
        .text(position.x, position.y - halfH - 20, object.shortName, {
          fontFamily: 'Sora, Inter, sans-serif',
          fontSize: '12px',
          fontStyle: '600',
          color: '#9aa7c4',
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(9000);
      label.setLetterSpacing(1.2);
      this.labels = this.labels ?? new Map();
      this.labels.set(object.id, label);
    }

    this.outlines = this.outlines ?? new Map();
    this.outlines.set(object.id, outline);
  }

  setHighlighted(objectId) {
    // Guarded on change: this runs every frame, and starting a tween per frame
    // would never let the previous one finish.
    if (objectId === this.highlightedId) return;
    this.highlightedId = objectId;

    this.outlines?.forEach((outline, id) => {
      const target = id === objectId ? 0.9 : 0;
      if (target > 0) outline.setVisible(true);
      this.tweens.add({
        targets: outline,
        alpha: target,
        duration: 160,
        ease: 'Cubic.easeOut',
        onComplete: () => outline.setVisible(target > 0),
      });
    });
    this.labels?.forEach((label, id) => {
      label.setColor(id === objectId ? '#eef2fb' : '#9aa7c4');
    });
  }

  update(time, delta) {
    if (!this.player) return;

    this.player.update(this.controls.getAxis(), delta);
    this.player.container.setDepth(this.player.y);

    this.interaction.update({ x: this.player.x, y: this.player.y });
    this.setHighlighted(this.interaction.nearbyId);

    const store = usePlayerStore.getState();
    if (store.currentLocationId !== 'player-apartment') {
      store.setCurrentLocation('player-apartment');
    }

    if (this.controls.consumeInteract()) {
      this.interaction.trigger();
    }
  }

  /** Show the whole room where it fits; follow the player where it does not. */
  frameRoom() {
    if (!this.cameraSystem || !this.player) return;
    this.cameraSystem.frameOrFollow(APARTMENT, this.player.container, 0.72);
  }

  teardown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.frameRoom, this);
    this.room?.destroy();
    this.room = null;
    this.unsubscribers?.forEach((off) => off());
    this.unsubscribers = [];
    this.controls?.destroy();
    this.interaction?.clear();
    this.outlines?.clear();
    this.labels?.clear();
    this.player = null;
  }
}
