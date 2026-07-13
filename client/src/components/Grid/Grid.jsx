// GridWars — Canvas Grid Component (3D + Perf Optimized)
// Renders 50×50 grid with 3D depth, zoom, pan, hold-to-claim, joystick, throttled events
import { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react';
import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE, CELL_GAP, CELL_RADIUS, COLORS } from '../../utils/constants';
import { canvasToGrid, roundRect } from '../../utils/canvas';
import { computeVisibleCells } from '../../utils/fogOfWar';

const TOTAL_W = GRID_WIDTH * (CELL_SIZE + CELL_GAP);
const TOTAL_H = GRID_HEIGHT * (CELL_SIZE + CELL_GAP);

// 3D depth constants
const DEPTH = 3;
const SHADOW_COLOR = 'rgba(0,0,0,0.35)';
const HIGHLIGHT_COLOR = 'rgba(255,255,255,0.08)';

// Throttle helper
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

function Grid({ cells, cellsVersion, activeHolds, user, onStartHold, onReleaseHold, heatMapMode, joystickDelta, goldenCells, surgeCells, fogEnabled, activePowerup, onUsePowerup, onPowerupUsed, powerupEffects }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);

  const [hoveredCell, setHoveredCell] = useState(null);
  const [isHolding, setIsHolding] = useState(false);
  const [holdCell, setHoldCell] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  // Viewport refs (avoid re-renders during drag/zoom)
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const holdingRef = useRef(false);
  const touchRef = useRef({ startDist: 0, startScale: 1 });

  // Joystick pan (rAF loop applies delta each frame)
  const joystickRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (joystickDelta) {
      joystickRef.current = joystickDelta;
    } else {
      joystickRef.current = { x: 0, y: 0 };
    }
  }, [joystickDelta]);

  // Compute fog
  const fogVisible = useMemo(() => {
    if (!fogEnabled || !user) return null;
    const ownedKeys = [];
    cells.current.forEach((cell, key) => {
      if (cell.ownerId === user.id) ownedKeys.push(key);
    });
    return computeVisibleCells(ownedKeys, hoveredCell);
  }, [fogEnabled, cellsVersion, user?.id, hoveredCell, cells]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // Center initially
      if (offsetRef.current.x === 0 && offsetRef.current.y === 0) {
        const sx = rect.width / TOTAL_W;
        const sy = rect.height / TOTAL_H;
        const initialScale = Math.min(sx, sy) * 0.85;
        const ox = (rect.width / initialScale - TOTAL_W) / 2;
        const oy = (rect.height / initialScale - TOTAL_H) / 2;
        scaleRef.current = initialScale;
        offsetRef.current = { x: ox, y: oy };
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function render() {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const s = scaleRef.current;
      let ox = offsetRef.current.x;
      let oy = offsetRef.current.y;

      // Apply joystick pan
      const jx = joystickRef.current.x;
      const jy = joystickRef.current.y;
      if (Math.abs(jx) > 0.05 || Math.abs(jy) > 0.05) {
        const speed = 6 / s;
        ox -= jx * speed;
        oy -= jy * speed;
        offsetRef.current = { x: ox, y: oy };
      }

      const cellMap = cells.current;

      // Clear
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = COLORS.BG_PRIMARY;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.scale(s, s);
      ctx.translate(ox, oy);

      // Visible bounds (culling)
      const step = CELL_SIZE + CELL_GAP;
      const visMinX = Math.max(0, Math.floor(-ox / step) - 1);
      const visMinY = Math.max(0, Math.floor(-oy / step) - 1);
      const visMaxX = Math.min(GRID_WIDTH, Math.ceil((-ox + w / s) / step) + 1);
      const visMaxY = Math.min(GRID_HEIGHT, Math.ceil((-oy + h / s) / step) + 1);

      // --- Draw 3D cells ---
      for (let x = visMinX; x < visMaxX; x++) {
        for (let y = visMinY; y < visMaxY; y++) {
          const px = x * step;
          const py = y * step;
          const key = `${x},${y}`;
          const cell = cellMap.get(key);
          const hold = activeHolds.get(key);

          const fillColor = cell ? cell.color : COLORS.BG_CELL_EMPTY;

          // 3D Shadow (bottom-right offset)
          if (cell) {
            roundRect(ctx, px + DEPTH * 0.6, py + DEPTH, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.fillStyle = SHADOW_COLOR;
            ctx.fill();
          }

          // Main cell face
          roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
          ctx.fillStyle = fillColor;
          ctx.fill();

          // Golden cell shimmer
          if (goldenCells && goldenCells.has(key)) {
            const shimmer = Math.sin(Date.now() / 400 + x * 0.5) * 0.15 + 0.35;
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.fillStyle = `rgba(255, 215, 0, ${shimmer})`;
            ctx.fill();

            // Gold border
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.strokeStyle = `rgba(255, 215, 0, 0.7)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Surge cell glow
          if (surgeCells && surgeCells.has(key)) {
            const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.4;
            ctx.shadowColor = 'rgba(99, 102, 241, 0.8)';
            ctx.shadowBlur = 12;
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.strokeStyle = `rgba(99, 102, 241, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          // 3D Top highlight
          if (cell) {
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE * 0.45, CELL_RADIUS);
            ctx.fillStyle = HIGHLIGHT_COLOR;
            ctx.fill();

            // Left edge highlight for 3D
            ctx.beginPath();
            ctx.moveTo(px + CELL_RADIUS, py);
            ctx.lineTo(px, py + CELL_RADIUS);
            ctx.lineTo(px, py + CELL_SIZE - CELL_RADIUS);
            ctx.lineTo(px + CELL_RADIUS, py + CELL_SIZE);
            ctx.lineTo(px + CELL_RADIUS, py);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
          } else {
            // Empty cell subtle border
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.strokeStyle = 'rgba(255,255,255,0.025)';
            ctx.lineWidth = 0.3;
            ctx.stroke();
          }

          // State indicators
          if (cell) {
            if (cell.state === 'protected') {
              roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
              ctx.strokeStyle = 'rgba(255,255,255,0.18)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            } else if (cell.state === 'reclaimable') {
              const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
              roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
              ctx.strokeStyle = `rgba(245,158,11,${pulse})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }

            // Owner initial when zoomed
            if (s > 1.5 && cell.ownerName) {
              const initial = cell.ownerName.charAt(0).toUpperCase();
              const fontSize = Math.max(6, Math.min(10, CELL_SIZE * 0.55));
              ctx.fillStyle = 'rgba(255,255,255,0.5)';
              ctx.font = `700 ${fontSize}px Inter`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(initial, px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 0.5);
            }
          }

          // Hold progress ring
          if (hold && hold.contestants?.length > 0) {
            const cx = px + CELL_SIZE / 2;
            const cy = py + CELL_SIZE / 2;
            const radius = CELL_SIZE / 2 + 3;
            const progress = hold.timeRemaining != null ? 1 - (hold.timeRemaining / hold.duration) : 0;

            hold.contestants.forEach((contestant, idx) => {
              if (!contestant.isHolding) return;
              const startAngle = -Math.PI / 2;
              const endAngle = startAngle + Math.PI * 2 * progress;
              const r = radius + idx * 3;

              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(255,255,255,0.06)';
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(cx, cy, r, startAngle, endAngle);
              ctx.strokeStyle = contestant.color;
              ctx.lineWidth = 2;
              ctx.lineCap = 'round';
              ctx.stroke();
            });

            if (hold.state === 'contested') {
              const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.15;
              ctx.beginPath();
              ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(239,68,68,${pulse})`;
              ctx.fill();
            }
          }

          // Hover highlight
          if (hoveredCell && hoveredCell.x === x && hoveredCell.y === y) {
            roundRect(ctx, px - 1, py - 1, CELL_SIZE + 2, CELL_SIZE + 2, CELL_RADIUS + 1);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Hover glow
            ctx.shadowColor = 'rgba(99,102,241,0.3)';
            ctx.shadowBlur = 8;
            roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
            ctx.strokeStyle = 'rgba(99,102,241,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Fog of War Overlay
      if (fogEnabled && fogVisible) {
        for (let x = visMinX; x < visMaxX; x++) {
          for (let y = visMinY; y < visMaxY; y++) {
            const key = `${x},${y}`;
            if (!fogVisible.has(key)) {
              const px = x * step;
              const py = y * step;

              // Check distance to nearest visible cell for gradient edge
              let minDist = 999;
              for (const dir of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nk = `${x+dir[0]},${y+dir[1]}`;
                if (fogVisible.has(nk)) { minDist = 1; break; }
              }

              const alpha = minDist <= 1 ? 0.5 : 0.85; // Gradient edge
              roundRect(ctx, px, py, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
              ctx.fillStyle = `rgba(10, 14, 26, ${alpha})`;
              ctx.fill();

              // Question mark for hidden cells that have owners
              const cell = cellMap.get(key);
              if (cell && s > 1.2) {
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.font = `600 ${CELL_SIZE * 0.5}px Inter`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', px + CELL_SIZE/2, py + CELL_SIZE/2);
              }
            }
          }
        }
      }

      // Powerup Effects (Explosions, Freeze Rings)
      if (powerupEffects && powerupEffects.length > 0) {
        powerupEffects.forEach(effect => {
          const px = effect.x * step + CELL_SIZE/2;
          const py = effect.y * step + CELL_SIZE/2;
          const progress = 1 - Math.max(0, (effect.expiresAt - Date.now()) / 2000);
          
          ctx.beginPath();
          if (effect.type === 'bomb') {
            ctx.arc(px, py, (CELL_SIZE * 2) * progress, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(239, 68, 68, ${0.6 * (1 - progress)})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(239, 68, 68, ${1 - progress})`;
            ctx.lineWidth = 4;
            ctx.stroke();
          } else if (effect.type === 'freeze') {
            ctx.arc(px, py, CELL_SIZE * progress, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(147, 197, 253, ${0.8 * (1 - progress)})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(59, 130, 246, ${1 - progress})`;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        });
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [cells, cellsVersion, activeHolds, hoveredCell, heatMapMode, fogEnabled, fogVisible, goldenCells, surgeCells, powerupEffects]);

  // Grid position from mouse — memoized
  const getGridPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return canvasToGrid(
      e.clientX - rect.left,
      e.clientY - rect.top,
      scaleRef.current,
      offsetRef.current.x,
      offsetRef.current.y
    );
  }, []);

  // Throttled mouse move for tooltips (16ms = ~60fps)
  const throttledMouseMove = useMemo(() => throttle((e) => {
    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / scaleRef.current;
      const dy = (e.clientY - panStartRef.current.y) / scaleRef.current;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      offsetRef.current = {
        x: offsetRef.current.x + dx,
        y: offsetRef.current.y + dy,
      };
      return;
    }

    const pos = getGridPos(e);
    setHoveredCell(pos);

    if (pos && canvasRef.current) {
      const cell = cells.current.get(`${pos.x},${pos.y}`);
      const rect = canvasRef.current.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left + 16,
        y: e.clientY - rect.top - 10,
        cell: cell || null,
        coords: pos,
      });
    } else {
      setTooltip(null);
    }
  }, 16), [getGridPos, cells]);

  // Mouse handlers
  const handleMouseDown = useCallback((e) => {
    if (e.button === 2 || e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    const pos = getGridPos(e);
    if (pos) {
      // Powerup Intercept
      if (activePowerup) {
        onUsePowerup(activePowerup, pos.x, pos.y);
        onPowerupUsed();
        return;
      }

      holdingRef.current = true;
      setIsHolding(true);
      setHoldCell(pos);
      onStartHold(pos.x, pos.y);
    }
  }, [getGridPos, onStartHold, activePowerup, onUsePowerup, onPowerupUsed]);

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (holdingRef.current) {
      holdingRef.current = false;
      setIsHolding(false);
      setHoldCell(null);
      onReleaseHold();
    }
  }, [onReleaseHold]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setTooltip(null);
    if (holdingRef.current) {
      holdingRef.current = false;
      setIsHolding(false);
      setHoldCell(null);
      onReleaseHold();
    }
  }, [onReleaseHold]);

  // Zoom with debounced state update
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(6, scaleRef.current * delta));

    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = mx / scaleRef.current - offsetRef.current.x;
    const wy = my / scaleRef.current - offsetRef.current.y;

    scaleRef.current = newScale;
    offsetRef.current = {
      x: mx / newScale - wx,
      y: my / newScale - wy,
    };
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.startDist = Math.sqrt(dx * dx + dy * dy);
      touchRef.current.startScale = scaleRef.current;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = canvasRef.current.getBoundingClientRect();
      const pos = canvasToGrid(
        touch.clientX - rect.left,
        touch.clientY - rect.top,
        scaleRef.current,
        offsetRef.current.x,
        offsetRef.current.y
      );
      if (pos) {
        holdingRef.current = true;
        setIsHolding(true);
        setHoldCell(pos);
        onStartHold(pos.x, pos.y);
      }
      panStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, [onStartHold]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      scaleRef.current = Math.max(0.3, Math.min(6,
        touchRef.current.startScale * (dist / touchRef.current.startDist)
      ));
    } else if (e.touches.length === 1 && !holdingRef.current) {
      const touch = e.touches[0];
      const dx = (touch.clientX - panStartRef.current.x) / scaleRef.current;
      const dy = (touch.clientY - panStartRef.current.y) / scaleRef.current;
      panStartRef.current = { x: touch.clientX, y: touch.clientY };
      offsetRef.current = {
        x: offsetRef.current.x + dx,
        y: offsetRef.current.y + dy,
      };
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (holdingRef.current) {
      holdingRef.current = false;
      setIsHolding(false);
      setHoldCell(null);
      onReleaseHold();
    }
  }, [onReleaseHold]);

  const handleContextMenu = useCallback((e) => e.preventDefault(), []);

  // Memoize hold overlay data
  const currentHold = useMemo(() => {
    if (!holdCell) return null;
    return activeHolds.get(`${holdCell.x},${holdCell.y}`) || null;
  }, [holdCell, activeHolds]);

  return (
    <div className="grid-area" ref={containerRef}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={throttledMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      />

      {/* Cell tooltip */}
      {tooltip && (
        <div className="cell-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.cell ? (
            <>
              <div className="cell-tooltip__owner" style={{ color: tooltip.cell.color }}>
                {tooltip.cell.ownerName}
              </div>
              <div className="cell-tooltip__state">
                {tooltip.cell.state === 'protected' && '🛡️ Protected'}
                {tooltip.cell.state === 'reclaimable' && '⏳ Reclaimable'}
                {tooltip.cell.state === 'owned' && '✅ Owned'}
              </div>
            </>
          ) : (
            <div className="cell-tooltip__state">Unclaimed</div>
          )}
          <div className="cell-tooltip__coords">({tooltip.coords.x}, {tooltip.coords.y})</div>
        </div>
      )}

      {/* Hold overlay */}
      {isHolding && currentHold && (
        <div className={`hold-overlay ${currentHold.state === 'contested' ? 'contested' : ''}`}>
          <svg className="hold-progress-ring" viewBox="0 0 48 48">
            <circle className="bg" cx="24" cy="24" r="20" />
            {currentHold.contestants?.map((c, i) => {
              if (!c.isHolding) return null;
              const circ = 2 * Math.PI * 20;
              const progress = currentHold.timeRemaining != null
                ? 1 - (currentHold.timeRemaining / currentHold.duration) : 0;
              return (
                <circle
                  key={c.userId}
                  className="progress"
                  cx="24" cy="24"
                  r={20 - i * 4}
                  stroke={c.color}
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - progress)}
                  transform="rotate(-90 24 24)"
                />
              );
            })}
          </svg>
          <div className="hold-overlay__info">
            <div className="hold-overlay__title">
              {currentHold.state === 'contested' ? '⚔️ Contest!' : '🖐️ Holding...'}
            </div>
            <div className="hold-overlay__time">
              {currentHold.timeRemaining != null ? `${Math.ceil(currentHold.timeRemaining / 1000)}s` : '...'}
            </div>
            <div className="hold-overlay__subtitle">
              {currentHold.state === 'contested'
                ? `${currentHold.contestants?.filter(c => c.isHolding).length} contestants`
                : 'Keep holding to claim'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Grid);
