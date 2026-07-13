// GridWars — Shared client constants
export const GRID_WIDTH = 50;
export const GRID_HEIGHT = 50;

// Cell sizes
export const CELL_SIZE = 16;
export const CELL_GAP = 1;
export const CELL_RADIUS = 2;

// Hold durations (must match server)
export const HOLD_DURATION_SOLO = 4000;
export const HOLD_DURATION_CONTEST = 15000;

// Personal cooldown
export const PERSONAL_COOLDOWN = 15000;

// Cell states
export const CELL_STATES = {
  UNCLAIMED: 'unclaimed',
  BEING_HELD: 'holding',
  CONTESTED: 'contested',
  PROTECTED: 'protected',
  RECLAIMABLE: 'reclaimable',
  OWNED: 'owned',
};

// Colors
export const COLORS = {
  BG_PRIMARY: '#0a0e1a',
  BG_SECONDARY: '#111827',
  BG_CELL_EMPTY: '#1a1f2e',
  BG_GLASS: 'rgba(17, 24, 39, 0.8)',
  BORDER_GLASS: 'rgba(255, 255, 255, 0.08)',
  TEXT_PRIMARY: '#f1f5f9',
  TEXT_SECONDARY: '#94a3b8',
  ACCENT: '#6366f1',
  ACCENT_GLOW: 'rgba(99, 102, 241, 0.4)',
  SUCCESS: '#22c55e',
  DANGER: '#ef4444',
  WARNING: '#f59e0b',
  GRID_LINE: '#1e2538',
};
