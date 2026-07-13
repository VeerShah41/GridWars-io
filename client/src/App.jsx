// GridWars — Main App (Optimized)
import { useState, useCallback, useEffect, useMemo, memo } from 'react';
import {
  Swords, Flame, Users, Volume2, VolumeX, PanelRightOpen,
  Timer, X, Shield, Clock, Unlock, Square, Zap, RotateCw, Eye,
} from 'lucide-react';
import { useSocket } from './hooks/useSocket';
import { usePokemonAvatar } from './hooks/usePokemonAvatar';
import Grid from './components/Grid/Grid';
import Sidebar from './components/Sidebar/Sidebar';
import Joystick from './components/Joystick/Joystick';
import PowerUpBar from './components/PowerUpBar/PowerUpBar';

// Detect mobile
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

export default function App() {
  const socket = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [heatMapMode, setHeatMapMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pokemonMode, setPokemonMode] = useState(() => {
    try { return localStorage.getItem('gridwars_pokemon') === 'true'; } catch { return false; }
  });
  const [joystickDelta, setJoystickDelta] = useState(null);
  const [fogEnabled, setFogEnabled] = useState(false);
  const [activePowerup, setActivePowerup] = useState(null);

  const { pokemon, loading: pokemonLoading, reroll: rerollPokemon } = usePokemonAvatar(pokemonMode);

  const {
    connected, user, gridData, cells, cellsVersion, activeHolds,
    onlineCount, leaderboard, chatHistory, activities, achievements,
    notifications, cooldownUntil, startHold, releaseHold, sendChat,
    updateUsername, mapEvents, goldenCells, surgeCells, screenShake,
    inventory, usePowerup, powerupEffects,
  } = socket;

  // Toggle pokemon mode
  const togglePokemon = useCallback(() => {
    const next = !pokemonMode;
    setPokemonMode(next);
    try { localStorage.setItem('gridwars_pokemon', String(next)); } catch {}
  }, [pokemonMode]);

  // Effective avatar — pokemon or default
  const effectiveAvatar = useMemo(() => {
    if (pokemonMode && pokemon) return pokemon.sprite;
    return user?.avatar || '';
  }, [pokemonMode, pokemon, user?.avatar]);

  // Reset timer — memoized interval
  const [resetTimer, setResetTimer] = useState({ text: '', isUrgent: false });
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now + istOffset);
      const resetToday = new Date(istNow);
      resetToday.setHours(5, 30, 0, 0);
      let resetTime = new Date(resetToday.getTime() - istOffset);
      if (now >= resetTime.getTime()) {
        resetTime = new Date(resetTime.getTime() + 86400000);
      }
      const diff = resetTime.getTime() - now;
      setResetTimer({
        text: `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`,
        isUrgent: diff < 3600000,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Joystick handlers
  const handleJoystickMove = useCallback((x, y) => {
    setJoystickDelta({ x, y });
  }, []);

  const handleJoystickEnd = useCallback(() => {
    setJoystickDelta(null);
  }, []);

  // Toggle sidebar
  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (!user || !gridData) {
    return (
      <div className="app loading-screen">
        <div className="loading-content">
          <div className="loading-icon">
            <Swords size={48} />
            <div className="loading-pulse" />
          </div>
          <h2>Connecting to GridWars...</h2>
          <p>Establishing real-time connection</p>
          <div className="loading-bar"><div className="loading-bar__fill" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${screenShake ? 'shake' : ''}`}>
      {!connected && <div className="connection-status">⚠️ Disconnected — reconnecting...</div>}

      {/* Event Banner */}
      {mapEvents && mapEvents.map(evt => (
        <div key={evt.id} className="event-banner" data-type={evt.type}>
          {evt.message}
        </div>
      ))}

      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar__brand">
          <Swords size={20} />
          <span>GridWars</span>
        </div>

        <div className="top-bar__controls">
          <button
            className={`top-bar__btn ${heatMapMode ? 'active' : ''}`}
            onClick={() => setHeatMapMode(v => !v)}
          >
            <Flame size={15} />
            <span>Heat</span>
          </button>

          <button
            className={`top-bar__btn ${fogEnabled ? 'active' : ''}`}
            onClick={() => setFogEnabled(v => !v)}
          >
            <Eye size={15} />
            <span>Fog</span>
          </button>

          <button className="top-bar__btn" onClick={() => setSoundEnabled(v => !v)}>
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <div className="online-badge">
            <div className="online-dot" />
            <Users size={13} />
            <span>{onlineCount}</span>
          </div>
        </div>
      </header>

      {/* Permanent Legend Strip */}
      <div className="legend-strip">
        <div className="legend-strip__item">
          <div className="legend-dot" style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)' }} />
          <span>Unclaimed</span>
        </div>
        <div className="legend-strip__item">
          <div className="legend-dot" style={{ background: 'var(--accent)' }}>
            <Shield size={7} style={{ color: 'white' }} />
          </div>
          <span>Protected</span>
        </div>
        <div className="legend-strip__item">
          <div className="legend-dot legend-dot--pulse" style={{ background: 'var(--warning)' }} />
          <span>Reclaimable</span>
        </div>
        <div className="legend-strip__item">
          <div className="legend-dot" style={{ background: 'var(--success)' }} />
          <span>Owned</span>
        </div>
        <div className="legend-strip__item">
          <div className="legend-dot legend-dot--blink" style={{ background: 'var(--danger)' }} />
          <span>Contested</span>
        </div>
        <div className="legend-strip__item">
          <Zap size={12} style={{ color: 'var(--accent-light)' }} />
          <span>Surround = Capture</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <Grid
          cells={cells}
          cellsVersion={cellsVersion}
          activeHolds={activeHolds}
          user={user}
          onStartHold={startHold}
          onReleaseHold={releaseHold}
          heatMapMode={heatMapMode}
          joystickDelta={joystickDelta}
          goldenCells={goldenCells}
          surgeCells={surgeCells}
          fogEnabled={fogEnabled}
          activePowerup={activePowerup}
          onUsePowerup={usePowerup}
          onPowerupUsed={() => setActivePowerup(null)}
          powerupEffects={powerupEffects}
        />

        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <Sidebar
            user={user}
            leaderboard={leaderboard}
            activities={activities}
            chatHistory={chatHistory}
            cooldownUntil={cooldownUntil}
            effectiveAvatar={effectiveAvatar}
            pokemonMode={pokemonMode}
            pokemon={pokemon}
            pokemonLoading={pokemonLoading}
            onTogglePokemon={togglePokemon}
            onRerollPokemon={rerollPokemon}
            onSendChat={sendChat}
            onUpdateUsername={updateUsername}
            onClose={closeSidebar}
          />
        </aside>

        <div
          className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
          onClick={closeSidebar}
        />
      </div>

      {/* Bottom Bar */}
      <footer className="bottom-bar">
        <Timer size={13} />
        <span className={`reset-timer ${resetTimer.isUrgent ? 'urgent' : ''}`}>
          Reset in {resetTimer.text}
        </span>
        <span className="bottom-bar__sep">•</span>
        <span className="bottom-bar__hint">Right-click pan · Scroll zoom</span>
      </footer>

      <PowerUpBar 
        inventory={inventory} 
        activePowerup={activePowerup} 
        onSelect={setActivePowerup} 
      />

      {/* Mobile: Joystick + Sidebar toggle */}
      {isMobile && (
        <Joystick onMove={handleJoystickMove} onEnd={handleJoystickEnd} />
      )}

      <button className="sidebar-toggle" onClick={toggleSidebar}>
        {sidebarOpen ? <X size={20} /> : <PanelRightOpen size={20} />}
      </button>

      {/* Notifications */}
      <div className="notifications">
        {notifications.map(n => (
          <div key={n.id} className={`notification ${n.type}`}>{n.message}</div>
        ))}
      </div>

      {/* Achievements */}
      <div className="achievements">
        {achievements.map(a => (
          <div key={a.id} className="achievement-toast">
            <span className="achievement-toast__icon">{a.title.split(' ')[0]}</span>
            <div className="achievement-toast__text">
              <h4>{a.title}</h4>
              <p>{a.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
