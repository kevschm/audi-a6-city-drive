const fills = { park: '#415d4b', market: '#af9b7e', station: '#a2917e', historic: '#706c63' };

export function createMinimap(canvas, { districts, obstacles }, roads, roadHalfWidth, halfWorld) {
  const context = canvas.getContext('2d');
  const map = document.createElement('canvas');
  map.width = map.height = 2 * halfWorld;
  const background = map.getContext('2d');
  background.translate(halfWorld, halfWorld);
  background.scale(1, -1);
  background.fillStyle = '#41574d';
  background.fillRect(-halfWorld, -halfWorld, map.width, map.height);
  for (const { x0, x1, z0, z1, kind } of districts) {
    background.fillStyle = fills[kind] || '#626961';
    background.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  background.fillStyle = '#22313a';
  for (const road of roads) {
    const width = roadHalfWidth(road);
    background.fillRect(road - width, -halfWorld, width * 2, map.height);
    background.fillRect(-halfWorld, road - width, map.width, width * 2);
  }
  background.fillStyle = '#a9a499';
  for (const { x0, x1, z0, z1 } of obstacles) {
    if (x1 - x0 >= 1 && z1 - z0 >= 1) background.fillRect(x0, z0, x1 - x0, z1 - z0);
  }

  return function drawMap(car, traffic) {
    const mid = canvas.width / 2;
    context.fillStyle = '#41574d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(mid, mid);
    context.rotate(-car.heading);
    context.scale(1.25, 1.25);
    context.translate(-car.x, car.z);
    context.drawImage(map, -halfWorld, -halfWorld);
    context.fillStyle = '#eecc90';
    for (const actor of traffic) {
      context.beginPath();
      context.arc(actor.x, -actor.z, 1.65, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.save();
    context.translate(mid, mid);
    context.fillStyle = '#f8e4b5';
    context.strokeStyle = '#1b2326';
    context.lineWidth = 2.8;
    context.beginPath();
    context.moveTo(0, -15);
    context.lineTo(9, 10);
    context.lineTo(0, 6);
    context.lineTo(-9, 10);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  };
}
