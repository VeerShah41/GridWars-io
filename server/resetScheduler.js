// GridWars — Reset Scheduler
// Daily grid reset at 5:30 AM IST using node-cron

const cron = require('node-cron');
const gridManager = require('./gridManager');
const holdManager = require('./holdManager');
const achievementManager = require('./achievementManager');
const chatManager = require('./chatManager');

let io = null;
let scheduledTask = null;

function init(socketIo) {
  io = socketIo;

  // Schedule daily reset at 5:30 AM IST
  // IST = UTC+5:30, so 5:30 AM IST = 00:00 UTC
  // node-cron runs in server timezone, so we use the RESET_CRON value
  // For Railway/production, set TZ=Asia/Kolkata
  scheduledTask = cron.schedule('30 5 * * *', () => {
    performReset();
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('Reset scheduler initialized — daily reset at 5:30 AM IST');
}

function performReset() {
  console.log('🔄 Performing daily grid reset...');

  // Cancel all active holds
  holdManager.clearAll();

  // Reset the grid
  gridManager.resetGrid();

  // Reset achievements
  achievementManager.resetAll();

  // Clear chat
  chatManager.clear();

  // Broadcast to all clients
  if (io) {
    io.emit('daily-reset', {
      timestamp: Date.now(),
      message: '🌅 New day, new battles! The grid has been reset.',
    });
  }

  console.log('✅ Daily reset complete');
}

// Get time until next reset (5:30 AM IST)
function getTimeUntilReset() {
  const now = new Date();

  // Convert to IST
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istNow = new Date(now.getTime() + istOffset);

  // Create today's 5:30 AM IST in UTC
  const resetToday = new Date(istNow);
  resetToday.setHours(5, 30, 0, 0);

  // If we're past 5:30 AM IST today, target tomorrow
  let resetTime = new Date(resetToday.getTime() - istOffset); // Convert back to UTC
  if (now >= resetTime) {
    resetTime = new Date(resetTime.getTime() + 24 * 60 * 60 * 1000);
  }

  return resetTime.getTime() - now.getTime();
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { init, performReset, getTimeUntilReset, stop };
