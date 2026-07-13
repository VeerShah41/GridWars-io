// GridWars — User Manager
// Handles user identity: random names, colors, avatars

const ADJECTIVES = [
  'Cosmic', 'Neon', 'Swift', 'Shadow', 'Crystal', 'Thunder', 'Crimson', 'Silver',
  'Golden', 'Mystic', 'Phantom', 'Savage', 'Blazing', 'Frozen', 'Electric', 'Iron',
  'Lunar', 'Solar', 'Stealth', 'Turbo', 'Hyper', 'Mega', 'Ultra', 'Dark',
  'Brave', 'Noble', 'Fierce', 'Wild', 'Silent', 'Rapid', 'Astral', 'Vivid',
];

const ANIMALS = [
  'Wolf', 'Falcon', 'Bear', 'Tiger', 'Eagle', 'Shark', 'Panther', 'Hawk',
  'Dragon', 'Phoenix', 'Viper', 'Lion', 'Fox', 'Raven', 'Cobra', 'Jaguar',
  'Lynx', 'Orca', 'Mantis', 'Condor', 'Badger', 'Hornet', 'Stallion', 'Raptor',
  'Kraken', 'Griffin', 'Puma', 'Wolverine', 'Cobra', 'Owl', 'Rhino', 'Bison',
];

// Generate vibrant, distinct HSL colors
function generateColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.floor(Math.random() * 25); // 65-90%
  const lightness = 55 + Math.floor(Math.random() * 15);  // 55-70%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${animal}${num}`;
}

function generateAvatarUrl(seed) {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

class UserManager {
  constructor() {
    // socketId → user data
    this.users = new Map();
    // userId → socketId (for reverse lookup)
    this.userIdToSocket = new Map();
  }

  addUser(socketId) {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const name = generateUsername();
    const color = generateColor();
    const avatar = generateAvatarUrl(name);

    const user = { id, name, color, avatar, socketId };
    this.users.set(socketId, user);
    this.userIdToSocket.set(id, socketId);

    return user;
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      this.userIdToSocket.delete(user.id);
      this.users.delete(socketId);
    }
    return user;
  }

  getUser(socketId) {
    return this.users.get(socketId);
  }

  getUserById(userId) {
    const socketId = this.userIdToSocket.get(userId);
    return socketId ? this.users.get(socketId) : null;
  }

  getOnlineCount() {
    return this.users.size;
  }

  updateUsername(socketId, newName) {
    const user = this.users.get(socketId);
    if (!user) return null;
    // Sanitize
    newName = newName.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 20);
    if (newName.length < 2) return null;
    user.name = newName;
    user.avatar = generateAvatarUrl(newName);
    return user;
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }
}

module.exports = new UserManager();
