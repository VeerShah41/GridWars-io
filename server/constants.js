// GridWars — Server Constants
// All timing, sizing, and configuration values in one place

module.exports = {
  // Grid
  GRID_WIDTH: 50,
  GRID_HEIGHT: 50,

  // Hold mechanic
  HOLD_DURATION_SOLO: 4000,        // 4 seconds for uncontested hold
  HOLD_DURATION_CONTEST: 15000,    // 15 seconds when contested
  HOLD_PROGRESS_INTERVAL: 500,     // Broadcast progress every 500ms

  // Cooldowns & Protection
  PERSONAL_COOLDOWN: 15000,        // 15 seconds between successful claims
  CELL_PROTECTION_DURATION: 900000,  // 15 minutes protection after claim
  RECLAIM_WINDOW_DURATION: 60000,    // 1 minute reclaim window

  // Daily reset
  RESET_CRON: '30 0 * * *',       // 5:30 AM IST = 00:00 UTC (IST is UTC+5:30)
  RESET_TIMEZONE: 'Asia/Kolkata',

  // Territory
  MIN_TERRITORY_SIZE: 3,           // Minimum adjacent cells to form territory

  // Chat
  MAX_CHAT_HISTORY: 100,

  // Activity feed
  MAX_ACTIVITY_HISTORY: 50,

  // Leaderboard
  LEADERBOARD_BROADCAST_INTERVAL: 2000, // Every 2 seconds

  // Streak
  STREAK_TIMEOUT: 8000,            // 8 seconds to maintain streak

  // SQLite
  DB_PATH: process.env.DB_PATH || './data/gridwars.db',
};
