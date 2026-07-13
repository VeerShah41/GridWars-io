// GridWars — Grid Manager
// Manages cell state, ownership, protection timers, and reclaim windows

const {
  GRID_WIDTH,
  GRID_HEIGHT,
  CELL_PROTECTION_DURATION,
  RECLAIM_WINDOW_DURATION,
  PERSONAL_COOLDOWN,
} = require('./constants');
const db = require('./db');

class GridManager {
  constructor() {
    // "x,y" → cell data
    this.cells = new Map();
    // userId → last claim timestamp
    this.cooldowns = new Map();
    // userId → { count, lastClaimAt }
    this.streaks = new Map();
    // Track total claim counts per cell for heat map
    this.heatMap = new Map();
    // Timers for state transitions
    this.protectionTimers = new Map();
    this.reclaimTimers = new Map();

    this.io = null; // Set after server starts
  }

  init(io) {
    this.io = io;

    // Load persisted grid from SQLite
    const persisted = db.loadGrid();
    const now = Date.now();

    for (const [key, cell] of persisted) {
      // Restore cell and recalculate state based on elapsed time
      const elapsed = now - cell.claimedAt;

      if (elapsed < CELL_PROTECTION_DURATION) {
        // Still protected
        cell.state = 'protected';
        this.cells.set(key, cell);
        this._scheduleProtectionExpiry(cell, CELL_PROTECTION_DURATION - elapsed);
      } else if (elapsed < CELL_PROTECTION_DURATION + RECLAIM_WINDOW_DURATION) {
        // In reclaim window
        cell.state = 'reclaimable';
        this.cells.set(key, cell);
        const remaining = CELL_PROTECTION_DURATION + RECLAIM_WINDOW_DURATION - elapsed;
        this._scheduleReclaimExpiry(cell, remaining);
      } else {
        // Past reclaim window → permanently owned
        cell.state = 'owned';
        this.cells.set(key, cell);
      }

      // Restore heat map
      this.heatMap.set(key, cell.claimCount || 1);
    }

    console.log(`Grid loaded: ${this.cells.size} cells from database`);
  }

  // Get full grid state for new connections
  getGridState() {
    const cells = [];
    for (const [, cell] of this.cells) {
      cells.push({
        x: cell.x,
        y: cell.y,
        ownerId: cell.ownerId,
        ownerName: cell.ownerName,
        color: cell.color,
        state: cell.state,
        claimedAt: cell.claimedAt,
      });
    }
    return cells;
  }

  // Get heat map data
  getHeatMap() {
    const data = {};
    for (const [key, count] of this.heatMap) {
      data[key] = count;
    }
    return data;
  }

  // Check if a cell can be held/claimed
  canClaim(x, y, userId) {
    const key = `${x},${y}`;
    const cell = this.cells.get(key);

    // Check bounds
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
      return { allowed: false, reason: 'Out of bounds' };
    }

    // Check personal cooldown
    const lastClaim = this.cooldowns.get(userId);
    if (lastClaim && Date.now() - lastClaim < PERSONAL_COOLDOWN) {
      const remaining = Math.ceil((PERSONAL_COOLDOWN - (Date.now() - lastClaim)) / 1000);
      return { allowed: false, reason: `Cooldown: ${remaining}s remaining` };
    }

    // Unclaimed → can hold
    if (!cell) {
      return { allowed: true };
    }

    // Protected → cannot hold
    if (cell.state === 'protected') {
      const remaining = Math.ceil((CELL_PROTECTION_DURATION - (Date.now() - cell.claimedAt)) / 1000 / 60);
      return { allowed: false, reason: `Protected for ${remaining} more minutes`, cell };
    }

    // Reclaimable → can hold (even by the current owner)
    if (cell.state === 'reclaimable') {
      return { allowed: true, isReclaim: true };
    }

    // Permanently owned → cannot hold
    if (cell.state === 'owned') {
      return { allowed: false, reason: 'Cell is permanently owned until daily reset', cell };
    }

