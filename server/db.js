// GridWars — SQLite Database Layer
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB_PATH } = require('./constants');

let db = null;

function init() {
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS cells (
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      color TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'protected',
      claim_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (x, y)
    );

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      color TEXT NOT NULL,
      cells_claimed INTEGER NOT NULL DEFAULT 0,
      cells_conquered INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      contests_won INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, user_id)
    );
  `);

  return db;
}

// Load all cells from database
function loadGrid() {
  if (!db) init();
  const rows = db.prepare('SELECT * FROM cells').all();
  const grid = new Map();
  for (const row of rows) {
    grid.set(`${row.x},${row.y}`, {
      x: row.x,
      y: row.y,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      color: row.color,
      claimedAt: row.claimed_at,
      state: row.state,
      claimCount: row.claim_count,
    });
  }
  return grid;
}

// Save or update a single cell
const upsertCell = (() => {
  let stmt = null;
  return (cell) => {
    if (!db) init();
    if (!stmt) {
      stmt = db.prepare(`
        INSERT INTO cells (x, y, owner_id, owner_name, color, claimed_at, state, claim_count)
        VALUES (@x, @y, @ownerId, @ownerName, @color, @claimedAt, @state, @claimCount)
        ON CONFLICT(x, y) DO UPDATE SET
          owner_id = @ownerId,
          owner_name = @ownerName,
          color = @color,
          claimed_at = @claimedAt,
          state = @state,
          claim_count = @claimCount
      `);
    }
    stmt.run({
      x: cell.x,
      y: cell.y,
      ownerId: cell.ownerId,
      ownerName: cell.ownerName,
      color: cell.color,
      claimedAt: cell.claimedAt,
      state: cell.state,
      claimCount: cell.claimCount || 1,
    });
  };
})();

// Update cell state (protected → reclaimable → owned)
function updateCellState(x, y, state) {
  if (!db) init();
  db.prepare('UPDATE cells SET state = ? WHERE x = ? AND y = ?').run(state, x, y);
}

// Clear all cells (daily reset)
function clearAllCells() {
  if (!db) init();
  db.prepare('DELETE FROM cells').run();
}

// Update daily stats
function updateDailyStats(date, userId, userName, color, field, increment = 1) {
  if (!db) init();
  db.prepare(`
    INSERT INTO daily_stats (date, user_id, user_name, color, ${field})
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, user_id) DO UPDATE SET
      ${field} = ${field} + ?,
      user_name = ?,
      color = ?
  `).run(date, userId, userName, color, increment, increment, userName, color);
}

// Update best streak if higher
function updateBestStreak(date, userId, userName, color, streak) {
  if (!db) init();
  db.prepare(`
    INSERT INTO daily_stats (date, user_id, user_name, color, best_streak)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, user_id) DO UPDATE SET
      best_streak = MAX(best_streak, ?),
      user_name = ?,
      color = ?
  `).run(date, userId, userName, color, streak, streak, userName, color);
}

// Get today's leaderboard stats
function getDailyStats(date) {
  if (!db) init();
  return db.prepare('SELECT * FROM daily_stats WHERE date = ? ORDER BY cells_claimed DESC').all(date);
}

function getDb() {
  if (!db) init();
  return db;
}

module.exports = {
  init,
  loadGrid,
  upsertCell,
  updateCellState,
  clearAllCells,
  updateDailyStats,
  updateBestStreak,
  getDailyStats,
  getDb,
};
