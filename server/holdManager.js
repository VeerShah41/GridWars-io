// GridWars — Hold Manager
// The core mechanic: press-and-hold to claim with contested battles

const {
  HOLD_DURATION_SOLO,
  HOLD_DURATION_CONTEST,
  HOLD_PROGRESS_INTERVAL,
} = require('./constants');
const gridManager = require('./gridManager');
const userManager = require('./userManager');

class HoldManager {
  constructor() {
    // "x,y" → hold state
    this.activeHolds = new Map();
    // userId → "x,y" (a user can only hold one cell)
    this.userHolds = new Map();

    this.io = null;
  }

  init(io) {
    this.io = io;
  }

  // Get all active holds (for new connections)
  getActiveHolds() {
    const holds = [];
    for (const [key, hold] of this.activeHolds) {
      holds.push({
        x: hold.x,
        y: hold.y,
        state: hold.state,
        timeRemaining: Math.max(0, hold.endsAt - Date.now()),
        duration: hold.duration,
        contestants: this._getContestantInfo(hold),
      });
    }
    return holds;
  }

  // User starts holding a cell
  startHold(socketId, x, y) {
    const user = userManager.getUser(socketId);
    if (!user) return { success: false, reason: 'User not found' };

    // Check if user is already holding something
    if (this.userHolds.has(user.id)) {
      const currentKey = this.userHolds.get(user.id);
      return { success: false, reason: 'Already holding a cell', currentHold: currentKey };
    }

    // Check if the cell can be claimed
    const check = gridManager.canClaim(x, y, user.id);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const key = `${x},${y}`;
    const now = Date.now();

    // Check if there's an existing hold on this cell
    const existingHold = this.activeHolds.get(key);

    if (existingHold) {
      // Join an existing hold → contest!
      return this._joinContest(existingHold, user, key);
    }

    // Start a new solo hold
    const hold = {
      x,
      y,
      state: 'holding',
      duration: HOLD_DURATION_SOLO,
      startedAt: now,
      endsAt: now + HOLD_DURATION_SOLO,
      contestants: new Map(),
      progressTimer: null,
      resolveTimer: null,
    };

    // Add the user as a contestant
    hold.contestants.set(user.id, {
      userId: user.id,
      userName: user.name,
      color: user.color,
      startedAt: now,
      isHolding: true,
      totalHoldMs: 0,
    });

    this.activeHolds.set(key, hold);
    this.userHolds.set(user.id, key);

    // Start progress broadcasting
    hold.progressTimer = setInterval(() => {
      this._broadcastProgress(key, hold);
    }, HOLD_PROGRESS_INTERVAL);

    // Schedule resolution
    hold.resolveTimer = setTimeout(() => {
      this._resolveHold(key);
    }, HOLD_DURATION_SOLO);

    // Broadcast hold started
    this.io.emit('hold-started', {
      x,
      y,
      userId: user.id,
      userName: user.name,
      color: user.color,
      duration: HOLD_DURATION_SOLO,
      timeRemaining: HOLD_DURATION_SOLO,
    });

    return { success: true, duration: HOLD_DURATION_SOLO };
  }

  // Another user joins → contest mode
  _joinContest(hold, user, key) {
    const now = Date.now();

    // Don't allow the same user to contest themselves
    if (hold.contestants.has(user.id)) {
      return { success: false, reason: 'Already in this contest' };
    }

    // Add new contestant
    hold.contestants.set(user.id, {
      userId: user.id,
      userName: user.name,
      color: user.color,
      startedAt: now,
      isHolding: true,
      totalHoldMs: 0,
    });

    this.userHolds.set(user.id, key);

    // If transitioning from solo to contested, extend timer
    if (hold.state === 'holding') {
      hold.state = 'contested';

      // Calculate how much time has passed
      const elapsed = now - hold.startedAt;

      // Update all existing contestants' hold time
      for (const [, contestant] of hold.contestants) {
        if (contestant.isHolding && contestant.startedAt < now) {
          contestant.totalHoldMs += (now - contestant.startedAt);
          contestant.startedAt = now; // Reset for next calculation
        }
      }

      // Extend to contest duration
      hold.duration = HOLD_DURATION_CONTEST;
      hold.endsAt = now + HOLD_DURATION_CONTEST;

      // Reschedule resolution
      clearTimeout(hold.resolveTimer);
      hold.resolveTimer = setTimeout(() => {
        this._resolveHold(key);
      }, HOLD_DURATION_CONTEST);
    } else {
      // Already contested, someone new joins — don't extend further
    }

    // Broadcast contest
    this.io.emit('hold-contested', {
      x: hold.x,
      y: hold.y,
      contestants: this._getContestantInfo(hold),
      timeRemaining: Math.max(0, hold.endsAt - Date.now()),
      duration: hold.duration,
    });

    return { success: true, contested: true, duration: hold.duration };
  }

  // User releases hold
  releaseHold(socketId) {
    const user = userManager.getUser(socketId);
    if (!user) return;

    const key = this.userHolds.get(user.id);
    if (!key) return;

    const hold = this.activeHolds.get(key);
    if (!hold) {
      this.userHolds.delete(user.id);
      return;
    }

    const contestant = hold.contestants.get(user.id);
    if (!contestant) return;

    // Update total hold time
    const now = Date.now();
    if (contestant.isHolding) {
      contestant.totalHoldMs += (now - contestant.startedAt);
      contestant.isHolding = false;
    }

    this.userHolds.delete(user.id);

    // Broadcast release
    this.io.emit('hold-released', {
      x: hold.x,
      y: hold.y,
      userId: user.id,
      userName: user.name,
    });

    // Check if any contestants are still holding
    const stillHolding = Array.from(hold.contestants.values()).filter(c => c.isHolding);

    if (stillHolding.length === 0) {
      // Nobody holding → cancel
      this._cancelHold(key);
    } else if (stillHolding.length === 1 && hold.state === 'contested') {
      // Only one left in a contest → they win immediately
      this._resolveHold(key);
    }
  }

