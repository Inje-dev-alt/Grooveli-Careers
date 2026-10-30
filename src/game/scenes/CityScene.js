import Phaser from 'phaser';
import { WORLD, cityLocations, doorwayPosition } from '../world/locations.js';
import { CityRenderer } from '../world/CityRenderer.js';
import { BackdropRenderer } from '../world/BackdropRenderer.js';
import { CITY_BACKDROP } from '../world/backdrop.js';
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
 */
export class CityScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CityScene' });
  }

  /**
   * Art is only loaded when there is art. With no backdrop configured this
   * does nothing and the city draws itself from shapes, exactly as before.
   */
  preload() {
    if (!CITY_BACKDROP) return;
    this.load.image('city-base', CITY_BACKDROP.base);
    if (CITY_BACKDROP.mask) this.load.image('city-mask', CITY_BACKDROP.mask);
    if (CITY_BACKDROP.over) this.load.image('city-over', CITY_BACKDROP.over);
  }

  create() {
    /*
     * Two cities, one scene.
     *
     * The painted city and the drawn one share the player, the controls, the
     * camera, every interaction zone and all of the world's data — they differ
     * only in what puts pixels on the screen and where the walls come from.
     * Keeping both means the illustrations can be produced and dropped in one
     * at a time without the city being broken in between, and means falling
     * back is setting CITY_BACKDROP to null rather than reverting a merge.
     */
    this.painted = Boolean(CITY_BACKDROP) && this.textures.exists('city-base');

    const bounds = this.painted
      ? { width: CITY_BACKDROP.width, height: CITY_BACKDROP.height }
      : WORLD;
    this.physics.world.setBounds(0, 0, bounds.width, bounds.height);

    if (this.painted) {
      this.backdrop = new BackdropRenderer(this, {
        base: 'city-base',
        over: CITY_BACKDROP.over ? 'city-over' : null,
        mask: CITY_BACKDROP.mask ? 'city-mask' : null,
        width: CITY_BACKDROP.width,
        height: CITY_BACKDROP.height,
      });
      this.backdrop.draw();
    } else {
      this.renderer = new CityRenderer(this);
      this.renderer.drawEnvironment();
    }

    this.obstacles = this.physics.add.staticGroup();
    this.interaction = new InteractionSystem(this);

    if (this.painted) {
      /*
       * Walls come from the painting, not from the layout. A rectangle in the
       * mask is positioned by its top-left corner; a physics body is
       * positioned by its centre.
       */
      this.backdrop.readCollision().forEach((r) => {
        const body = this.add.rectangle(r.x + r.width / 2, r.y + r.height / 2, r.width, r.height);
        body.setVisible(false);
        this.obstacles.add(body);
      });
    }

    cityLocations.forEach((location) => {
      // A painted building is already in the picture; only the drawn city has
      // to make one.
      if (!this.painted) this.renderer.createBuilding(location);

      if (!this.painted && !location.walkable) {
        // Collision uses the footprint, not the drawn roof, so the player can
        // walk "behind" a building without clipping through its face.
        const body = this.add.rectangle(
          location.position.x,
          location.position.y,
          location.size.width,
          location.size.height,
        );
        body.setVisible(false);
        this.obstacles.add(body);
      }

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

    /*
     * Where the player comes in.
     *
     * Normally the plaza. After leaving a building, the doorway of the
     * district that building belongs to — read and cleared in one step, so an
     * arrival is used once and a later visit to the city starts where the
     * city starts.
     */
    const arrival = usePlayerStore.getState().takeArrival();
    const arrivalDistrict = arrival ? cityLocations.find((l) => l.id === arrival.districtId) : null;
    const entrance = arrivalDistrict ? doorwayPosition(arrivalDistrict) : WORLD.spawn;

    this.player = new Player(this, entrance.x, entrance.y);
    this.physics.add.collider(this.player.container, this.obstacles);

    this.controls = new ControlSystem(this);
    this.cameraSystem = new CameraSystem(this, bounds);
    this.cameraSystem.follow(this.player.container);
    this.cameraSystem.applyViewport(useUiStore.getState().isCompact);

    /*
     * The intro sweep is for arriving in the city, not for stepping out of a
     * door. Panning from the plaza to the district on every exit would put a
     * second of waiting between a player and the street they were already
     * standing on, every single time they leave a building.
     */
    if (!arrivalDistrict) this.cameraSystem.introduce();

    this.unsubscribers = [
      gameBridge.on(GAME_EVENTS.COMMAND_FOCUS_LOCATION, ({ locationId }) => {
        const location = cityLocations.find((l) => l.id === locationId);
        if (!location) return;
        // Same doorway the arrival above uses, so a district has one front
        // door however the player got to it.
        const door = doorwayPosition(location);
        this.player.setPosition(door.x, door.y);
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

  update(time, delta) {
    if (!this.player) return;

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
    this.renderer?.destroy();
    this.backdrop?.destroy();
    this.interaction?.clear();
    this.player = null;
  }
}
