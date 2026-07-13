// Handles powerup generation and effects
const { GRID_WIDTH, GRID_HEIGHT } = require('./constants');

class PowerUpManager {
  constructor(io, gridManager) {
    this.io = io;
    this.gridManager = gridManager;
    // Map userId -> { bomb: 0, freeze: 0, shield: 0 }
    this.inventory = new Map();
  }

  getInventory(userId) {
    if (!this.inventory.has(userId)) {
      this.inventory.set(userId, { bomb: 1, freeze: 1, shield: 1 }); // Give 1 of each to start
    }
    return this.inventory.get(userId);
  }

  grantPowerUp(userId, type, amount = 1) {
    const inv = this.getInventory(userId);
    inv[type] += amount;
    return inv;
  }

  usePowerUp(userId, type, x, y, user) {
    const inv = this.getInventory(userId);
    if (!inv[type] || inv[type] <= 0) {
      return { success: false, reason: `No ${type} available` };
    }

    inv[type] -= 1;

    switch (type) {
      case 'bomb':
        this._useBomb(x, y, user);
        break;
      case 'freeze':
        this._useFreeze(x, y, user);
        break;
      case 'shield':
        this._useShield(x, y, user);
        break;
    }

    // Broadcast effect
    this.io.emit('powerup-effect', { type, x, y, userColor: user.color });

    return { success: true, inventory: inv };
  }

  _useBomb(cx, cy, user) {
    const affected = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
          const cell = this.gridManager.getCellInfo(x, y);
          if (cell && cell.ownerId !== user.id && cell.state !== 'owned') {
            this.gridManager.resetCell(x, y);
            affected.push({ x, y });
          }
        }
      }
    }
    
    affected.forEach(({ x, y }) => {
      this.io.emit('cell-claimed', {
        x, y, ownerId: null, ownerName: null, color: null,
        state: null, claimedAt: null, claimCount: 0,
      });
    });

    this.io.emit('activity', {
      type: 'powerup',
      message: `💣 ${user.name} dropped a Bomb at (${cx}, ${cy})!`,
      color: user.color,
      timestamp: Date.now(),
    });
  }

  _useFreeze(x, y, user) {
    this.gridManager.freezeCell(x, y);
    
    this.io.emit('activity', {
      type: 'powerup',
      message: `🧊 ${user.name} froze cell (${x}, ${y})!`,
      color: user.color,
      timestamp: Date.now(),
    });
  }

  _useShield(x, y, user) {
    const cell = this.gridManager.getCellInfo(x, y);
    if (cell && cell.ownerId === user.id) {
      this.gridManager.shieldCell(x, y); // Equivalent to setting state to 'owned' temporarily or permanently?
      // Actually, spec says: sets cell protection timer to +10 minutes
      this.gridManager.addProtection(x, y, 600000);
      
      this.io.emit('activity', {
        type: 'powerup',
        message: `🛡️ ${user.name} shielded their cell at (${x}, ${y})!`,
        color: user.color,
        timestamp: Date.now(),
      });
    }
  }
}

module.exports = PowerUpManager;
