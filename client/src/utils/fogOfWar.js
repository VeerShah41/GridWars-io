// Computes a Set of visible "x,y" keys based on owned cell positions
// Uses BFS expansion from each owned cell up to `radius` distance

import { GRID_WIDTH, GRID_HEIGHT } from './constants';

export function computeVisibleCells(ownedKeys, cursorPos, radius = 6, cursorRadius = 3) {
  const visible = new Set();
  const queue = [];

  // Seed from owned cells
  for (const key of ownedKeys) {
    const [x, y] = key.split(',').map(Number);
    queue.push({ x, y, dist: 0, maxDist: radius });
  }

  // Seed from cursor position
  if (cursorPos) {
    queue.push({ x: cursorPos.x, y: cursorPos.y, dist: 0, maxDist: cursorRadius });
  }

  // BFS
  while (queue.length > 0) {
    const { x, y, dist, maxDist } = queue.shift();
    const key = `${x},${y}`;
    if (visible.has(key)) continue;
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
    if (dist > maxDist) continue;

    visible.add(key);

    if (dist < maxDist) {
      queue.push({ x: x+1, y, dist: dist+1, maxDist });
      queue.push({ x: x-1, y, dist: dist+1, maxDist });
      queue.push({ x, y: y+1, dist: dist+1, maxDist });
      queue.push({ x, y: y-1, dist: dist+1, maxDist });
    }
  }

  return visible;
}
