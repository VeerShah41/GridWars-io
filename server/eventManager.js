const { GRID_WIDTH, GRID_HEIGHT } = require('./constants');

class EventManager {
  constructor(io, gridManager) {
    this.io = io;
    this.gridManager = gridManager;
    this.goldenCells = new Set();       // Set of "x,y" strings
    this.frozenCells = new Set();       // Set of "x,y" strings (from freeze/earthquake)
    this.surgeCells = new Set();        // Set of "x,y" strings (instant-claim)
    this.intervals = [];
  }

  start() {
    // Golden cells: every 3 minutes, spawn 3-5 golden cells
    this.intervals.push(setInterval(() => this._spawnGoldenCells(), 180000));

    // Earthquake: every 10 minutes, clear a random 5×5 area
    this.intervals.push(setInterval(() => this._triggerEarthquake(), 600000));

    // Power surge: every 8 minutes, make 5 cells instant-claimable for 15s
    this.intervals.push(setInterval(() => this._triggerPowerSurge(), 480000));

    // First golden cells after 30s
    setTimeout(() => this._spawnGoldenCells(), 30000);
  }

  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }

  _randomPos() {
    return {
      x: Math.floor(Math.random() * GRID_WIDTH),
      y: Math.floor(Math.random() * GRID_HEIGHT),
    };
  }

  _spawnGoldenCells() {
    // Remove old golden cells
    this.goldenCells.clear();

    const count = 3 + Math.floor(Math.random() * 3); // 3-5 cells
    const positions = [];
    for (let i = 0; i < count; i++) {
      const pos = this._randomPos();
      const key = `${pos.x},${pos.y}`;
      this.goldenCells.add(key);
      positions.push(pos);
    }

    this.io.emit('map-event', {
      type: 'golden-cells',
      message: `✨ ${count} Golden Cells appeared! Worth 3× points!`,
      positions,
      duration: 180000, // Last until next spawn
    });

    this.io.emit('activity', {
      type: 'event',
      message: `✨ ${count} Golden Cells have spawned on the map!`,
      timestamp: Date.now(),
    });
  }

  _triggerEarthquake() {
    const center = this._randomPos();
    const affected = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
          this.gridManager.resetCell(x, y); // You'll add this method
          affected.push({ x, y });
        }
      }
    }

    this.io.emit('map-event', {
      type: 'earthquake',
      message: `🌋 Earthquake! A 5×5 area has been cleared!`,
      positions: affected,
      center,
      duration: 3000, // Visual effect duration
    });

    // Broadcast updated cells
    affected.forEach(({ x, y }) => {
      this.io.emit('cell-claimed', {
        x, y, ownerId: null, ownerName: null, color: null,
        state: null, claimedAt: null, claimCount: 0,
      });
    });

    this.io.emit('activity', {
      type: 'event',
      message: `🌋 Earthquake at (${center.x}, ${center.y})! 25 cells wiped out!`,
      timestamp: Date.now(),
    });
  }

  _triggerPowerSurge() {
    this.surgeCells.clear();
    const positions = [];
    for (let i = 0; i < 5; i++) {
      const pos = this._randomPos();
      this.surgeCells.add(`${pos.x},${pos.y}`);
      positions.push(pos);
    }

    this.io.emit('map-event', {
      type: 'power-surge',
      message: `⚡ Power Surge! 5 cells are instant-claimable for 15s!`,
      positions,
      duration: 15000,
    });

    // Remove surge after 15s
    setTimeout(() => {
      this.surgeCells.clear();
      this.io.emit('map-event', { type: 'surge-ended', positions });
    }, 15000);

    this.io.emit('activity', {
      type: 'event',
      message: `⚡ Power Surge! Tap the glowing cells to claim instantly!`,
      timestamp: Date.now(),
    });
  }

  isGolden(x, y) {
    return this.goldenCells.has(`${x},${y}`);
  }

  isSurge(x, y) {
    return this.surgeCells.has(`${x},${y}`);
  }
}

module.exports = EventManager;
