import Phaser from 'phaser';
import { WORLD, cityLocations } from '../world/locations.js';
import { CityRenderer } from '../world/CityRenderer.js';
import { PlateCityRenderer } from '../world/PlateCityRenderer.js';
import { AmbientLayer } from '../world/ambient.js';
import { buildCollisionRects } from '../world/collisionMap.js';
import cityManifest from '../world/cityManifest.json';
import { Player } from '../entities/Player.js';
import { ControlSystem } from '../systems/ControlSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { gameBridge, GAME_EVENTS } from '../bridge.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { useUiStore } from '../../stores/uiStore.js';

/**
 * Grooveli City.
 *
 * The scene assembles systems and data; it contains no knowledge of any
 * individual district. Every building comes from `cityLocations`, every
 * behaviour from the shared systems.
 *
 * The city can be drawn two ways. By default it uses the baked assets that
 * `npm run bake:city` produces: a ground plate, one sprite per location, and a
 * collision grid. Setting VITE_CITY_RENDERER=vector falls back to the original
 * runtime renderer, which draws everything from shapes on each start — slower
 * and far plainer, but it needs no assets, so it is worth keeping as the thing
 * to compare against.
 */
const BAKED = (import.meta.env.VITE_CITY_RENDERER ?? 'plate') !== 'vector';
export class CityScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CityScene' });
  }

  preload() {
    if (BAKED) PlateCityRenderer.preload(this);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    this.renderer = BAKED ? new PlateCityRenderer(this) : new CityRenderer(this);
    this.renderer.drawEnvironment();

    this.obstacles = this.physics.add.staticGroup();
    this.interaction = new InteractionSystem(this);

    this.buildCollision();

    cityLocations.forEach((location) => {
      this.renderer.createBuilding(location);

      if (location.interactions.length > 0) {
        this.interaction.register({
          id: location.id,
          x: location.position.x,
          // Bias the zone toward the entrance at the front of the building.
          y: location.position.y + location.size.height * 0.2,
          width: location.size.width,
          height: location.size.height,
        });
      }
    });

    this.player = new Player(this, WORLD.spawn.x, WORLD.spawn.y);
    this.physics.add.collider(this.player.container, this.obstacles);

    if (BAKED) {
      // Traffic and pedestrians. Scenery only — nothing here collides, and
      // nothing here is interactive.
      this.ambient = new AmbientLayer(this);
      this.ambient.create();
    }

    this.controls = new ControlSystem(this);
    this.cameraSystem = new CameraSystem(this, WORLD);
    this.cameraSystem.follow(this.player.container);
    this.cameraSystem.applyViewport(useUiStore.getState().isCompact);
    this.cameraSystem.introduce();

    this.unsubscribers = [
      gameBridge.on(GAME_EVENTS.COMMAND_FOCUS_LOCATION, ({ locationId }) => {
        const location = cityLocations.find((l) => l.id === locationId);
        if (!location) return;
        this.player.setPosition(location.position.x, location.position.y + location.size.height / 2 + 70);
      }),
      // While a panel is open the world stops reading input but keeps rendering.
      useUiStore.subscribe((state) => {
        const locked = state.modalStack.length > 0 || state.menuOpen;
        this.controls?.setLocked(locked);
        this.cameraSystem?.applyViewport(state.isCompact);
      }),
    ];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    gameBridge.emit(GAME_EVENTS.WORLD_READY, { scene: 'CityScene' });
  }

  /**
   * Static bodies for everything the player cannot walk through.
   *
   * With the baked city that comes from the collision grid, which is painted by
   * the same bake step as the artwork — so the walkable space can describe a
   * courtyard or an archway, and it can never drift out of step with what is
   * drawn. The grid is decomposed into a few dozen rectangles rather than one
   * body per cell.
   *
   * The runtime renderer has no mask, so it falls back to one rectangle per
   * building footprint, which is all its artwork can justify.
   */
  buildCollision() {
    const rects = BAKED
      ? buildCollisionRects(cityManifest.collision)
      : cityLocations
          .filter((location) => !location.walkable)
          .map((location) => ({
            x: location.position.x - location.size.width / 2,
            y: location.position.y - location.size.height / 2,
            width: location.size.width,
            height: location.size.height,
          }));

    rects.forEach((rect) => {
      const body = this.add.rectangle(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height,
      );
      body.setVisible(false);
      this.obstacles.add(body);
    });
  }

  update(time, delta) {
    if (!this.player) return;

    this.ambient?.update(delta);

    this.player.update(this.controls.getAxis(), delta);
    // Depth-sort the player against the buildings by world Y.
    this.player.container.setDepth(this.player.y);

    this.interaction.update({ x: this.player.x, y: this.player.y });
    this.renderer.setHighlighted(this.interaction.nearbyId);

    const store = usePlayerStore.getState();
    if (store.currentLocationId !== this.interaction.nearbyId) {
      store.setCurrentLocation(this.interaction.nearbyId);
    }

    if (this.controls.consumeInteract() && this.interaction.trigger()) {
      this.cameraSystem.pulse();
    }
  }

  teardown() {
    this.unsubscribers?.forEach((off) => off());
    this.unsubscribers = [];
    this.controls?.destroy();
    this.ambient?.destroy();
    this.ambient = null;
    this.renderer?.destroy();
    this.interaction?.clear();
    this.player = null;
  }
}
