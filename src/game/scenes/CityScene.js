import Phaser from 'phaser';
import { WORLD, cityLocations } from '../world/locations.js';
import { CityRenderer } from '../world/CityRenderer.js';
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

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    this.renderer = new CityRenderer(this);
    this.renderer.drawEnvironment();

    this.obstacles = this.physics.add.staticGroup();
    this.interaction = new InteractionSystem(this);

    cityLocations.forEach((location) => {
      this.renderer.createBuilding(location);

      if (!location.walkable) {
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

    this.player = new Player(this, WORLD.spawn.x, WORLD.spawn.y);
    this.physics.add.collider(this.player.container, this.obstacles);

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
    this.interaction?.clear();
    this.player = null;
  }
}