    return { allowed: true };
  }

  // Claim a cell (called by holdManager when a hold resolves)
  claimCell(x, y, user, isConquest = false) {
    const key = `${x},${y}`;
    const previousOwner = this.cells.get(key);

    const cell = {
      x,
      y,
      ownerId: user.id,
      ownerName: user.name,
      color: user.color,
      claimedAt: Date.now(),
      state: 'protected',
      claimCount: (this.heatMap.get(key) || 0) + 1,
    };

    // Clear existing timers
    this._clearTimers(key);

    // Set cell
    this.cells.set(key, cell);

    // Update heat map
    this.heatMap.set(key, cell.claimCount);

    // Set personal cooldown
    this.cooldowns.set(user.id, Date.now());

    // Update streak
    this._updateStreak(user.id);

    // Persist to SQLite
    db.upsertCell(cell);

    // Track daily stats
    const today = new Date().toISOString().split('T')[0];
    db.updateDailyStats(today, user.id, user.name, user.color, 'cells_claimed');
    if (isConquest && previousOwner) {
      db.updateDailyStats(today, user.id, user.name, user.color, 'cells_conquered');
    }

    // Schedule protection expiry
    this._scheduleProtectionExpiry(cell, CELL_PROTECTION_DURATION);

    return {
      cell,
      previousOwner: previousOwner ? { id: previousOwner.ownerId, name: previousOwner.ownerName } : null,
      isConquest,
      streak: this.getStreak(user.id),
    };
  }

  // Get user's current streak
  getStreak(userId) {
    const streak = this.streaks.get(userId);
    return streak ? streak.count : 0;
  }

  _updateStreak(userId) {
    const now = Date.now();
    const streak = this.streaks.get(userId);

    if (streak && now - streak.lastClaimAt < 60000) { // Within 1 minute
      streak.count++;
      streak.lastClaimAt = now;
    } else {
      this.streaks.set(userId, { count: 1, lastClaimAt: now });
    }

    // Update best streak in DB
    const s = this.streaks.get(userId);
    const today = new Date().toISOString().split('T')[0];
    const user = require('./userManager').getUserById(userId);
    if (user && s.count > 1) {
      db.updateBestStreak(today, userId, user.name, user.color, s.count);
    }
  }

  _scheduleProtectionExpiry(cell, delay) {
    const key = `${cell.x},${cell.y}`;
    const timer = setTimeout(() => {
      const current = this.cells.get(key);
      if (current && current.ownerId === cell.ownerId && current.state === 'protected') {
        current.state = 'reclaimable';
        db.updateCellState(cell.x, cell.y, 'reclaimable');

        // Broadcast state change
        if (this.io) {
          this.io.emit('cell-reclaimable', {
            x: cell.x,
            y: cell.y,
            reclaimUntil: Date.now() + RECLAIM_WINDOW_DURATION,
          });
        }

        // Schedule reclaim window expiry
        this._scheduleReclaimExpiry(current, RECLAIM_WINDOW_DURATION);
      }
      this.protectionTimers.delete(key);
    }, delay);

    this.protectionTimers.set(key, timer);
  }

  _scheduleReclaimExpiry(cell, delay) {
    const key = `${cell.x},${cell.y}`;
    const timer = setTimeout(() => {
      const current = this.cells.get(key);
      if (current && current.ownerId === cell.ownerId && current.state === 'reclaimable') {
        current.state = 'owned';
        db.updateCellState(cell.x, cell.y, 'owned');

        // Broadcast permanent ownership
        if (this.io) {
          this.io.emit('cell-permanent', { x: cell.x, y: cell.y });
        }
      }
      this.reclaimTimers.delete(key);
    }, delay);

    this.reclaimTimers.set(key, timer);
  }

  _clearTimers(key) {
    if (this.protectionTimers.has(key)) {
      clearTimeout(this.protectionTimers.get(key));
      this.protectionTimers.delete(key);
    }
    if (this.reclaimTimers.has(key)) {
      clearTimeout(this.reclaimTimers.get(key));
      this.reclaimTimers.delete(key);
    }
  }

  // Count cells per user (for leaderboard)
  getCellCounts(eventManager = null) {
    const counts = {};
    for (const [key, cell] of this.cells) {
      if (!counts[cell.ownerId]) {
        counts[cell.ownerId] = {
          userId: cell.ownerId,
          userName: cell.ownerName,
          color: cell.color,
          count: 0,
        };
      }
      const [x, y] = key.split(',').map(Number);
      const multiplier = eventManager && eventManager.isGolden(x, y) ? 3 : 1;
      counts[cell.ownerId].count += multiplier;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }

  // Get cell info
  getCellInfo(x, y) {
    return this.cells.get(`${x},${y}`) || null;
  }

  // Capture a cell directly (used by surround mechanic — no hold needed)
  captureCell(x, y, user) {
    const key = `${x},${y}`;

    // Clear existing timers for this cell
    this._clearTimers(key);

    const cell = {
      x,
      y,
      ownerId: user.id,
      ownerName: user.name,
      color: user.color,
      claimedAt: Date.now(),
      state: 'protected',
      claimCount: (this.heatMap.get(key) || 0) + 1,
    };

    this.cells.set(key, cell);
    this.heatMap.set(key, cell.claimCount);

    // Persist
    db.upsertCell(cell);

    // Schedule protection expiry
    this._scheduleProtectionExpiry(cell, CELL_PROTECTION_DURATION);

    return cell;
  }

  resetCell(x, y) {
    const key = `${x},${y}`;
    this.cells.delete(key);
  }

  freezeCell(x, y) {
    const key = `${x},${y}`;
    if (!this.frozenCells) this.frozenCells = new Set();
    this.frozenCells.add(key);
    setTimeout(() => {
      this.frozenCells.delete(key);
      if (this.io) {
        this.io.emit('cell-unfrozen', { x, y });
      }
    }, 15000); // Freeze for 15s
  }

  isFrozen(x, y) {
    return this.frozenCells && this.frozenCells.has(`${x},${y}`);
  }

  addProtection(x, y, durationMs) {
    const key = `${x},${y}`;
    const cell = this.cells.get(key);
    if (cell) {
      this._clearTimers(key);
      cell.state = 'protected';
      cell.claimedAt = Date.now(); // reset timer
      this._scheduleProtectionExpiry(cell, durationMs);
      if (this.io) {
        this.io.emit('cell-claimed', { x, y, ...cell }); // broadcast state change
      }
    }
  }

  // Daily reset
  resetGrid() {
    // Clear all timers
    for (const timer of this.protectionTimers.values()) clearTimeout(timer);
    for (const timer of this.reclaimTimers.values()) clearTimeout(timer);
    this.protectionTimers.clear();
    this.reclaimTimers.clear();

    // Clear state
    this.cells.clear();
    this.cooldowns.clear();
    this.streaks.clear();
    this.heatMap.clear();

    // Clear database
    db.clearAllCells();

    console.log('Grid reset completed');
  }
}

module.exports = new GridManager();

