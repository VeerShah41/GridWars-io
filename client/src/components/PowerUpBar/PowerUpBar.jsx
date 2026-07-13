import { Bomb, Snowflake, Shield } from 'lucide-react';
import './PowerUpBar.css';

export default function PowerUpBar({ inventory, activePowerup, onSelect }) {
  if (!inventory) return null;

  const handleSelect = (type) => {
    if (inventory[type] > 0) {
      onSelect(activePowerup === type ? null : type);
    }
  };

  return (
    <div className="powerup-bar">
      <button 
        className={`powerup-btn ${activePowerup === 'bomb' ? 'active' : ''} ${inventory.bomb === 0 ? 'empty' : ''}`}
        onClick={() => handleSelect('bomb')}
      >
        <Bomb size={20} />
        <span className="powerup-badge">{inventory.bomb}</span>
      </button>
      
      <button 
        className={`powerup-btn ${activePowerup === 'freeze' ? 'active' : ''} ${inventory.freeze === 0 ? 'empty' : ''}`}
        onClick={() => handleSelect('freeze')}
      >
        <Snowflake size={20} />
        <span className="powerup-badge">{inventory.freeze}</span>
      </button>

      <button 
        className={`powerup-btn ${activePowerup === 'shield' ? 'active' : ''} ${inventory.shield === 0 ? 'empty' : ''}`}
        onClick={() => handleSelect('shield')}
      >
        <Shield size={20} />
        <span className="powerup-badge">{inventory.shield}</span>
      </button>
    </div>
  );
}
