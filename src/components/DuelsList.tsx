import { motion } from 'framer-motion';
import { ContractDuel } from '../lib/contract';

interface DuelsListProps {
  duels: ContractDuel[];
  walletAddress: string | null;
  isLoading: boolean;
  filter?: 'trending' | 'my-combats' | 'all';
  onSelectDuel: (duel: ContractDuel) => void;
  onJoinDuel: (duelId: number, stake: number) => void;
  onStartCombat?: () => void;
}

export function DuelsList({ duels, walletAddress, isLoading, filter = 'all', onSelectDuel, onJoinDuel, onStartCombat }: DuelsListProps) {
  const now = Math.floor(Date.now() / 1000);

  // Filter duels based on the view
  let filteredDuels = duels;
  if (filter === 'my-combats' && walletAddress) {
    filteredDuels = duels.filter(d =>
      d.creator === walletAddress ||
      d.pro_player === walletAddress ||
      d.con_player === walletAddress
    );
  } else if (filter === 'trending') {
    // Trending: prioritize judged combats, then active/submitted
    filteredDuels = [...duels].sort((a, b) => {
      if (a.status === 'judged' && b.status !== 'judged') return -1;
      if (b.status === 'judged' && a.status !== 'judged') return 1;
      if ((a.status === 'active' || a.status === 'submitted') &&
          (b.status !== 'active' && b.status !== 'submitted')) return -1;
      if ((b.status === 'active' || b.status === 'submitted') &&
          (a.status !== 'active' && a.status !== 'submitted')) return 1;
      return b.id - a.id; // Newest first
    });
  }

  // Group combats for My Combats view
  const needsAction = filteredDuels.filter(d =>
    walletAddress &&
    (d.creator === walletAddress || d.pro_player === walletAddress || d.con_player === walletAddress) &&
    ((d.status === 'open' && d.creator === walletAddress) ||
     (d.status === 'active' && (d.pro_player === walletAddress || d.con_player === walletAddress) &&
      ((d.pro_player === walletAddress && !d.pro_argument) ||
       (d.con_player === walletAddress && !d.con_argument))))
  );

  const waitingOnOpponent = filteredDuels.filter(d =>
    walletAddress &&
    (d.creator === walletAddress || d.pro_player === walletAddress || d.con_player === walletAddress) &&
    ((d.status === 'open' && d.creator !== walletAddress) ||
     (d.status === 'active' &&
      ((d.pro_player === walletAddress && d.con_argument) ||
       (d.con_player === walletAddress && d.pro_argument))))
  );

  const waitingForJudgment = filteredDuels.filter(d =>
    walletAddress &&
    (d.creator === walletAddress || d.pro_player === walletAddress || d.con_player === walletAddress) &&
    d.status === 'submitted'
  );

  const resolved = filteredDuels.filter(d =>
    walletAddress &&
    (d.creator === walletAddress || d.pro_player === walletAddress || d.con_player === walletAddress) &&
    (d.status === 'judged' || d.status === 'expired')
  );

  // For trending/all views, use status-based grouping
  const openDuels = filter === 'my-combats' ? [] : filteredDuels.filter(d => d.status === 'open');
  const activeDuels = filter === 'my-combats' ? [] : filteredDuels.filter(d => d.status === 'active');
  const submittedDuels = filter === 'my-combats' ? [] : filteredDuels.filter(d => d.status === 'submitted');
  const judgedDuels = filter === 'my-combats' ? [] : filteredDuels.filter(d => d.status === 'judged');
  const expiredDuels = filter === 'my-combats' ? [] : filteredDuels.filter(d => d.status === 'expired');

  const DuelCard = ({ duel, index }: { duel: ContractDuel; index: number }) => {
    const canJoin = duel.status === 'open' && walletAddress && duel.creator !== walletAddress;
    const isCreator = walletAddress === duel.creator;
    const isParticipant = walletAddress === duel.pro_player || walletAddress === duel.con_player;

    const handleJoin = () => {
      if (canJoin) {
        onJoinDuel(duel.id, duel.stake);
      }
    };

    const handleSelect = () => {
      onSelectDuel(duel);
    };

    return (
      <motion.div
        className="duel-card panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        whileHover={{ scale: 1.02 }}
        onClick={handleSelect}
        style={{ cursor: 'pointer' }}
      >
        <div className="duel-card-header">
          <span className={`status-badge ${duel.status}`}>{duel.status.toUpperCase()}</span>
          <span className="duel-id">#{duel.id}</span>
        </div>
        <h3 className="duel-topic">{duel.topic}</h3>
        <div className="duel-meta">
          <span className="category">{duel.category}</span>
          <span className="stake">{(duel.stake / 1000000).toFixed(1)}M GEN</span>
        </div>
        <div className="duel-players">
          <div className="player-info">
            <span className="player-label">PRO</span>
            <span className="player-address">{shortAddress(duel.pro_player)}</span>
          </div>
          {duel.has_con_player && (
            <div className="player-info">
              <span className="player-label">CON</span>
              <span className="player-address">{shortAddress(duel.con_player)}</span>
            </div>
          )}
        </div>
        {canJoin && (
          <motion.button
            className="btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              handleJoin();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Join Duel
          </motion.button>
        )}
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="duels-list-container">
        <div className="loading-state">Loading combats...</div>
      </div>
    );
  }

  // My Combats view with action-based grouping
  if (filter === 'my-combats') {
    return (
      <motion.div
        className="duels-list-container my-combats-view"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {!walletAddress && (
          <motion.div
            className="empty-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <h3>Connect Your Wallet</h3>
            <p>Connect your wallet to view your personal combats and take action on them.</p>
          </motion.div>
        )}

        {walletAddress && (
          <>
            {needsAction.length > 0 && (
              <>
                <motion.h2
                  className="priority-section"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  ⚡ Needs Your Action
                </motion.h2>
                <div className="duels-grid priority-grid">
                  {needsAction.map((duel, index) => (
                    <DuelCard key={duel.id} duel={duel} index={index} />
                  ))}
                </div>
              </>
            )}

            {waitingOnOpponent.length > 0 && (
              <>
                <motion.h2
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  Waiting on Opponent
                </motion.h2>
                <div className="duels-grid">
                  {waitingOnOpponent.map((duel, index) => (
                    <DuelCard key={duel.id} duel={duel} index={index} />
                  ))}
                </div>
              </>
            )}

            {waitingForJudgment.length > 0 && (
              <>
                <motion.h2
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  Waiting for Judgment
                </motion.h2>
                <div className="duels-grid">
                  {waitingForJudgment.map((duel, index) => (
                    <DuelCard key={duel.id} duel={duel} index={index} />
                  ))}
                </div>
              </>
            )}

            {resolved.length > 0 && (
              <>
                <motion.h2
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  Resolved
                </motion.h2>
                <div className="duels-grid">
                  {resolved.map((duel, index) => (
                    <DuelCard key={duel.id} duel={duel} index={index} />
                  ))}
                </div>
              </>
            )}

            {needsAction.length === 0 && waitingOnOpponent.length === 0 &&
             waitingForJudgment.length === 0 && resolved.length === 0 && (
              <motion.div
                className="empty-state personal-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <h3>You haven't joined any combats yet</h3>
                <p>Start your first debate or browse trending combats to join an existing one.</p>
                {onStartCombat && (
                  <button className="btn-primary" onClick={onStartCombat}>
                    Start a Combat
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    );
  }

  // Trending/All views with status-based grouping
  return (
    <motion.div
      className="duels-list-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {filter === 'trending' ? 'Trending Combats' : 'Open Combats'}
      </motion.h2>
      {openDuels.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          No open combats available
        </motion.div>
      ) : (
        <div className="duels-grid">
          {openDuels.map((duel, index) => (
            <DuelCard key={duel.id} duel={duel} index={index} />
          ))}
        </div>
      )}

      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        Active Combats
      </motion.h2>
      {activeDuels.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          No active combats
        </motion.div>
      ) : (
        <div className="duels-grid">
          {activeDuels.map((duel, index) => (
            <DuelCard key={duel.id} duel={duel} index={index} />
          ))}
        </div>
      )}

      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        Submitted Combats
      </motion.h2>
      {submittedDuels.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          No submitted combats
        </motion.div>
      ) : (
        <div className="duels-grid">
          {submittedDuels.map((duel, index) => (
            <DuelCard key={duel.id} duel={duel} index={index} />
          ))}
        </div>
      )}

      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      >
        Judged Combats
      </motion.h2>
      {judgedDuels.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
        >
          No judged combats
        </motion.div>
      ) : (
        <div className="duels-grid">
          {judgedDuels.map((duel, index) => (
            <DuelCard key={duel.id} duel={duel} index={index} />
          ))}
        </div>
      )}

      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.9 }}
      >
        Expired Combats
      </motion.h2>
      {expiredDuels.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 1.0 }}
        >
          No expired combats
        </motion.div>
      ) : (
        <div className="duels-grid">
          {expiredDuels.map((duel, index) => (
            <DuelCard key={duel.id} duel={duel} index={index} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
