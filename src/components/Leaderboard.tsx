import { motion, AnimatePresence } from 'framer-motion';
import { ContractDebater } from '../lib/contract';

interface LeaderboardProps {
  debaters: ContractDebater[];
  currentAddress?: string;
}

export function Leaderboard({ debaters, currentAddress }: LeaderboardProps) {
  const winRate = (debater: ContractDebater) => {
    const total = debater.wins + debater.losses + debater.draws;
    return total === 0 ? 0 : (debater.wins / total) * 100;
  };

  const sortedDebaters = [...debaters].sort((a, b) => {
    const aRate = winRate(a);
    const bRate = winRate(b);
    if (bRate !== aRate) return bRate - aRate;
    return b.wins - a.wins;
  });

  if (debaters.length === 0) {
    return (
      <div className="leaderboard">
        <h2>Leaderboard</h2>
        <div className="empty-state">No leaderboard data yet. Start combats to appear here!</div>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <div className="leaderboard-list">
        <AnimatePresence mode="popLayout">
          {sortedDebaters.map((debater, index) => (
            <motion.div
              key={debater.address}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                layout: { type: 'spring', damping: 25, stiffness: 300 },
                opacity: { duration: 0.2 },
              }}
              className={`leader-row ${currentAddress === debater.address ? 'current' : ''}`}
              style={{
                originY: 0,
              }}
            >
              <div className="rank">
                <span className="rank-number">{index + 1}</span>
              </div>

              <div className="debater-info">
                <div className="debater-header">
                  <strong className="debater-name">
                    {currentAddress === debater.address ? 'You' : `Player ${index + 1}`}
                  </strong>
                  <code className="debater-address">
                    {debater.address.slice(0, 6)}...{debater.address.slice(-4)}
                  </code>
                </div>
                <p className="best-quote">"{debater.best_verdict_quote}"</p>
              </div>

              <div className="debater-stats">
                <div className="stat-group">
                  <span className="stat-label">W</span>
                  <span className="stat-value wins">{debater.wins}</span>
                </div>
                <div className="stat-group">
                  <span className="stat-label">L</span>
                  <span className="stat-value losses">{debater.losses}</span>
                </div>
                <div className="stat-group">
                  <span className="stat-label">D</span>
                  <span className="stat-value draws">{debater.draws}</span>
                </div>
              </div>

              <div className="win-rate">
                <strong>{Math.round(winRate(debater))}%</strong>
                <span>Win Rate</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
