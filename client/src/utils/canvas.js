// GridWars — Canvas rendering helpers
import { CELL_SIZE, CELL_GAP, CELL_RADIUS, GRID_WIDTH, GRID_HEIGHT, COLORS } from './constants';

// Convert grid coordinates to canvas pixel coordinates
export function gridToCanvas(x, y) {
  return {
    px: x * (CELL_SIZE + CELL_GAP),
    py: y * (CELL_SIZE + CELL_GAP),
  };
}

// Convert canvas pixel coordinates to grid coordinates
export function canvasToGrid(px, py, scale, offsetX, offsetY) {
  const x = Math.floor((px / scale - offsetX) / (CELL_SIZE + CELL_GAP));
  const y = Math.floor((py / scale - offsetY) / (CELL_SIZE + CELL_GAP));
  if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
    return { x, y };
  }
  return null;
}

// Draw a rounded rectangle
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draw the entire grid
export function drawGrid(ctx, canvas, cells, activeHolds, hoveredCell, scale, offsetX, offsetY, heatMapMode, heatMapData) {
  const width = canvas.width;
  const height = canvas.height;

  // Clear
  ctx.fillStyle = COLORS.BG_PRIMARY;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(offsetX, offsetY);

  const totalW = GRID_WIDTH * (CELL_SIZE + CELL_GAP);
  const totalH = GRID_HEIGHT * (CELL_SIZE + CELL_GAP);

  // Calculate visible bounds for culling
  const visMinX = Math.max(0, Math.floor(-offsetX / (CELL_SIZE + CELL_GAP)));
  const visMinY = Math.max(0, Math.floor(-offsetY / (CELL_SIZE + CELL_GAP)));
  const visMaxX = Math.min(GRID_WIDTH, Math.ceil((-offsetX + width / scale) / (CELL_SIZE + CELL_GAP)));
  const visMaxY = Math.min(GRID_HEIGHT, Math.ceil((-offsetY + height / scale) / (CELL_SIZE + CELL_GAP)));

  // Draw cells
  for (let x = visMinX; x < visMaxX; x++) {
    for (let y = visMinY; y < visMaxY; y++) {
      const { px, py } = gridToCanvas(x, y);
      const key = `${x},${y}`;
      const cell = cells.get(key);
      const hold = activeHolds.get(key);

      let fillColor = COLORS.BG_CELL_EMPTY;
      let borderColor = null;
      let borderWidth = 0;

      if (heatMapMode && heatMapData) {
        const count = heatMapData[key] || 0;
        const maxCount = 10;
        const intensity = Math.min(count / maxCount, 1);
        if (count > 0) {
          const r = Math.round(59 + intensity * 196);
          const g = Math.round(130 - intensity * 86);
          const b = Math.round(246 - intensity * 178);
          fillColor = `rgb(${r}, ${g}, ${b})`;
        }
      } else if (cell) {
        fillColor = cell.color;

        if (cell.state === 'protected') {
          // Subtle inner glow
          borderColor = 'rgba(255, 255, 255, 0.15)';
          borderWidth = 1;
        } else if (cell.state === 'reclaimable') {
          // Pulsing amber border
          const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
          borderColor = `rgba(245, 158, 11, ${pulse})`;
          borderWidth = 2;
        }
      }

      // Draw cell
      roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Draw border
      if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }

      // Hold indicator
      if (hold) {
        drawHoldIndicator(ctx, px, py, hold);
      }

      // Hover highlight
      if (hoveredCell && hoveredCell.x === x && hoveredCell.y === y) {
        roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

// Draw hold progress indicator on a cell
function drawHoldIndicator(ctx, px, py, hold) {
  const centerX = px + CELL_SIZE / 2;
  const centerY = py + CELL_SIZE / 2;
  const radius = CELL_SIZE / 2 + 2;

  if (!hold.contestants || hold.contestants.length === 0) return;

  // Draw progress ring for each contestant
  const contestantCount = hold.contestants.length;

  hold.contestants.forEach((contestant, index) => {
    const progress = 1 - (hold.timeRemaining / hold.duration);
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * progress);

    const ringRadius = radius + (index * 3);

    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, startAngle, endAngle);
    ctx.strokeStyle = contestant.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  });

  // Contested glow effect
  if (hold.state === 'contested') {
    const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.2})`;
    ctx.fill();
  }
}

// Draw territory borders
export function drawTerritoryBorders(ctx, territories, scale, offsetX, offsetY) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(offsetX, offsetY);

  // Group borders by owner
  const ownerBorders = new Map();

  for (const [, userData] of territories) {
    for (const territory of userData.territories) {
      for (const cell of territory.cells) {
        const key = `${cell.x},${cell.y}`;
        if (!ownerBorders.has(userData.userId)) {
          ownerBorders.set(userData.userId, []);
        }
      }
    }
  }

  ctx.restore();
}

// Particle system for claim effects
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const speed = 1.5 + Math.random() * 2.5;
      this.particles.push({
        x: x + CELL_SIZE / 2,
        y: y + CELL_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1,
        size: 2 + Math.random() * 3,
        life: 1,
        decay: 0.015 + Math.random() * 0.01,
      });
    }
  }

  emitContest(x, y, color1, color2) {
    // Lightning-like sparks between two colors
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      const color = Math.random() > 0.5 ? color1 : color2;
      this.particles.push({
        x: x + CELL_SIZE / 2,
        y: y + CELL_SIZE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1,
        size: 1 + Math.random() * 2,
        life: 1,
        decay: 0.025 + Math.random() * 0.02,
      });
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= p.decay;
      p.alpha = p.life;
      p.size *= 0.98;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx, scale, offsetX, offsetY) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(offsetX, offsetY);

    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  get hasParticles() {
    return this.particles.length > 0;
  }
}
