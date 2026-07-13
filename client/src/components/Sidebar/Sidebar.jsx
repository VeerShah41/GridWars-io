// GridWars — Sidebar (Optimized)
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Shield, Trophy, Activity, MessageCircle, Send, X, Zap, Clock,
  Pencil, Check, Crown, RotateCw,
} from 'lucide-react';
import { PERSONAL_COOLDOWN } from '../../utils/constants';

function Sidebar({
  user, leaderboard, activities, chatHistory, cooldownUntil,
  effectiveAvatar, pokemonMode, pokemon, pokemonLoading,
  onTogglePokemon, onRerollPokemon,
  onSendChat, onUpdateUsername, onClose,
}) {
  const [chatInput, setChatInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const chatScrollRef = useRef(null);
  const activityScrollRef = useRef(null);
  const nameInputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    chatScrollRef.current?.scrollTo(0, chatScrollRef.current.scrollHeight);
  }, [chatHistory]);
  useEffect(() => {
    activityScrollRef.current?.scrollTo(0, activityScrollRef.current.scrollHeight);
  }, [activities]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const handleSendChat = useCallback((e) => {
    e.preventDefault();
    const t = chatInput.trim();
    if (t) { onSendChat(t); setChatInput(''); }
  }, [chatInput, onSendChat]);

  const handleSaveName = useCallback(() => {
    const t = nameInput.trim();
    if (t.length >= 2 && t !== user.name) onUpdateUsername(t);
    setEditingName(false);
  }, [nameInput, user.name, onUpdateUsername]);

  const handleNameKey = useCallback((e) => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') setEditingName(false);
  }, [handleSaveName]);

  // Memoize user stats from leaderboard
  const { userCells, userTerritories, userRank } = useMemo(() => {
    const idx = leaderboard.findIndex(e => e.userId === user.id);
    const entry = idx >= 0 ? leaderboard[idx] : null;
    return {
      userCells: entry?.count || 0,
      userTerritories: entry?.territories || 0,
      userRank: idx >= 0 ? idx + 1 : 0,
    };
  }, [leaderboard, user.id]);

  // Memoize leaderboard rows
  const lbRows = useMemo(() => leaderboard.slice(0, 15), [leaderboard]);
  const recentActivities = useMemo(() => activities.slice(-20), [activities]);
  const recentChat = useMemo(() => chatHistory.slice(-50), [chatHistory]);

  return (
    <>
      {/* User Card */}
      <div className="sidebar__section user-section">
        <div className="user-card-v2">
          <div className="user-card-v2__avatar-ring" style={{ borderColor: user.color }}>
            <img src={effectiveAvatar} alt={user.name} loading="lazy" />
          </div>

          <div className="user-card-v2__body">
            {editingName ? (
              <div className="user-card-v2__name-edit">
                <input
                  ref={nameInputRef}
                  className="name-edit-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKey}
                  onBlur={handleSaveName}
                  maxLength={20}
                  placeholder="Username..."
                />
                <button className="name-edit-btn" onClick={handleSaveName}>
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div className="user-card-v2__name-row">
                <span className="user-card-v2__name" style={{ color: user.color }}>
                  {user.name}
                </span>
                <button
                  className="name-edit-trigger"
                  onClick={() => { setNameInput(user.name); setEditingName(true); }}
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}

            <div className="user-card-v2__stats">
              <div className="stat-chip">
                <div className="stat-chip__dot" style={{ backgroundColor: user.color }} />
                <span>{userCells}</span>
              </div>
              <div className="stat-chip">
                <Shield size={10} />
                <span>{userTerritories}</span>
              </div>
              {userRank > 0 && (
                <div className="stat-chip stat-chip--rank">
                  <Trophy size={10} />
                  <span>#{userRank}</span>
                </div>
              )}
            </div>
          </div>

          <button className="sidebar-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Pokémon Avatar Toggle */}
        <div className="pokemon-toggle">
          <label className="toggle-switch">
            <input type="checkbox" checked={pokemonMode} onChange={onTogglePokemon} />
            <span className="toggle-switch__slider" />
          </label>
          <span className="pokemon-toggle__label">Pokémon Avatar</span>
          {pokemonMode && pokemon && (
            <div className="pokemon-toggle__info">
              <span className="pokemon-toggle__name">{pokemon.name}</span>
              <button
                className="pokemon-toggle__reroll"
                onClick={onRerollPokemon}
                disabled={pokemonLoading}
                title="Get new Pokémon"
              >
                <RotateCw size={12} className={pokemonLoading ? 'spin' : ''} />
              </button>
            </div>
          )}
        </div>

        {/* Cooldown */}
        {cooldownUntil > Date.now() ? (
          <CooldownDisplay cooldownUntil={cooldownUntil} />
        ) : (
          <div className="cooldown-bar ready">
            <Zap size={13} />
            <span className="cooldown-bar__label">Ready to claim!</span>
            <span className="cooldown-bar__hint">Hold 4s</span>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="sidebar__section leaderboard-section">
        <div className="sidebar__section-title">
          <Trophy size={12} /> Leaderboard
        </div>
        <div className="leaderboard-list">
          {lbRows.length === 0 ? (
            <div className="empty-state">No claims yet — be the first! 🏴</div>
          ) : lbRows.map((entry, i) => (
            <div key={entry.userId} className={`lb-row ${entry.userId === user.id ? 'lb-row--me' : ''}`}>
              <span className={`lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                {i === 0 ? <Crown size={13} /> : `#${i + 1}`}
              </span>
              <div className="lb-avatar-tiny">
                <img
                  src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(entry.userName)}&backgroundColor=transparent`}
                  alt="" loading="lazy"
                />
              </div>
              <div className="lb-color" style={{ backgroundColor: entry.color }} />
              <span className="lb-name">{entry.userName}</span>
              <span className="lb-territories">{entry.territories > 0 && `🏰${entry.territories}`}</span>
              <span className="lb-count">{entry.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">
          <Activity size={12} /> Live Activity
        </div>
        <div className="activity-feed" ref={activityScrollRef}>
          {recentActivities.length === 0 ? (
            <div className="empty-state">Waiting for action...</div>
          ) : recentActivities.map((a, i) => (
            <div key={i} className="activity-item">{a.message}</div>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">
          <MessageCircle size={12} /> Chat
        </div>
        <div className="chat">
          <div className="chat__messages" ref={chatScrollRef}>
            {recentChat.length === 0 ? (
              <div className="empty-state">Say something... 💬</div>
            ) : recentChat.map((msg, i) => (
              <div key={msg.id || i} className="chat__msg">
                <span className="chat__msg-author" style={{ color: msg.color }}>{msg.userName}</span>
                <span className="chat__msg-text">{msg.text}</span>
              </div>
            ))}
          </div>
          <form className="chat__form" onSubmit={handleSendChat}>
            <input
              className="chat__input"
              type="text"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={200}
            />
            <button className="chat__send" type="submit"><Send size={13} /></button>
          </form>
        </div>
      </div>
    </>
  );
}

export default memo(Sidebar);

// Cooldown sub-component
const CooldownDisplay = memo(function CooldownDisplay({ cooldownUntil }) {
  const [remaining, setRemaining] = useState(Math.max(0, cooldownUntil - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, cooldownUntil - Date.now());
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const secs = Math.ceil(remaining / 1000);
  const progress = 1 - remaining / PERSONAL_COOLDOWN;

  return (
    <div className="cooldown-bar waiting">
      <Clock size={13} />
      <div className="cooldown-bar__track">
        <div className="cooldown-bar__info">
          <span>Cooldown</span>
          <span className="cooldown-bar__time">{secs}s</span>
        </div>
        <div className="cooldown-bar__bg">
          <div
            className="cooldown-bar__fill"
            style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, var(--warning), var(--success))' }}
          />
        </div>
      </div>
    </div>
  );
});
