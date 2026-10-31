import Phaser from 'phaser';

/**
 * The floating name plate above a location.
 *
 * Shared by both city renderers so a label looks the same however the city
 * beneath it was drawn.
 *
 * @param {Phaser.Scene} scene
 * @param {import('./locations.js').CityLocation} location
 * @param {number} topY  world Y of the top of the artwork, in scene coordinates
 * @param {number} accentColor
 */
export function createLocationLabel(scene, location, topY, accentColor) {
  const container = scene.add.container(location.position.x, topY - 34);
  container.setDepth(9000);

  const text = scene.add
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

  const plate = scene.add.graphics();
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
