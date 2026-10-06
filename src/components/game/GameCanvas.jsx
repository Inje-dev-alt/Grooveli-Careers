import { useEffect, useRef } from 'react';
import './game.css';
import { useUiStore } from '../../stores/uiStore.js';
import { usePlayerStore } from '../../stores/playerStore.js';

/**
 * Mounts Phaser into a React-owned element and tears it down cleanly.
 *
 * Phaser is imported dynamically so the engine is fetched only when a world
 * route is opened — the marketplace, profile and AI routes never pay for it.
 *
 * @param {{ scene: 'city' | 'apartment' }} props
 */
export function GameCanvas({ scene }) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const setWorldReady = useUiStore((s) => s.setWorldReady);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;

    async function boot() {
      // Dynamic import keeps Phaser out of the initial bundle.
      const [{ default: Phaser }, { createGameConfig }, { CityScene }, { ApartmentScene }] =
        await Promise.all([
          import('phaser'),
          import('../../game/config.js'),
          import('../../game/scenes/CityScene.js'),
          import('../../game/scenes/ApartmentScene.js'),
        ]);

      if (cancelled || !host) return;

      const SceneClass = scene === 'apartment' ? ApartmentScene : CityScene;
      const config = createGameConfig({ parent: host, scenes: [SceneClass] });
      const game = new Phaser.Game(config);
      gameRef.current = game;
      // Development-only handle for inspecting the running scene from the
      // console. Stripped from production builds by the DEV guard.
      if (import.meta.env.DEV) window.__GROOVELI_GAME__ = game;
      setWorldReady(true);
    }

    boot();

    return () => {
      cancelled = true;
      setWorldReady(false);
      // Destroy removes the canvas and every listener the scene registered.
      gameRef.current?.destroy(true);
      gameRef.current = null;
      usePlayerStore.getState().reset();
    };
  }, [scene, setWorldReady]);

  return <div ref={hostRef} className="game-canvas" aria-hidden="true" />;
}
