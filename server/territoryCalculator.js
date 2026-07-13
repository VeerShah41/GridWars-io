// GridWars — Territory Calculator
// Flood-fill algorithm to detect connected cell regions owned by the same user

const { GRID_WIDTH, GRID_HEIGHT, MIN_TERRITORY_SIZE } = require('./constants');

// Directions: up, down, left, right
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * Calculate all territories for a given grid state.
 * A territory = 3+ adjacent cells owned by the same user.
 * Returns: Map<userId, { count, largest, territories: [{cells: [{x,y}]}] }>
 */
function calculateTerritories(cells) {
  const visited = new Set();
  const userTerritories = new Map();

  // Build a lookup: "x,y" → ownerId
  const ownerLookup = new Map();
  for (const [key, cell] of cells) {
    ownerLookup.set(key, cell.ownerId);
  }

  for (const [key, cell] of cells) {
    if (visited.has(key)) continue;

    // BFS flood-fill to find all connected cells of the same owner
    const region = [];
    const queue = [key];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift();
      region.push(current);

      const [cx, cy] = current.split(',').map(Number);

      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nKey = `${nx},${ny}`;

        if (
          nx >= 0 && nx < GRID_WIDTH &&
          ny >= 0 && ny < GRID_HEIGHT &&
          !visited.has(nKey) &&
          ownerLookup.get(nKey) === cell.ownerId
        ) {
          visited.add(nKey);
          queue.push(nKey);
        }
      }
    }

    // Only count regions of MIN_TERRITORY_SIZE or more as territories
    if (region.length >= MIN_TERRITORY_SIZE) {
      if (!userTerritories.has(cell.ownerId)) {
        userTerritories.set(cell.ownerId, {
          userId: cell.ownerId,
          count: 0,
          largest: 0,
          territories: [],
        });
      }

      const userData = userTerritories.get(cell.ownerId);
      userData.count++;
      userData.largest = Math.max(userData.largest, region.length);
      userData.territories.push({
        cells: region.map(k => {
          const [x, y] = k.split(',').map(Number);
          return { x, y };
        }),
        size: region.length,
      });
    }
  }

  return userTerritories;
}

/**
 * Get territory borders for rendering.
 * Returns edges that separate territory cells from non-territory or different-owner cells.
 */
function getTerritoryBorders(cells) {
  const borders = [];

  for (const [key, cell] of cells) {
    const [x, y] = key.split(',').map(Number);

    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nKey = `${nx},${ny}`;
      const neighbor = cells.get(nKey);

      // Border exists if neighbor is out of bounds, unclaimed, or different owner
      if (
        nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT ||
        !neighbor ||
        neighbor.ownerId !== cell.ownerId
      ) {
        borders.push({
          x,
          y,
          side: dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'bottom' : 'top',
          color: cell.color,
          ownerId: cell.ownerId,
        });
      }
    }
  }

  return borders;
}

module.exports = { calculateTerritories, getTerritoryBorders };
