import Phaser from 'phaser';
import { cityLocations } from './locations.js';
import { useCityBoardStore } from '../../stores/cityBoardStore.js';

/**
 * The notice board outside each district.
 *
 * This is the half of the city's signage that is not art. The billboards baked
 * into the buildings say what a district *is*; these say what is happening in
 * it right now — how many roles are open — and that number comes from the same
 * service the job pages read.
 *
 * It is the point of the whole diegetic-interface idea: the product surfaces
 * itself in the world rather than only in panels floating above it. Walk past
 * the Technology Hub and you can see it is hiring without opening anything.
 *
 * Each board is drawn into a RenderTexture once and then costs a single sprite
 * per frame. Text objects are cheap to make and expensive to keep — twenty-two
 * live ones would each carry their own texture and their own draw call — so
 * they are drawn into the board and destroyed. The board is redrawn only when
 * the number it shows actually changes, which is on load and after an
 * application, not per frame.
 */
const BOARD = { width: 132, height: 96, lift: 54 };

export class NoticeBoards {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, { texture: Phaser.GameObjects.RenderTexture, location: object, shown: number | null }>} */
    this.boards = new Map();
    this.unsubscribe = null;
  }

  create() {
    cityLocations
      .filter((location) => !location.walkable && location.id !== 'player-apartment')
      .forEach((location) => this.createBoard(location));

    const { openRoles, status } = useCityBoardStore.getState();
    this.render(openRoles, status);
    // Zustand delivers the whole state; the render is a no-op unless a number
    // this scene is actually showing has moved.
    this.unsubscribe = useCityBoardStore.subscribe((state) => this.render(state.openRoles, state.status));
  }

  createBoard(location) {
    // Beside the entrance, on the opposite side from the loitering NPCs, so
    // nothing appears to be standing in the doorway the player is invited into.
    const x = location.position.x + location.size.width * 0.44;
    const y = location.position.y + location.size.height / 2 + 36;

    const texture = this.scene.add.renderTexture(x, y, BOARD.width, BOARD.height);
    texture.setOrigin(0.5, 1);
    // Sorts by its base, like everything else that stands on the ground.
    texture.setDepth(y);

    this.boards.set(location.id, { texture, location, shown: null });
  }

  /**
   * @param {Record<string, number>} openRoles
   * @param {'idle'|'loading'|'ready'|'error'} status
   *
   * The status matters as much as the numbers. A district missing from a
   * *loaded* response has no open roles, which is zero; a district missing
   * because nothing has loaded yet is unknown, which is not. Reading an absent
   * key as zero either way would have every board confidently announce "0
   * ROLES OPEN" for the second before the data arrives, and keep announcing it
   * if the request failed.
   */
  render(openRoles, status) {
    const known = status === 'ready';
    this.boards.forEach((board, id) => {
      const count = known ? (openRoles?.[id] ?? 0) : null;
      if (count === board.shown) return;
      board.shown = count;
      this.drawBoard(board, count);
    });
  }

  drawBoard(board, count) {
    const { texture, location } = board;
    const accent = Phaser.Display.Color.HexStringToColor(location.accent).color;
    const w = BOARD.width;
    const h = BOARD.height;
    const panelH = BOARD.lift;
    const top = h - panelH - 18;

    const g = this.scene.make.graphics({ add: false });

    // Shadow and posts.
    g.fillStyle(0x05080f, 0.4);
    g.fillEllipse(w / 2 + 2, h - 6, w * 0.6, 11);
    g.fillStyle(0x3c4870, 1);
    g.fillRect(w / 2 - 26, top + panelH - 2, 5, 20);
    g.fillRect(w / 2 + 21, top + panelH - 2, 5, 20);

    // Panel.
    g.fillStyle(0x080d1a, 0.96);
    g.fillRoundedRect(6, top, w - 12, panelH, 7);
    g.lineStyle(2, accent, 0.85);
    g.strokeRoundedRect(6, top, w - 12, panelH, 7);
    // Header strip, so the district reads before the number does.
    g.fillStyle(accent, 0.9);
    g.fillRoundedRect(6, top, w - 12, 17, { tl: 7, tr: 7, bl: 0, br: 0 });

    const text = (value, style) =>
      this.scene.make.text({ x: 0, y: 0, text: value, style, add: false }).setOrigin(0.5, 0.5);

    const heading = text(location.shortName, {
      fontFamily: 'Sora, Inter, sans-serif',
      fontSize: '11px',
      fontStyle: '700',
      color: '#07101e',
      resolution: 2,
    });

    // "—" only while the number is genuinely unknown. Once the data is in,
    // zero is a real answer and the board says so.
    const headline = text(count === null ? '—' : String(count), {
      fontFamily: 'Sora, Inter, sans-serif',
      fontSize: '26px',
      fontStyle: '700',
      color: location.accent,
      resolution: 2,
    });

    const caption = text(count === 1 ? 'ROLE OPEN' : 'ROLES OPEN', {
      fontFamily: 'Sora, Inter, sans-serif',
      fontSize: '9px',
      fontStyle: '600',
      color: '#8fa0c4',
      resolution: 2,
    });

    texture.clear();
    texture.draw(g, 0, 0);
    texture.draw(heading, w / 2, top + 9);
    texture.draw(headline, w / 2, top + 33);
    texture.draw(caption, w / 2, top + 48);

    // Drawn, not kept: a live Text object would cost its own texture and its
    // own draw call for a string that changes a handful of times a session.
    g.destroy();
    heading.destroy();
    headline.destroy();
    caption.destroy();
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.boards.forEach((board) => board.texture.destroy());
    this.boards.clear();
  }
}
