// GridWars — Socket.IO connection hook
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { PERSONAL_COOLDOWN } from '../utils/constants';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [gridData, setGridData] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [resetIn, setResetIn] = useState(0);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeHolds, setActiveHolds] = useState(new Map());
  const [leaderboard, setLeaderboard] = useState([]);
  const [activities, setActivities] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // Feature expansion states
  const [mapEvents, setMapEvents] = useState([]);
  const [goldenCells, setGoldenCells] = useState(new Set());
  const [surgeCells, setSurgeCells] = useState(new Set());
  const [screenShake, setScreenShake] = useState(false);
  const [powerupEffects, setPowerupEffects] = useState([]);
  const [inventory, setInventory] = useState({ bomb: 0, freeze: 0, shield: 0 });

  // Grid cells stored as Map
  const cellsRef = useRef(new Map());
  const userRef = useRef(null);
  const [cellsVersion, setCellsVersion] = useState(0); // Trigger re-renders

  useEffect(() => {
    const url = import.meta.env.PROD ? undefined : 'http://localhost:3001';
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('⚔️ Connected to GridWars');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from GridWars');
    });

    // Initial state
    socket.on('init', (data) => {
      setUser(data.user);
      userRef.current = data.user;
      setInventory(data.user.inventory || { bomb: 0, freeze: 0, shield: 0 });
      setOnlineCount(data.onlineCount);
      setResetIn(data.resetIn);
      setChatHistory(data.chatHistory || []);

      // Load grid cells
      const cells = new Map();
      for (const cell of data.grid.cells) {
        cells.set(`${cell.x},${cell.y}`, cell);
      }
      cellsRef.current = cells;
      setCellsVersion(v => v + 1);

      setGridData({
        width: data.grid.width,
        height: data.grid.height,
      });

      // Load active holds
      const holds = new Map();
      for (const hold of (data.activeHolds || [])) {
        holds.set(`${hold.x},${hold.y}`, hold);
      }
      setActiveHolds(holds);
    });

    // Cell updates
    socket.on('cell-claimed', (data) => {
      cellsRef.current.set(`${data.x},${data.y}`, data);
      setCellsVersion(v => v + 1);
    });

    socket.on('cell-reclaimable', (data) => {
      const cell = cellsRef.current.get(`${data.x},${data.y}`);
      if (cell) {
        cell.state = 'reclaimable';
        setCellsVersion(v => v + 1);
      }
    });

    socket.on('cell-permanent', (data) => {
      const cell = cellsRef.current.get(`${data.x},${data.y}`);
      if (cell) {
        cell.state = 'owned';
        setCellsVersion(v => v + 1);
      }
    });

    // Hold events
    socket.on('hold-started', (data) => {
      setActiveHolds(prev => {
        const next = new Map(prev);
        next.set(`${data.x},${data.y}`, data);
        return next;
      });
    });

    socket.on('hold-progress', (data) => {
      setActiveHolds(prev => {
        const next = new Map(prev);
        next.set(`${data.x},${data.y}`, data);
        return next;
      });
    });

    socket.on('hold-contested', (data) => {
      setActiveHolds(prev => {
        const next = new Map(prev);
        next.set(`${data.x},${data.y}`, data);
        return next;
      });
      addNotification('⚔️ Contest started!', 'warning');
    });

    socket.on('hold-released', (data) => {
      // Update hold contestants
      setActiveHolds(prev => {
        const next = new Map(prev);
        const hold = next.get(`${data.x},${data.y}`);
        if (hold && hold.contestants) {
          hold.contestants = hold.contestants.filter(c => c.userId !== data.userId);
          if (hold.contestants.length === 0) {
            next.delete(`${data.x},${data.y}`);
          }
        }
        return next;
      });
    });

    socket.on('hold-resolved', (data) => {
      setActiveHolds(prev => {
        const next = new Map(prev);
        next.delete(`${data.x},${data.y}`);
        return next;
      });

      // If current user won, start cooldown
      if (userRef.current && data.winner && data.winner.userId === userRef.current.id) {
        setCooldownUntil(Date.now() + PERSONAL_COOLDOWN);
      }
    });

    // Surround captures
    socket.on('cells-surrounded', (data) => {
      addNotification(`🏰 ${data.capturer.name} surrounded and captured ${data.count} cells!`, 'warning');
    });

    socket.on('hold-cancelled', (data) => {
      setActiveHolds(prev => {
        const next = new Map(prev);
        next.delete(`${data.x},${data.y}`);
        return next;
      });
    });

    // Rejected claims
    socket.on('claim-rejected', (data) => {
      addNotification(`❌ ${data.reason}`, 'error');
    });

    // Leaderboard
    socket.on('leaderboard', (data) => {
      setLeaderboard(data);
    });

    // Chat
    socket.on('chat-message', (msg) => {
      setChatHistory(prev => [...prev.slice(-99), msg]);
    });

    // Activity feed
    socket.on('activity', (data) => {
      setActivities(prev => [...prev.slice(-49), data]);
    });

    // User events
    socket.on('user-joined', (data) => {
      setOnlineCount(data.onlineCount);
    });

    socket.on('user-left', (data) => {
      setOnlineCount(data.onlineCount);
    });

    // Username update
    socket.on('user-updated', (data) => {
      setUser(prev => ({ ...prev, name: data.name, avatar: data.avatar }));
      userRef.current = { ...userRef.current, name: data.name, avatar: data.avatar };
    });

    // Achievements
    socket.on('achievement', (data) => {
      setAchievements(prev => [...prev, { ...data, id: Date.now() }]);
      // Auto-remove after 4 seconds
      setTimeout(() => {
        setAchievements(prev => prev.slice(1));
      }, 4000);
    });

    // Map Events
    socket.on('map-event', (data) => {
      setMapEvents(prev => [...prev, { ...data, id: Date.now() }]);
      setTimeout(() => setMapEvents(prev => prev.slice(1)), 4000);

      if (data.type === 'golden-cells') {
        setGoldenCells(new Set(data.positions.map(p => `${p.x},${p.y}`)));
      }
      if (data.type === 'power-surge') {
        setSurgeCells(new Set(data.positions.map(p => `${p.x},${p.y}`)));
      }
      if (data.type === 'surge-ended') {
        setSurgeCells(new Set());
      }
      if (data.type === 'earthquake') {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 500);
      }
    });

    // Powerup Effects
    socket.on('powerup-effect', (data) => {
      setPowerupEffects(prev => [...prev, { ...data, id: Date.now(), expiresAt: Date.now() + 2000 }]);
      setTimeout(() => setPowerupEffects(prev => prev.filter(e => e.id !== data.id)), 2000);
    });

    // Inventory Updates
    socket.on('inventory-updated', (newInventory) => {
      setInventory(newInventory);
    });

    socket.on('powerup-rejected', (data) => {
      addNotification(`Failed to use powerup: ${data.reason}`, 'error');
    });

    // Daily reset
    socket.on('daily-reset', () => {
      cellsRef.current.clear();
      setCellsVersion(v => v + 1);
      setActiveHolds(new Map());
      setLeaderboard([]);
      setActivities([]);
      setChatHistory([]);
      addNotification('🌅 New day! The grid has been reset!', 'success');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function addNotification(message, type = 'info') {
    const notif = { id: Date.now(), message, type };
    setNotifications(prev => [...prev, notif]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    }, 3000);
  }

  // Actions
  const startHold = useCallback((x, y) => {
    socketRef.current?.emit('start-hold', { x, y });
  }, []);

  const releaseHold = useCallback(() => {
    socketRef.current?.emit('release-hold');
  }, []);

  const sendChat = useCallback((text) => {
    socketRef.current?.emit('chat-message', { text });
  }, []);

  const requestCellInfo = useCallback((x, y) => {
    socketRef.current?.emit('cell-info', { x, y });
  }, []);

  const updateUsername = useCallback((name) => {
    socketRef.current?.emit('update-username', { name });
  }, []);

  const usePowerup = useCallback((type, x, y) => {
    socketRef.current?.emit('use-powerup', { type, x, y });
  }, []);

  return {
    connected,
    user,
    gridData,
    cells: cellsRef,
    cellsVersion,
    activeHolds,
    onlineCount,
    resetIn,
    leaderboard,
    chatHistory,
    activities,
    achievements,
    notifications,
    cooldownUntil,
    setCooldownUntil,
    startHold,
    releaseHold,
    sendChat,
    requestCellInfo,
    updateUsername,
    usePowerup,
    
    // Expansion states
    mapEvents,
    goldenCells,
    surgeCells,
    screenShake,
    powerupEffects,
    inventory,
  };
}
