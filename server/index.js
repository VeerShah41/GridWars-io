// GridWars — Server Entry Point
// Express + Socket.IO with all game systems

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const { GRID_WIDTH, GRID_HEIGHT, LEADERBOARD_BROADCAST_INTERVAL } = require('./constants');
const db = require('./db');
const userManager = require('./userManager');
const gridManager = require('./gridManager');
const holdManager = require('./holdManager');
const achievementManager = require('./achievementManager');
const chatManager = require('./chatManager');
const resetScheduler = require('./resetScheduler');
const { calculateTerritories } = require('./territoryCalculator');
const { checkSurrounded } = require('./surroundChecker');
const EventManager = require('./eventManager');
const PowerUpManager = require('./powerUpManager');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
  perMessageDeflate: true, // Compress WebSocket frames
});

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist, {
    maxAge: '1d', // Cache static assets
    etag: true,
  }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), online: userManager.getOnlineCount() });
});

// Initialize all systems
db.init();
gridManager.init(io);
holdManager.init(io);
achievementManager.init(io);
chatManager.init(io);
resetScheduler.init(io);

const eventManager = new EventManager(io, gridManager);
eventManager.start();

const powerUpManager = new PowerUpManager(io, gridManager);

// Track if first claim of the day
let firstClaimToday = false;

// Periodic leaderboard broadcast
let leaderboardTimer = setInterval(() => {
  const cellCounts = gridManager.getCellCounts(eventManager);
  const territories = calculateTerritories(gridManager.cells);

  const leaderboard = cellCounts.map(entry => {
    const terr = territories.get(entry.userId);
    return {
      ...entry,
      territories: terr ? terr.count : 0,
      largestTerritory: terr ? terr.largest : 0,
    };
  });

  io.emit('leaderboard', leaderboard);
}, LEADERBOARD_BROADCAST_INTERVAL);

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Create user
  const user = userManager.addUser(socket.id);
  console.log(`👋 ${user.name} connected (${userManager.getOnlineCount()} online)`);

  // Send initial state
  socket.emit('init', {
    user: {
      id: user.id,
      name: user.name,
      color: user.color,
      avatar: user.avatar,
      inventory: powerUpManager.getInventory(user.id),
    },
    grid: {
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      cells: gridManager.getGridState(),
    },
    activeHolds: holdManager.getActiveHolds(),
    chatHistory: chatManager.getHistory(),
    onlineCount: userManager.getOnlineCount(),
    resetIn: resetScheduler.getTimeUntilReset(),
  });

  // Broadcast user joined
  socket.broadcast.emit('user-joined', {
    name: user.name,
    color: user.color,
    onlineCount: userManager.getOnlineCount(),
  });

  // Broadcast activity
  socket.broadcast.emit('activity', {
    type: 'join',
    message: `👋 ${user.name} joined the battle`,
    color: user.color,
    timestamp: Date.now(),
  });

  // --- Hold Events ---

  socket.on('start-hold', ({ x, y }) => {
    if (gridManager.isFrozen(x, y)) {
      socket.emit('claim-rejected', { reason: 'Cell is frozen!', x, y });
      return;
    }

    if (eventManager.isSurge(x, y)) {
      gridManager.claimCell(x, y, user);
      io.emit('cell-claimed', { x, y, ...gridManager.getCellInfo(x, y) });
      io.emit('activity', {
        type: 'surge-claim',
        message: `⚡ ${user.name} instant-claimed a surge cell!`,
        color: user.color,
        timestamp: Date.now(),
      });
      return; // Skip normal hold
    }

    const result = holdManager.startHold(socket.id, x, y);
    if (!result.success) {
      socket.emit('claim-rejected', {
        reason: result.reason,
        x,
        y,
      });
    } else {
      // Broadcast activity
      io.emit('activity', {
        type: 'hold',
        message: `🖐️ ${user.name} is holding (${x}, ${y})...`,
        color: user.color,
        timestamp: Date.now(),
      });
    }
  });

  socket.on('release-hold', () => {
    holdManager.releaseHold(socket.id);
  });

  socket.on('use-powerup', ({ type, x, y }) => {
    const result = powerUpManager.usePowerUp(user.id, type, x, y, user);
    if (!result.success) {
      socket.emit('powerup-rejected', { reason: result.reason });
    } else {
      socket.emit('inventory-updated', result.inventory);
    }
  });

  // Listen for hold resolutions to check achievements
  const originalResolve = holdManager._resolveHold.bind(holdManager);
  // We handle achievements through the cell-claimed event instead
  socket.on('cell-claimed-check', (data) => {
    // This is handled server-side in the hold resolution
  });

  // --- Chat ---

  socket.on('chat-message', ({ text }) => {
    chatManager.addMessage(user, text);
  });

  // --- Username Update ---

  socket.on('update-username', ({ name }) => {
    const updated = userManager.updateUsername(socket.id, name);
    if (updated) {
      user.name = updated.name;
      user.avatar = updated.avatar;
      socket.emit('user-updated', { name: updated.name, avatar: updated.avatar });
      io.emit('activity', {
        type: 'rename',
        message: `✏️ A user renamed themselves to ${updated.name}`,
        color: updated.color,
        timestamp: Date.now(),
      });
    }
  });

  // --- Cell Info Request ---

  socket.on('cell-info', ({ x, y }) => {
    const cell = gridManager.getCellInfo(x, y);
    socket.emit('cell-info-response', {
      x,
      y,
      cell: cell ? {
        ownerId: cell.ownerId,
        ownerName: cell.ownerName,
        color: cell.color,
        state: cell.state,
        claimedAt: cell.claimedAt,
        claimCount: cell.claimCount,
      } : null,
    });
  });

  // --- Disconnect ---

  socket.on('disconnect', () => {
    holdManager.handleDisconnect(user.id);
    const removed = userManager.removeUser(socket.id);

    if (removed) {
      console.log(`👋 ${removed.name} disconnected (${userManager.getOnlineCount()} online)`);

      io.emit('user-left', {
        name: removed.name,
        onlineCount: userManager.getOnlineCount(),
      });

      io.emit('activity', {
        type: 'leave',
        message: `👋 ${removed.name} left the battle`,
        color: removed.color,
        timestamp: Date.now(),
      });
    }
  });
});