  // Handle user disconnect during hold
  handleDisconnect(userId) {
    const key = this.userHolds.get(userId);
    if (!key) return;

    const hold = this.activeHolds.get(key);
    if (!hold) {
      this.userHolds.delete(userId);
      return;
    }

    const contestant = hold.contestants.get(userId);
    if (contestant && contestant.isHolding) {
      contestant.totalHoldMs += (Date.now() - contestant.startedAt);
      contestant.isHolding = false;
    }

    this.userHolds.delete(userId);

    // Broadcast disconnect as release
    this.io.emit('hold-released', {
      x: hold.x,
      y: hold.y,
      userId: userId,
      userName: contestant ? contestant.userName : 'Unknown',
      disconnected: true,
    });

    // Check remaining holders
    const stillHolding = Array.from(hold.contestants.values()).filter(c => c.isHolding);

    if (stillHolding.length === 0) {
      this._cancelHold(key);
    } else if (stillHolding.length === 1 && hold.state === 'contested') {
      this._resolveHold(key);
    }
  }

  // Resolve a hold — determine winner
  _resolveHold(key) {
    const hold = this.activeHolds.get(key);
    if (!hold) return;

    const now = Date.now();

    // Finalize hold times for everyone still holding
    for (const [, contestant] of hold.contestants) {
      if (contestant.isHolding) {
        contestant.totalHoldMs += (now - contestant.startedAt);
        contestant.isHolding = false;
      }
    }

    // Find winner: person with highest hold time percentage
    const totalDuration = hold.duration;
    let winner = null;
    let maxHoldMs = -1;

    const percentages = {};

    for (const [userId, contestant] of hold.contestants) {
      const pct = Math.round((contestant.totalHoldMs / totalDuration) * 100);
      percentages[userId] = pct;

      if (contestant.totalHoldMs > maxHoldMs) {
        maxHoldMs = contestant.totalHoldMs;
        winner = contestant;
      }
    }

    if (!winner) {
      this._cancelHold(key);
      return;
    }

    // Get the user object
    const winnerUser = userManager.getUserById(winner.userId);
    const userForClaim = winnerUser || {
      id: winner.userId,
      name: winner.userName,
      color: winner.color,
    };

    // Check if this is a reclaim (conquest)
    const existingCell = gridManager.getCellInfo(hold.x, hold.y);
    const isConquest = !!(existingCell && existingCell.ownerId !== winner.userId);

    // Claim the cell
    const result = gridManager.claimCell(hold.x, hold.y, userForClaim, isConquest);

    // Track contest wins
    if (hold.state === 'contested') {
      const today = new Date().toISOString().split('T')[0];
      const db = require('./db');
      db.updateDailyStats(today, winner.userId, winner.userName, winner.color, 'contests_won');
    }

    // Broadcast resolution
    this.io.emit('hold-resolved', {
      x: hold.x,
      y: hold.y,
      winner: {
        userId: winner.userId,
        userName: winner.userName,
        color: winner.color,
      },
      holdPercentages: percentages,
      wasContested: hold.state === 'contested',
      isConquest: result.isConquest,
    });

    // Broadcast cell claimed
    this.io.emit('cell-claimed', {
      x: hold.x,
      y: hold.y,
      ownerId: winner.userId,
      ownerName: winner.userName,
      color: winner.color,
      state: 'protected',
      claimedAt: result.cell.claimedAt,
    });

    // Clean up
    this._cleanup(key, hold);
  }

  // Cancel a hold (everyone released)
  _cancelHold(key) {
    const hold = this.activeHolds.get(key);
    if (!hold) return;

    this.io.emit('hold-cancelled', {
      x: hold.x,
      y: hold.y,
    });

    this._cleanup(key, hold);
  }

  _cleanup(key, hold) {
    clearInterval(hold.progressTimer);
    clearTimeout(hold.resolveTimer);

    // Remove all user holds for this cell
    for (const [userId] of hold.contestants) {
      if (this.userHolds.get(userId) === key) {
        this.userHolds.delete(userId);
      }
    }

    this.activeHolds.delete(key);
  }

  // Broadcast progress to all clients
  _broadcastProgress(key, hold) {
    const now = Date.now();
    const timeRemaining = Math.max(0, hold.endsAt - now);

    if (timeRemaining <= 0) return;

    this.io.emit('hold-progress', {
      x: hold.x,
      y: hold.y,
      state: hold.state,
      timeRemaining,
      duration: hold.duration,
      contestants: this._getContestantInfo(hold),
    });
  }

  // Get contestant info for broadcasting (strip internal data)
  _getContestantInfo(hold) {
    const now = Date.now();
    return Array.from(hold.contestants.values()).map(c => ({
      userId: c.userId,
      userName: c.userName,
      color: c.color,
      isHolding: c.isHolding,
      holdPercent: Math.round(
        ((c.totalHoldMs + (c.isHolding ? now - c.startedAt : 0)) / hold.duration) * 100
      ),
    }));
  }

  // Clear all holds (for daily reset)
  clearAll() {
    for (const [key, hold] of this.activeHolds) {
      clearInterval(hold.progressTimer);
      clearTimeout(hold.resolveTimer);
    }
    this.activeHolds.clear();
    this.userHolds.clear();
  }
}

module.exports = new HoldManager();
