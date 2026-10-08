import { useCallback, useEffect, useRef, useState } from 'react';
import './hud.css';
import { gameBridge, GAME_EVENTS } from '../../game/bridge.js';
import { usePlayerStore } from '../../stores/playerStore.js';
import { useUiStore } from '../../stores/uiStore.js';

const RADIUS = 40;

/**
 * Touch controls.
 *
 * The joystick publishes a normalised axis through the bridge, which is the
 * same vector the keyboard produces — the player controller cannot tell the
 * difference, and neither can any input device added later.
 */
export function VirtualJoystick() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const padRef = useRef(null);
  const pointerId = useRef(null);

  const nearbyLocationId = usePlayerStore((s) => s.nearbyLocationId);
  const modalOpen = useUiStore((s) => s.modalStack.length > 0);
  const menuOpen = useUiStore((s) => s.menuOpen);

  const publish = useCallback((x, y) => {
    gameBridge.emit(GAME_EVENTS.COMMAND_SET_AXIS, { x, y });
  }, []);

  const reset = useCallback(() => {
    setActive(false);
    setOffset({ x: 0, y: 0 });
    publish(0, 0);
    pointerId.current = null;
  }, [publish]);

  // A panel opening must drop the stick, or the avatar keeps walking behind it.
  useEffect(() => {
    if (modalOpen || menuOpen) reset();
  }, [modalOpen, menuOpen, reset]);

  useEffect(() => () => publish(0, 0), [publish]);

  const handleMove = (clientX, clientY) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;

    const distance = Math.hypot(dx, dy);
    if (distance > RADIUS) {
      dx = (dx / distance) * RADIUS;
      dy = (dy / distance) * RADIUS;
    }

    setOffset({ x: dx, y: dy });
    publish(dx / RADIUS, dy / RADIUS);
  };

  const onPointerDown = (event) => {
    if (pointerId.current !== null) return;
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(true);
    handleMove(event.clientX, event.clientY);
  };

  const onPointerMove = (event) => {
    if (pointerId.current !== event.pointerId) return;
    handleMove(event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    if (pointerId.current !== event.pointerId) return;
    reset();
  };

  if (modalOpen || menuOpen) return null;

  return (
    <>
      <div
        ref={padRef}
        className={`joystick${active ? '' : ' joystick--idle'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Movement joystick"
      >
        <span
          className="joystick__thumb"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        />
      </div>

      <button
        type="button"
        className="joystick__action"
        disabled={!nearbyLocationId}
        onClick={() =>
          nearbyLocationId &&
          gameBridge.emit(GAME_EVENTS.REQUEST_INTERACTION, { locationId: nearbyLocationId })
        }
        aria-label="Interact"
      >
        E
      </button>
    </>
  );
}
