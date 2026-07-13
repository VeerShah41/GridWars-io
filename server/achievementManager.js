// GridWars — Achievement Manager
// Tracks and triggers achievements for users

class AchievementManager {
  constructor() {
    // userId → Set of achievement IDs already unlocked
    this.unlocked = new Map();
    this.io = null;
  }

  init(io) {
    this.io = io;
  }

  // Check and trigger achievements after a claim
  checkAfterClaim(userId, socketId, context) {
    const {
      isConquest,
      wasContested,
      streak,
      totalCells,
      hasTerritory,
      territorySize,
      isFirstClaimOfDay,
      claimedInAllQuadrants,
    } = context;

    const triggered = [];

    // First Blood — first cell ever
    if (totalCells === 1) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'first_blood',
        title: '🎯 First Blood',
        description: 'Claimed your first cell!',
      }));
    }

    // Conqueror — reclaim from another player
    if (isConquest) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'conqueror',
        title: '⚔️ Conqueror',
        description: 'Reclaimed a cell from another player!',
      }));
    }

    // Gladiator — win a contested hold
    if (wasContested) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'gladiator',
        title: '⚔️ Gladiator',
        description: 'Won a contested hold battle!',
      }));
    }

    // On Fire — streak of 5+
    if (streak >= 5) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'on_fire',
        title: '🔥 On Fire!',
        description: 'Achieved a streak of 5 claims!',
      }));
    }

    // Emperor — 50+ cells
    if (totalCells >= 50) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'emperor',
        title: '👑 Emperor',
        description: 'Own 50 or more cells simultaneously!',
      }));
    }

    // Kingdom Builder — form first territory
    if (hasTerritory) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'kingdom_builder',
        title: '🏰 Kingdom Builder',
        description: 'Formed your first territory (3+ adjacent cells)!',
      }));
    }

    // Warlord — territory of 10+
    if (territorySize >= 10) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'warlord',
        title: '🗡️ Warlord',
        description: 'Built a massive territory of 10+ cells!',
      }));
    }

    // Early Bird — first claim after reset
    if (isFirstClaimOfDay) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'early_bird',
        title: '🌅 Early Bird',
        description: 'First claim after daily reset!',
      }));
    }

    // Explorer — cells in all 4 quadrants
    if (claimedInAllQuadrants) {
      triggered.push(this._tryUnlock(userId, socketId, {
        id: 'explorer',
        title: '🗺️ Explorer',
        description: 'Claimed cells in all 4 quadrants!',
      }));
    }

    return triggered.filter(Boolean);
  }

  _tryUnlock(userId, socketId, achievement) {
    if (!this.unlocked.has(userId)) {
      this.unlocked.set(userId, new Set());
    }

    const userAchievements = this.unlocked.get(userId);
    if (userAchievements.has(achievement.id)) {
      return null; // Already unlocked
    }

    userAchievements.add(achievement.id);

    // Emit to the specific user
    if (this.io && socketId) {
      this.io.to(socketId).emit('achievement', achievement);
    }

    return achievement;
  }

  // Reset all achievements (daily)
  resetAll() {
    this.unlocked.clear();
  }

  // Get user's achievements
  getUserAchievements(userId) {
    return this.unlocked.get(userId) || new Set();
  }
}

module.exports = new AchievementManager();
