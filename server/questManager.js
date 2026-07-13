// Daily quest assignment and tracking
const db = require('./db');

const QUEST_TYPES = [
  { id: 'capture_10', desc: 'Capture 10 cells', target: 10, xp: 50 },
  { id: 'conquer_5', desc: 'Conquer 5 enemy cells', target: 5, xp: 75 },
  { id: 'surround_1', desc: 'Capture a cell via surround', target: 1, xp: 100 },
  { id: 'play_time', desc: 'Hold a cell for 5 minutes', target: 5, xp: 50 },
];

class QuestManager {
  constructor(io) {
    this.io = io;
    this.userQuests = new Map(); // userId -> [{ id, progress, target, completed, xp }]
  }

  assignDailyQuests(userId) {
    if (!this.userQuests.has(userId)) {
      // Pick 3 random quests
      const shuffled = [...QUEST_TYPES].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3).map(q => ({
        ...q,
        progress: 0,
        completed: false
      }));
      this.userQuests.set(userId, selected);
    }
    return this.userQuests.get(userId);
  }

  getQuests(userId) {
    return this.assignDailyQuests(userId);
  }

  progressQuest(userId, type, amount = 1, xpManager) {
    const quests = this.getQuests(userId);
    let updated = false;

    for (const q of quests) {
      if (q.id === type && !q.completed) {
        q.progress = Math.min(q.target, q.progress + amount);
        updated = true;

        if (q.progress >= q.target) {
          q.completed = true;
          xpManager.addXP(userId, q.xp);
          if (this.io) {
            this.io.to(userId).emit('quest-completed', q); // Needs a way to send to specific socket, or we just broadcast quest update to all sockets of that user.
            // Since our architecture uses socket.id as user.id (which is not ideal but it's what we have), we can emit directly.
          }
        }
      }
    }

    if (updated) {
      // Find user socket and emit
      if (this.io) {
        this.io.sockets.sockets.forEach((s) => {
          if (s.id === userId) {
            s.emit('quests-updated', quests);
          }
        });
      }
    }
  }
}

module.exports = QuestManager;