// Hook into hold resolution for achievements
const origResolve = holdManager._resolveHold.bind(holdManager);
holdManager._resolveHold = function(key) {
  const hold = this.activeHolds.get(key);
  if (!hold) return;

  // Call original
  origResolve(key);

  // After resolution, check achievements for the winner
  // The winner info is determined inside _resolveHold, but we can check
  // achievements based on grid state after the claim
  // We do this on a slight delay to ensure grid state is updated
  setTimeout(() => {
    // Find who owns the cell now
    const cell = gridManager.getCellInfo(hold.x, hold.y);
    if (!cell) return;

    const winnerUser = userManager.getUserById(cell.ownerId);
    if (!winnerUser) return;

    // Count this user's cells
    const allCells = gridManager.getGridState().filter(c => c.ownerId === cell.ownerId);
    const totalCells = allCells.length;

    // Check territories
    const territories = calculateTerritories(gridManager.cells);
    const userTerr = territories.get(cell.ownerId);

    // Check quadrants
    const quadrants = new Set();
    const midX = Math.floor(GRID_WIDTH / 2);
    const midY = Math.floor(GRID_HEIGHT / 2);
    for (const c of allCells) {
      if (c.x < midX && c.y < midY) quadrants.add('TL');
      if (c.x >= midX && c.y < midY) quadrants.add('TR');
      if (c.x < midX && c.y >= midY) quadrants.add('BL');
      if (c.x >= midX && c.y >= midY) quadrants.add('BR');
    }

    // Check first claim of day
    const isFirst = !firstClaimToday;
    if (isFirst) firstClaimToday = true;

    achievementManager.checkAfterClaim(cell.ownerId, winnerUser.socketId, {
      isConquest: hold.state === 'contested' || false,
      wasContested: hold.state === 'contested',
      streak: gridManager.getStreak(cell.ownerId),
      totalCells,
      hasTerritory: !!userTerr,
      territorySize: userTerr ? userTerr.largest : 0,
      isFirstClaimOfDay: isFirst,
      claimedInAllQuadrants: quadrants.size === 4,
    });

    // --- Surround Check ---
    // After every claim, check if any opponent cells are now surrounded
    const surrounded = checkSurrounded(gridManager.cells, cell.ownerId);
    if (surrounded.length > 0) {
      console.log(`🏰 ${winnerUser.name} surrounded ${surrounded.length} cells!`);

      const capturedCells = [];
      for (const s of surrounded) {
        const captured = gridManager.captureCell(s.x, s.y, winnerUser);
        capturedCells.push({
          x: s.x,
          y: s.y,
          ownerId: winnerUser.id,
          ownerName: winnerUser.name,
          color: winnerUser.color,
          state: 'protected',
          claimedAt: captured.claimedAt,
        });
      }

      // Broadcast all captured cells
      io.emit('cells-surrounded', {
        capturer: { id: winnerUser.id, name: winnerUser.name, color: winnerUser.color },
        cells: capturedCells,
        count: capturedCells.length,
      });

      // Also emit individual cell-claimed for each so grid updates
      for (const c of capturedCells) {
        io.emit('cell-claimed', c);
      }

      // Activity feed
      io.emit('activity', {
        type: 'surround',
        message: `🏰 ${winnerUser.name} surrounded and captured ${capturedCells.length} cells!`,
        color: winnerUser.color,
        timestamp: Date.now(),
      });
    }
  }, 100);
};

// Reset first claim flag on daily reset
const origPerformReset = resetScheduler.performReset;
resetScheduler.performReset = function() {
  firstClaimToday = false;
  origPerformReset();
};

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n⚔️  GridWars server running on port ${PORT}`);
  console.log(`   Grid: ${GRID_WIDTH}×${GRID_HEIGHT} (${GRID_WIDTH * GRID_HEIGHT} cells)`);
  console.log(`   Next reset: ${Math.round(resetScheduler.getTimeUntilReset() / 1000 / 60)} minutes\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  resetScheduler.stop();
  clearInterval(leaderboardTimer);
  server.close();
  process.exit(0);
});
