import Phaser from 'phaser';
import { WORLD } from './locations.js';
import { roads, parks, crosswalks, generateTrees, generateStreetLamps, worldPalette } from './cityLayout.js';

/**
 * Draws Grooveli City.
 *
 * Everything is generated from shapes at runtime — there are no image assets,
 * borrowed or otherwise. The look is top-down with a shallow extrusion on each
 * building, which gives the 2.5D read the PRD asks for while keeping the world
 * cheap to render and trivially easy to re-lay-out.
 *
 * Ground, roads and planting are static and go into one retained Graphics
 * object. Buildings are containers, because they respond to the player.
 */
const LIFT_PER_FLOOR = 13;

export class CityRenderer {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, { container: Phaser.GameObjects.Container, outline: Phaser.GameObjects.Graphics, label: Phaser.GameObjects.Container }>} */
    this.buildings = new Map();
    /** Baked facade textures, released with the scene. */
    this.textureKeys = [];
  }

  /**
   * Ground plane, grid, roads, parks and street furniture.
   *
   * Phaser replays a Graphics object's whole command list every frame, and this
   * one is roughly fifteen hundred commands. It is drawn once into a
   * RenderTexture and then costs a single textured quad per frame — without
   * that the city renders at single-digit frame rates.
   */
  drawEnvironment() {
    const g = this.scene.make.graphics({ add: false });

    g.fillStyle(worldPalette.ground, 1);
    g.fillRect(0, 0, WORLD.width, WORLD.height);

    // A faint grid gives the eye a sense of scale while moving.
    g.lineStyle(1, worldPalette.grid, 0.5);
    for (let x = 0; x <= WORLD.width; x += 80) {
      g.lineBetween(x, 0, x, WORLD.height);
    }
    for (let y = 0; y <= WORLD.height; y += 80) {
      g.lineBetween(0, y, WORLD.width, y);
    }

    parks.forEach((park) => {
      g.fillStyle(worldPalette.park, 1);
      g.fillRoundedRect(park.x, park.y, park.width, park.height, 40);
      g.lineStyle(2, worldPalette.parkEdge, 0.9);
      g.strokeRoundedRect(park.x, park.y, park.width, park.height, 40);
    });

    roads.forEach((road) => {
      g.fillStyle(worldPalette.road, 1);
      g.fillRect(road.x, road.y, road.width, road.height);
      g.lineStyle(2, worldPalette.roadEdge, 1);
      g.strokeRect(road.x, road.y, road.width, road.height);

      // Centre line, dashed.
      g.lineStyle(2, worldPalette.roadMark, 0.55);
      if (road.orientation === 'h') {
        const y = road.y + road.height / 2;
        for (let x = road.x + 20; x < road.x + road.width - 20; x += 54) {
          g.lineBetween(x, y, x + 28, y);
        }
      } else {
        const x = road.x + road.width / 2;
        for (let y = road.y + 20; y < road.y + road.height - 20; y += 54) {
          g.lineBetween(x, y, x, y + 28);
        }
      }
    });

    crosswalks.forEach((walk) => {
      g.fillStyle(worldPalette.roadMark, 0.3);
      if (walk.orientation === 'h') {
        for (let x = walk.x; x < walk.x + walk.width; x += 20) {
          g.fillRect(x, walk.y + 10, 11, walk.height - 20);
        }
      } else {
        for (let y = walk.y; y < walk.y + walk.height; y += 20) {
          g.fillRect(walk.x + 10, y, walk.width - 20, 11);
        }
      }
    });

    generateTrees().forEach((tree) => {
      // Cast shadow, shaded underside, canopy, highlight — four passes is
      // enough to stop a circle reading as a circle.
      g.fillStyle(worldPalette.buildingShadow, 0.32);
      g.fillEllipse(tree.x + 4, tree.y + tree.radius * 0.6, tree.radius * 1.7, tree.radius * 0.75);
      g.fillStyle(worldPalette.treeShade, 1);
      g.fillCircle(tree.x, tree.y + 2, tree.radius);
      g.fillStyle(worldPalette.tree[tree.variant], 1);
      g.fillCircle(tree.x, tree.y - 1, tree.radius * 0.92);
      g.fillStyle(0xffffff, 0.1);
      g.fillCircle(tree.x - tree.radius * 0.32, tree.y - tree.radius * 0.38, tree.radius * 0.42);
    });

    generateStreetLamps().forEach((lamp) => {
      g.fillStyle(worldPalette.lamp, 1);
      g.fillRect(lamp.x - 1.5, lamp.y - 18, 3, 18);
      g.fillStyle(worldPalette.lampGlow, 0.04);
      g.fillCircle(lamp.x, lamp.y - 20, 14);
      g.fillStyle(worldPalette.lampGlow, 0.65);
      g.fillCircle(lamp.x, lamp.y - 20, 3.4);
    });

    const baked = this.scene.add.renderTexture(0, 0, WORLD.width, WORLD.height);
    baked.setOrigin(0, 0);
    baked.setDepth(-1000);
    baked.draw(g);
    g.destroy();

    this.environment = baked;
    return baked;
  }

  /**
   * Build one location.
   *
   * The facade is drawn once into its own texture and then rendered as a single
   * image. A Graphics object re-tessellates its whole command list every frame,
   * and eleven buildings' worth of windows, roof detail and rounded corners is
   * enough to cost real frames on a modest device.
   *
   * @param {import('./locations.js').CityLocation} location
   */
  createBuilding(location) {
    const { position, size, accent } = location;
    const accentColor = Phaser.Display.Color.HexStringToColor(accent).color;
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const lift = location.walkable ? 0 : (location.floors ?? 3) * LIFT_PER_FLOOR;

    const container = this.scene.add.container(position.x, position.y);
    // Buildings sort against the player by the base of their footprint, so
    // walking below one puts you in front of it and walking above puts you
    // behind it. Walkable surfaces are ground decoration and must stay beneath
    // the player entirely, or standing on the plaza would hide the avatar.
    container.setDepth(location.walkable ? -900 : position.y + halfH);

    const shape = this.bakeShape(location, halfW, halfH, lift, accentColor);

    const outline = this.scene.add.graphics();
    outline.lineStyle(3, accentColor, 1);
    if (location.walkable) {
      outline.strokeRoundedRect(-halfW, -halfH, size.width, size.height, 26);
    } else {
      outline.strokeRoundedRect(-halfW, -halfH - lift, size.width, size.height, 14);
    }
    outline.setAlpha(0);
    // Invisible objects are skipped by the renderer; alpha 0 ones are not.
    outline.setVisible(false);

    container.add([shape, outline]);

    const label = this.createLabel(location, halfH, lift, accentColor);

    this.buildings.set(location.id, { container, outline, label, location });
    return container;
  }

  /**
   * Render a location's artwork into a texture and return an image placed so
   * that the container origin still sits at the centre of the footprint.
   */
  bakeShape(location, halfW, halfH, lift, accentColor) {
    // The drawing routines work in footprint-centred coordinates, which run
    // negative; textures start at (0,0), so the canvas is translated by the
    // padding plus whatever the extrusion adds above the footprint.
    const padLeft = 24;
    const padTop = 24;
    const padRight = 36; // the ground shadow is offset right and down
    const padBottom = 40;

    const texWidth = Math.ceil(halfW * 2 + padLeft + padRight);
    const texHeight = Math.ceil(halfH * 2 + lift + padTop + padBottom);
    const originX = padLeft + halfW;
    const originY = padTop + lift + halfH;

    const g = this.scene.make.graphics({ add: false });
    g.translateCanvas(originX, originY);

    if (location.walkable) this.drawPlaza(g, halfW, halfH, accentColor);
    else this.drawTower(g, halfW, halfH, lift, accentColor, location);

    const key = `grooveli-building-${location.id}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    g.generateTexture(key, texWidth, texHeight);
    g.destroy();

    this.textureKeys.push(key);

    const image = this.scene.add.image(0, 0, key);
    image.setOrigin(originX / texWidth, originY / texHeight);
    return image;
  }

  /** Open space: an inlaid plaza rather than a building. */
  drawPlaza(g, halfW, halfH, accentColor) {
    g.fillStyle(worldPalette.plaza, 1);
    g.fillRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, 26);

    g.lineStyle(2, worldPalette.plazaInlay, 1);
    g.strokeRoundedRect(-halfW, -halfH, halfW * 2, halfH * 2, 26);

    // Concentric inlay reading as a civic square.
    g.lineStyle(2, accentColor, 0.26);
    g.strokeRoundedRect(-halfW + 28, -halfH + 28, halfW * 2 - 56, halfH * 2 - 56, 18);
    g.lineStyle(1, accentColor, 0.16);
    g.strokeCircle(0, 0, Math.min(halfW, halfH) - 46);

    g.fillStyle(accentColor, 0.1);
    g.fillCircle(0, 0, 40);
    g.lineStyle(2, accentColor, 0.5);
    g.strokeCircle(0, 0, 40);
  }

  /**
   * A building: ground shadow, extruded roof, front facade with windows and an
   * entrance, plus an accent band so districts are distinguishable at a glance.
   */
  drawTower(g, halfW, halfH, lift, accentColor, location) {
    const width = halfW * 2;
    const height = halfH * 2;

    // Ground shadow
    g.fillStyle(worldPalette.buildingShadow, 0.5);
    g.fillRoundedRect(-halfW + 10, -halfH + 14, width, height, 16);

    // Front facade — the band between the lifted roof and the footprint base.
    g.fillStyle(worldPalette.buildingFace, 1);
    g.fillRect(-halfW, halfH - lift, width, lift);
    g.fillStyle(worldPalette.buildingSide, 1);
    g.fillRect(halfW - 16, halfH - lift, 16, lift);

    // Roof
    g.fillStyle(worldPalette.buildingTop, 1);
    g.fillRoundedRect(-halfW, -halfH - lift, width, height, 14);
    g.lineStyle(2, worldPalette.buildingEdge, 1);
    g.strokeRoundedRect(-halfW, -halfH - lift, width, height, 14);

    // Roof detailing: an accent strip and a plant deck, so the tops are not flat.
    g.fillStyle(accentColor, 0.16);
    g.fillRoundedRect(-halfW + 18, -halfH - lift + 18, width - 36, 26, 8);
    g.fillStyle(worldPalette.buildingSide, 1);
    g.fillRoundedRect(-halfW + 18, -halfH - lift + 56, width * 0.38, height - 96, 10);
    g.fillStyle(worldPalette.tree[1], 0.5);
    g.fillCircle(-halfW + 44, -halfH - lift + 86, 11);
    g.fillCircle(-halfW + 72, -halfH - lift + 104, 9);

    // Facade windows
    const windowRows = Math.max(1, Math.floor(lift / 22));
    const windowCols = Math.max(3, Math.floor(width / 46));
    const cellW = (width - 36) / windowCols;
    for (let row = 0; row < windowRows; row += 1) {
      for (let col = 0; col < windowCols; col += 1) {
        const lit = (row * windowCols + col + location.name.length) % 3 === 0;
        g.fillStyle(lit ? accentColor : worldPalette.windowDark, lit ? 0.7 : 1);
        g.fillRoundedRect(
          -halfW + 18 + col * cellW,
          halfH - lift + 8 + row * 22,
          cellW - 10,
          12,
          3,
        );
      }
    }

    // Entrance, centred on the front facade — this is where the player walks up.
    g.fillStyle(worldPalette.windowDark, 1);
    g.fillRoundedRect(-22, halfH - 26, 44, 26, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.fillStyle(accentColor, 0.9);
    g.fillRect(-22, halfH - 4, 44, 4);

    // Accent band across the base of the roof — the district's colour signature.
    g.fillStyle(accentColor, 0.85);
    g.fillRect(-halfW, halfH - lift - 5, width, 5);
  }

  /** Floating name plate above each location. */
  createLabel(location, halfH, lift, accentColor) {
    const container = this.scene.add.container(
      location.position.x,
      location.position.y - halfH - lift - 34,
    );
    container.setDepth(9000);

    const text = this.scene.add
      .text(0, 0, location.shortName, {
        fontFamily: 'Sora, Inter, sans-serif',
        fontSize: '15px',
        fontStyle: '600',
        color: '#eef2fb',
        resolution: 2,
      })
      .setOrigin(0.5);
    text.setLetterSpacing(1.4);

    const padX = 16;
    const width = text.width + padX * 2 + 16;
    const height = 30;

    const plate = this.scene.add.graphics();
    plate.fillStyle(0x0b1020, 0.9);
    plate.fillRoundedRect(-width / 2, -height / 2, width, height, 15);
    plate.lineStyle(1, accentColor, 0.5);
    plate.strokeRoundedRect(-width / 2, -height / 2, width, height, 15);
    plate.fillStyle(accentColor, 1);
    plate.fillCircle(-width / 2 + 13, 0, 4);

    text.setX(6);
    container.add([plate, text]);
    container.setAlpha(0.9);

    return container;
  }

  /**
   * Lift the highlight on the building the player is standing next to.
   *
   * Called every frame, so it must do nothing unless the target changed — a
   * tween started per frame would pile up hundreds of concurrent tweens and
   * never settle.
   */
  setHighlighted(locationId) {
    if (locationId === this.highlightedId) return;
    this.highlightedId = locationId;

    this.buildings.forEach((entry, id) => {
      const active = id === locationId;
      const targetAlpha = active ? 0.95 : 0;
      if (active) entry.outline.setVisible(true);
      this.scene.tweens.add({
        targets: entry.outline,
        alpha: targetAlpha,
        duration: 180,
        ease: 'Cubic.easeOut',
        onComplete: () => entry.outline.setVisible(targetAlpha > 0),
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
    this.textureKeys.forEach((key) => this.scene.textures.remove(key));
    this.textureKeys = [];
    this.buildings.clear();
    this.highlightedId = undefined;
  }
}
