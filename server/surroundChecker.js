// GridWars — Surround Checker
// Detects when a user's cells completely enclose opponent cells (like Go).
// If opponent cells have no "escape path" to the grid edge, they get captured.

const { GRID_WIDTH, GRID_HEIGHT } = require('./constants');

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * After a cell is claimed by `userId`, check if any opponent cells
 * are now completely surrounded (no path to grid boundary without
 * crossing `userId`'s cells).
 *
 * Returns an array of {x, y} cells that should be captured.
 */
function checkSurrounded(cells, userId) {
  // Build a set of all cells owned by the claiming user
  const userCells = new Set();
  // Build a set of all opponent cells (candidates for capture)
  const opponentCells = new Map(); // "x,y" → cell data

  for (const [key, cell] of cells) {
    if (cell.ownerId === userId) {
      userCells.add(key);
    } else {
      opponentCells.set(key, cell);
    }
  }

  // If the user has very few cells, no surround is possible
  if (userCells.size < 4) return [];

  const captured = [];
  const checkedInThisRun = new Set(); // Cells already determined as free or captured

  // For each opponent cell, check if it can reach the grid boundary
  // without crossing the claiming user's cells
  for (const [key] of opponentCells) {
    if (checkedInThisRun.has(key)) continue;

    // BFS: try to reach the grid edge from this cell
    // We can traverse through:
    //   - unclaimed cells
    //   - cells owned by OTHER players (not userId)
    // We CANNOT traverse through:
    //   - cells owned by userId (the wall)
    const visited = new Set();
    const queue = [key];
    visited.add(key);
    let reachedEdge = false;

    while (queue.length > 0) {
      const current = queue.shift();
      const [cx, cy] = current.split(',').map(Number);

      // Check if this cell is on the grid edge
      if (cx === 0 || cx === GRID_WIDTH - 1 || cy === 0 || cy === GRID_HEIGHT - 1) {
        reachedEdge = true;
        break;
      }

      // Explore neighbors
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;

        // Out of bounds = edge reached (shouldn't happen since we check edge above)
        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) {
          reachedEdge = true;
          break;
        }

        const nKey = `${nx},${ny}`;

        if (visited.has(nKey)) continue;

        // If neighbor is owned by the claiming user → it's a wall, can't pass
        if (userCells.has(nKey)) continue;

        // Otherwise (unclaimed or other player) → can traverse
        visited.add(nKey);
        queue.push(nKey);
      }

      if (reachedEdge) break;
    }

    // Mark all visited cells as checked
    for (const v of visited) {
      checkedInThisRun.add(v);
    }

    if (!reachedEdge) {
      // All cells in this region are surrounded!
      // Only capture cells that are actually owned by opponents (not empty ones)
      for (const v of visited) {
        if (opponentCells.has(v)) {
          const [vx, vy] = v.split(',').map(Number);
          captured.push({ x: vx, y: vy, previousOwner: opponentCells.get(v) });
        }
      }
    }
  }

  return captured;
}

module.exports = { checkSurrounded };
