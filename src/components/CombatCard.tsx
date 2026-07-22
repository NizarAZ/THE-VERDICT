import { motion } from 'framer-motion';
import { ContractDuel } from '../lib/contract';

interface CombatCardProps {
  duel: ContractDuel;
  walletAddress: string | null;
  onSelect: () => void;
  index: number;
}

export function CombatCard({ duel, walletAddress, onSelect, index }: CombatCardProps) {
  const now = Math.floor(Date.now() / 1000);

  const getTimeRemaining = () => {
    if (duel.status === 'open') {
      const remaining = duel.join_deadline - now;
      if (remaining <= 0) return 'Expired';
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      return `${hours}h ${minutes}m left`;
    }
    if (duel.status === 'active' || duel.status === 'submitted') {
      const remaining = duel.submit_deadline - now;
      if (remaining <= 0) return 'Expired';
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      return `${hours}h ${minutes}m left`;
    }
    return '';
  };

  const getVerdictSnippet = () => {
    if (duel.status === 'judged' && duel.verdict_reasoning) {
      return duel.verdict_reasoning.slice(0, 80) + (duel.verdict_reasoning.length > 80 ? '...' : '');
    }
    return '';
  };

  return (
    <motion.div
      className={`combat-card panel ${duel.status}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.02 }}
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <div className="combat-card-header">
        <span className={`status-badge ${duel.status}`}>
          {duel.status === 'judged' ? 'RESOLVED' : duel.status.toUpperCase()}
        </span>
        <span className="combat-id">#{duel.id}</span>
      </div>

      {duel.status === 'judged' && (
        <div className="combat-result-banner">
          <span className="winner-badge">{duel.winner.toUpperCase()} WINS</span>
        </div>
      )}

      <h3 className="combat-topic">{duel.topic}</h3>

      <div className="combat-meta">
        <span className="category">{duel.category}</span>
        <span className="stake">{(duel.stake / 1000000).toFixed(1)}M GEN</span>
      </div>

      {getTimeRemaining() && (
        <div className="combat-deadline">
          <span className="deadline-icon">⏱</span>
          <span>{getTimeRemaining()}</span>
        </div>
      )}

      <div className="combat-players">
        <div className="player-info pro">
          <span className="player-label">PRO</span>
          <span className="player-address">{shortAddress(duel.pro_player)}</span>
        </div>
        {duel.has_con_player && (
          <div className="player-info con">
            <span className="player-label">CON</span>
            <span className="player-address">{shortAddress(duel.con_player)}</span>
          </div>
        )}
        {!duel.has_con_player && (
          <div className="player-info waiting">
            <span className="player-label">WAITING</span>
            <span className="player-address">Join to debate</span>
          </div>
        )}
      </div>

      {getVerdictSnippet() && (
        <div className="combat-verdict">
          <span className="verdict-label">Verdict:</span>
          <span className="verdict-text">{getVerdictSnippet()}</span>
        </div>
      )}
    </motion.div>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
