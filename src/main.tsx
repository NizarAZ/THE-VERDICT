import React, { useEffect, useMemo, useState, useCallback, useRef, Component } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';
import { CountdownTimer } from './components/CountdownTimer';
import { VerdictReveal } from './components/VerdictReveal';
import { NewDuelModal } from './components/NewDuelModal';
import { Leaderboard as LeaderboardComponent } from './components/Leaderboard';
import { PendingAcceptance as PendingAcceptanceComponent } from './components/PendingAcceptance';
import { CharacterCounter } from './components/CharacterCounter';
import { DuelsList } from './components/DuelsList';
import { CombatCard } from './components/CombatCard';
import { WalletConnect } from './components/WalletConnect';
import { WalletProvider, useWallet } from './contexts/WalletContext';
import { contract, contractIsConfigured, type ContractDuel, type ContractDebater, CONTRACT_CONSTANTS, type TransactionError } from './lib/contract';


type View = 'home' | 'trending' | 'my-combats' | 'start-combat' | 'leaderboard';

type Duel = ContractDuel & {
  playerSide: 'pro' | 'con';
  opponentName: string;
  timeRemaining: number;
};

type Debater = {
  address: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  bestVerdictQuote: string;
};

// Normalize all address fields from contract to lowercase for reliable comparison
// with MetaMask addresses (which may use different EIP-55 casing)
function normalizeDuel(d: ContractDuel): ContractDuel {
  return {
    ...d,
    creator: d.creator.toLowerCase(),
    pro_player: d.pro_player.toLowerCase(),
    con_player: d.con_player.toLowerCase(),
    winner: d.winner.toLowerCase(),
  };
}

// Transaction state machine — toast-driven progress feedback
type TxPhase = 'preparing' | 'wallet_prompt' | 'signing' | 'submitting' | 'pending_confirmation' | 'confirmed' | 'failed' | 'finalizing';

interface TxToastItem {
  id: number;
  phase: TxPhase;
  hash?: string;
  errorMsg?: string;
  error?: TransactionError;
  retry?: () => void;
  checkAgain?: () => void;
}

function App() {
  const { address: rawAddress } = useWallet();
  const walletAddress = rawAddress?.toLowerCase() ?? null;
  const [view, setView] = useState<View>('home');
  const [allDuels, setAllDuels] = useState<ContractDuel[]>([]);
  const [leaderboardData, setLeaderboardData] = useState<Debater[]>([]);
  const [duel, setDuel] = useState<Duel | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDuels, setIsLoadingDuels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast-based transaction feedback (replaces old transactionStatus/transactionError)
  const [txToasts, setTxToasts] = useState<TxToastItem[]>([]);
  const toastIdRef = useRef(0);

  const addToast = (item: Omit<TxToastItem, 'id'>): number => {
    const id = ++toastIdRef.current;
    setTxToasts(prev => [...prev, { ...item, id }]);
    return id;
  };

  const removeToast = (id: number): void => {
    setTxToasts(prev => prev.filter(t => t.id !== id));
  };

  // Auto-dismiss all confirmed toasts after 6s
  useEffect(() => {
    const confirmedIds = txToasts.filter(t => t.phase === 'confirmed').map(t => t.id);
    if (confirmedIds.length === 0) return;
    const timers = confirmedIds.map(id => setTimeout(() => removeToast(id), 6000));
    return () => timers.forEach(clearTimeout);
  }, [txToasts]);

  const [showCreate, setShowCreate] = useState(false);
  const [showForfeit, setShowForfeit] = useState(false);

  const loadGen = useRef(0);

  const loadContractData = useCallback(async () => {
    setIsLoadingDuels(true);
    setError(null);
    const gen = ++loadGen.current;
    try {
      const [leaderboard, duels] = await Promise.all([
        contract.getLeaderboard(50),
        contract.getAllDuels(),
      ]);
      // Discard stale responses if a newer load was started
      if (gen !== loadGen.current) return;
      setLeaderboardData(leaderboard.map(d => ({
        address: d.address.toLowerCase(),
        name: shortAddress(d.address),
        wins: d.wins,
        losses: d.losses,
        draws: d.draws,
        bestVerdictQuote: d.best_verdict_quote,
      })));
      setAllDuels(duels.map(normalizeDuel));
    } catch (err) {
      if (gen !== loadGen.current) return;
      console.error('Failed to load contract data:', err);
      setError('Unable to load combats. Check network connection and retry.');
    } finally {
      // Only clear loading if this is the latest load attempt
      if (gen === loadGen.current) {
        setIsLoadingDuels(false);
      }
    }
  }, []);

  // Refresh all duels from the contract, normalizing addresses
  const refreshDuelsData = useCallback(async () => {
    const duels = (await contract.getAllDuels()).map(normalizeDuel);
    setAllDuels(duels);
    return duels;
  }, []);

  // Live countdown tick for the current duel
  useEffect(() => {
    if (!duel) return;
    const remaining = duel.timeRemaining;
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setDuel(prev => {
        if (!prev || prev.timeRemaining <= 0) return prev;
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [duel?.id]);

  // Load data from contract on mount (only if configured)
  useEffect(() => {
    if (contractIsConfigured) {
      loadContractData();
    }
  }, [loadContractData]);

  const leaderboard = useMemo(() => {
    if (!walletAddress || !duel || duel.status !== 'judged') return leaderboardData;

    const isWinner = duel.playerSide === duel.winner;
    return [
      {
        address: walletAddress,
        name: 'You',
        wins: isWinner ? 1 : 0,
        losses: isWinner ? 0 : 1,
        draws: 0,
        bestVerdictQuote: duel.verdict_reasoning || 'No verdict quote yet.',
      },
      ...leaderboardData,
    ].sort((a, b) => winRate(b) - winRate(a));
  }, [duel, walletAddress, leaderboardData]);

  const { getAccount, provider: walletProvider } = useWallet();

  // Shared helper: run a write handler through the toast-based TxState machine
  const runTx = async (
    label: string,
    writeFn: () => Promise<string>,
    onConfirmed: () => Promise<void>,
    retryFn: () => void,
    // For GenLayer tx that changes state asynchronously (judge_duel runs LLM consensus),
    // poll the duel status until it changes from the current status
    waitForStatusChange?: { duelId: number; fromStatus: string; toStatus: string }
  ) => {
    const preparingId = addToast({ phase: 'preparing' });
    const walletId = addToast({ phase: 'wallet_prompt' });
    try {
      setIsLoading(true);
      setError(null);

      // Remove preparing toast now; wallet_prompt stays
      removeToast(preparingId);

      // This call opens MetaMask; genlayer-js waits for EVM receipt internally
      const txHash = await writeFn();

      // Once writeFn resolves, the EVM receipt is already mined.
      // For GenLayer (e.g. judge_duel), the contract state isn't updated until
      // validators run LLM consensus and finalize. We need to poll.
      removeToast(walletId);

      if (waitForStatusChange) {
        // Show pending toast during GenLayer consensus
        const pendingToastId = addToast({ phase: 'pending_confirmation', hash: txHash });
        let attempts = 0;
        const maxAttempts = 300; // ~15 minutes at 3s intervals — LLM consensus can take minutes
        const currentDuelId = waitForStatusChange.duelId;
        const fromStatus = waitForStatusChange.fromStatus;

        // Shared: resolve from polling to confirmed state
        const resolveConfirmed = async (freshDuel: ContractDuel, toastId: number) => {
          removeToast(toastId);
          addToast({ phase: 'confirmed', hash: txHash });
          if (duel && duel.id === freshDuel.id) {
            const now = Math.floor(Date.now() / 1000);
            setDuel({
              ...freshDuel,
              playerSide: duel.playerSide,
              opponentName: duel.opponentName,
              timeRemaining: Math.max(0, freshDuel.submit_deadline - now),
            });
          }
          await refreshDuelsData();
          loadContractData();
        };

        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          attempts++;
          try {
            const freshDuel = normalizeDuel(await contract.getDuel(currentDuelId));
            if (freshDuel.status !== fromStatus) {
              // Status changed! Transaction finalized.
              setIsLoading(false);
              await resolveConfirmed(freshDuel, pendingToastId);
              return; // Exit runTx successfully
            }
          } catch (e) {
            // RPC error during polling — retry
            console.warn('Polling error, retrying:', e);
          }
        }

        // Timeout reached — tx was submitted successfully but GenLayer consensus is still running
        setIsLoading(false);

        // Create the finalizing toast first so checkDuelStatus can reference its ID
        const finalizingToastId = addToast({ phase: 'finalizing', hash: txHash });
        let bgStopped = false;
        let bgTimer: ReturnType<typeof setTimeout> | null = null;

        const stopBgPoll = () => {
          bgStopped = true;
          if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
        };

        const checkDuelStatus = async () => {
          try {
            const freshDuel = normalizeDuel(await contract.getDuel(currentDuelId));
            if (freshDuel.status !== fromStatus) {
              stopBgPoll();
              removeToast(finalizingToastId);
              await resolveConfirmed(freshDuel, finalizingToastId);
            }
          } catch (e) {
            console.warn('Check again poll failed:', e);
          }
        };

        // Update the toast with the checkAgain callback now that it's defined
        setTxToasts(prev => prev.map(t =>
          t.id === finalizingToastId ? { ...t, checkAgain: checkDuelStatus } : t
        ));

        // Lightweight background re-check: poll slower every 30s and auto-resolve
        const scheduleBgPoll = () => {
          if (bgStopped) return;
          bgTimer = setTimeout(async () => {
            if (bgStopped) return;
            try {
              const freshDuel = normalizeDuel(await contract.getDuel(currentDuelId));
              if (freshDuel.status !== fromStatus) {
                stopBgPoll();
                removeToast(finalizingToastId);
                await resolveConfirmed(freshDuel, finalizingToastId);
              } else {
                scheduleBgPoll(); // Re-schedule next poll
              }
            } catch (e) {
              scheduleBgPoll(); // Re-schedule on error
            }
          }, 30000);
        };
        scheduleBgPoll();

        // When the user dismisses the toast, stop the background poll
        // We intercept by watching for the toast removal in the parent
        // removeToast function. Since we can't modify it externally, we
        // override the remove behavior for this specific ID by wrapping it.
        // This is set in the parent's scope via the setTxToasts map callback.
        // For now, the toast dismiss just hides it; the bg poll continues
        // but will only add a NEW confirmed toast if status changes, which
        // is harmless.
        return;
      }

      // Standard flow: EVM receipt means state is updated immediately
      addToast({ phase: 'confirmed', hash: txHash });
      await onConfirmed();
      loadContractData();
    } catch (err) {
      console.error(`Failed to ${label}:`, err);
      // Remove all toasts related to this transaction
      removeToast(preparingId);
      removeToast(walletId);
      if (err && typeof err === 'object' && 'name' in err) {
        const txError = err as TransactionError;
        addToast({ phase: 'failed', errorMsg: txError.message || `Failed to ${label}`, error: txError, retry: retryFn });
        setError(txError.message || `Failed to ${label}`);
      } else {
        addToast({ phase: 'failed', errorMsg: `Failed to ${label}`, retry: retryFn });
        setError(`Failed to ${label}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Wrap runTx for each write handler, binding the correct write and refresh
  const submitArgument = async () => {
    if (!duel || draft.trim().length < CONTRACT_CONSTANTS.MIN_ARGUMENT_LENGTH) return;
    const account = getAccount();
    if (!account) { setError('Please connect your wallet to submit an argument'); return; }
    await runTx('submit argument',
      () => contract.submitArgument(walletProvider!, account.address, duel.id, draft.trim()),
      async () => {
        const [rawUpdatedDuel] = await Promise.all([
          contract.getDuel(duel.id),
          refreshDuelsData(),
        ]);
        const updatedDuel = normalizeDuel(rawUpdatedDuel);
        const now = Math.floor(Date.now() / 1000);
        setDuel({
          ...updatedDuel,
          playerSide: duel.playerSide,
          opponentName: duel.opponentName,
          timeRemaining: Math.max(0, updatedDuel.submit_deadline - now),
        });
        setDraft('');
      },
      submitArgument
    );
  };

  const evaluateDuel = async () => {
    if (!duel) return;
    const account = getAccount();
    if (!account) { setError('Please connect your wallet to evaluate this duel'); return; }
    await runTx('evaluate duel',
      () => contract.judgeDuel(walletProvider!, account.address, duel.id),
      async () => {
        // After status change, refresh full data
        await refreshDuelsData();
      },
      evaluateDuel,
      { duelId: duel.id, fromStatus: 'submitted', toStatus: 'judged' } // <-- poll for status change
    );
  };

  const joinDuelFn = async (duelId: number, stake: number) => {
    const account = getAccount();
    if (!account) { setError('Please connect your wallet to join this duel'); return; }
    await runTx('join duel',
      () => contract.joinDuel(walletProvider!, account.address, duelId, stake),
      async () => {
        await refreshDuelsData();
        if (duel && duel.id === duelId) {
          const rawUpdatedDuel = await contract.getDuel(duelId);
          const updatedDuel = normalizeDuel(rawUpdatedDuel);
          const now = Math.floor(Date.now() / 1000);
          setDuel({
            ...updatedDuel,
            playerSide: duel.playerSide,
            opponentName: duel.opponentName,
            timeRemaining: Math.max(0, updatedDuel.submit_deadline - now),
          });
        }
      },
      () => joinDuelFn(duelId, stake)
    );
  };

  const expireDuelFn = async (duelId: number) => {
    const account = getAccount();
    if (!account) { setError('Please connect your wallet to expire this duel'); return; }
    await runTx('expire duel',
      () => contract.expireDuel(walletProvider!, account.address, duelId),
      async () => {
        const [rawUpdatedDuel] = await Promise.all([
          contract.getDuel(duelId),
          refreshDuelsData(),
        ]);
        const updatedDuel = normalizeDuel(rawUpdatedDuel);
        if (duel && duel.id === duelId) {
          const now = Math.floor(Date.now() / 1000);
          setDuel({
            ...updatedDuel,
            playerSide: duel.playerSide,
            opponentName: duel.opponentName,
            timeRemaining: Math.max(0, updatedDuel.submit_deadline - now),
          });
        }
      },
      () => expireDuelFn(duelId)
    );
  };

  const createNewDuel = async (topic: string, category: string, stake: number, joinDeadline: number, submitDuration: number) => {
    const account = getAccount();
    if (!account) { setError('Please connect your wallet to create a duel'); return; }
    await runTx('create duel',
      () => contract.createDuel(walletProvider!, account.address, topic, category, stake, joinDeadline, submitDuration),
      async () => {
        const duels = await refreshDuelsData();
        if (duels.length > 0) {
          const newestDuel = duels[duels.length - 1];
          const now = Math.floor(Date.now() / 1000);
          setDuel({
            ...newestDuel,
            playerSide: 'pro',
            opponentName: 'Opponent',
            timeRemaining: Math.max(0, newestDuel.submit_deadline - now),
          });
        }
        setShowCreate(false);
        setView('home');
      },
      () => createNewDuel(topic, category, stake, joinDeadline, submitDuration)
    );
  };

  
  const isTxInFlight = isLoading || txToasts.some(t => t.phase === 'wallet_prompt' || t.phase === 'preparing' || t.phase === 'pending_confirmation' || t.phase === 'finalizing');

  return (
    <main className="app">
      <AppNav
        view={view}
        walletAddress={walletAddress}
        onView={setView}
        onNewDuel={() => setShowCreate(true)}
      />

      {error && (
        <div className="page-container">
          <motion.div
            className="error-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="error-banner-text">{error}</span>
            <div className="error-banner-actions">
              <button className="error-retry-btn" onClick={() => { setError(null); loadContractData(); }}>
                Retry
              </button>
              <button className="error-dismiss-btn" onClick={() => setError(null)}>×</button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="page-container">
        <AnimatePresence mode="wait">
          {view === 'home' && duel && (
            <motion.div
              key="combat-detail"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <CombatDetail
                duel={duel}
                walletAddress={walletAddress}
                draft={draft}
                onDraft={setDraft}
                onSubmit={submitArgument}
                onJoin={() => joinDuelFn(duel.id, duel.stake)}
                onEvaluate={evaluateDuel}
                onForfeit={() => setShowForfeit(true)}
                isProcessing={isTxInFlight}
              />
            </motion.div>
          )}
          {view === 'home' && !duel && (
            <motion.div
              key="home-feed"
              className="home-feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <section className="home-section">
                <div className="section-header">
                  <h2>Trending Combats</h2>
                  <button className="link-btn" onClick={() => setView('trending')}>View All</button>
                </div>
                <div className="home-combats-grid">
                  {isLoadingDuels ? (
                    <div className="loading-spinner">Loading combats...</div>
                  ) : allDuels.filter(d => d.status === 'judged').length === 0 ? (
                    <div className="empty-state">No judged combats yet</div>
                  ) : (
                    allDuels.filter(d => d.status === 'judged').slice(0, 3).map((duel, index) => (
                      <CombatCard
                        key={duel.id}
                        duel={duel}
                        walletAddress={walletAddress}
                        onSelect={() => {
                          const now = Math.floor(Date.now() / 1000);
                          setDuel({
                            ...duel,
                            playerSide: duel.creator === walletAddress ? 'pro' : 'con',
                            opponentName: 'Opponent',
                            timeRemaining: Math.max(0, duel.join_deadline - now),
                          });
                        }}
                        index={index}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="home-section">
                <div className="section-header">
                  <h2>Live Combats</h2>
                  <button className="link-btn" onClick={() => setView('trending')}>View All</button>
                </div>
                <div className="home-combats-grid">
                  {isLoadingDuels ? (
                    <div className="loading-spinner">Loading combats...</div>
                  ) : allDuels.filter(d => d.status === 'open' || d.status === 'active' || d.status === 'submitted').length === 0 ? (
                    <div className="empty-state">No live combats</div>
                  ) : (
                    allDuels.filter(d => d.status === 'open' || d.status === 'active' || d.status === 'submitted').slice(0, 3).map((duel, index) => (
                      <CombatCard
                        key={duel.id}
                        duel={duel}
                        walletAddress={walletAddress}
                        onSelect={() => {
                          const now = Math.floor(Date.now() / 1000);
                          setDuel({
                            ...duel,
                            playerSide: duel.creator === walletAddress ? 'pro' : 'con',
                            opponentName: 'Opponent',
                            timeRemaining: Math.max(0, duel.join_deadline - now),
                          });
                        }}
                        index={index}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="home-section">
                <div className="section-header">
                  <h2>Leaderboard</h2>
                  <button className="link-btn" onClick={() => setView('leaderboard')}>View All</button>
                </div>
                <div className="leaderboard-teaser">
                  {isLoadingDuels ? (
                    <div className="loading-spinner">Loading leaderboard...</div>
                  ) : leaderboardData.length === 0 ? (
                    <div className="empty-state">No leaderboard data</div>
                  ) : (
                    leaderboardData.slice(0, 5).map((row, index) => (
                      <div key={row.address} className={`leader-row-teaser ${walletAddress && row.address === walletAddress ? 'current' : ''}`}>
                        <span className="rank">#{index + 1}</span>
                        <span className="name">{row.name}</span>
                        <span className="stats">{row.wins}W - {row.losses}L</span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {view === 'trending' && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <DuelsList
                duels={allDuels}
                walletAddress={walletAddress}
                isLoading={isLoadingDuels}
                filter="trending"
                onSelectDuel={(selectedDuel: ContractDuel) => {
                  const now = Math.floor(Date.now() / 1000);
                  setDuel({
                    ...selectedDuel,
                    playerSide: selectedDuel.creator === walletAddress ? 'pro' : 'con',
                    opponentName: 'Opponent',
                    timeRemaining: Math.max(0, selectedDuel.join_deadline - now),
                  });
                  setView('home');
                }}
                onJoinDuel={joinDuelFn}
              />
            </motion.div>
          )}
          {view === 'my-combats' && (
            <motion.div
              key="my-combats"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <DuelsList
                duels={allDuels}
                walletAddress={walletAddress}
                isLoading={isLoadingDuels}
                filter="my-combats"
                onSelectDuel={(selectedDuel: ContractDuel) => {
                  const now = Math.floor(Date.now() / 1000);
                  setDuel({
                    ...selectedDuel,
                    playerSide: selectedDuel.creator === walletAddress ? 'pro' : 'con',
                    opponentName: 'Opponent',
                    timeRemaining: Math.max(0, selectedDuel.join_deadline - now),
                  });
                  setView('home');
                }}
                onJoinDuel={joinDuelFn}
                onStartCombat={() => setView('start-combat')}
              />
            </motion.div>
          )}
          {view === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <LeaderboardComponent
                debaters={leaderboard.map(row => ({
                  address: row.address,
                  wins: row.wins,
                  losses: row.losses,
                  draws: row.draws,
                  total_score: row.wins * 100,
                  debates_played: row.wins + row.losses + row.draws,
                  best_verdict_quote: row.bestVerdictQuote,
                }))}
                currentAddress={walletAddress || undefined}
              />
            </motion.div>
          )}
          {view === 'start-combat' && (
            <motion.div
              key="start-combat"
              className="start-combat-container"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {!walletAddress ? (
                <div className="empty-state">
                  <h3>Connect Your Wallet</h3>
                  <p>Connect your wallet to start a new combat.</p>
                </div>
              ) : (
                <NewDuelModal
                  isOpen={true}
                  onClose={() => setView('home')}
                  onCreate={createNewDuel}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showCreate && <NewDuelModal isOpen={showCreate} onClose={() => setShowCreate(false)} onCreate={createNewDuel} />}
      {showForfeit && duel && <ForfeitModal onClose={() => setShowForfeit(false)} onConfirm={() => { setShowForfeit(false); expireDuelFn(duel.id); }} />}

      {/* Transaction toasts — compact, bottom-right, non-blocking */}
      <div className="tx-toast-container">
        <AnimatePresence>
          {txToasts.map(t => (
            <TxToast key={t.id} item={t} onDismiss={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </main>
  );
}

function AppNav({
  view,
  walletAddress,
  onView,
  onNewDuel,
}: {
  view: View;
  walletAddress: string | null;
  onView: (view: View) => void;
  onNewDuel: () => void;
}) {
  return (
    <header className="topbar">
      <div className="nav-inner">
        <button className="brand" onClick={() => onView('home')}>
          <LogoMark />
          <span>THE VERDICT</span>
        </button>
        <nav>
          <button className={view === 'home' ? 'active' : ''} onClick={() => onView('home')}>
            Home
          </button>
          <button className={view === 'trending' ? 'active' : ''} onClick={() => onView('trending')}>
            Trending
          </button>
          <button className={view === 'my-combats' ? 'active' : ''} onClick={() => onView('my-combats')}>
            My Combats
          </button>
          <button className={view === 'leaderboard' ? 'active' : ''} onClick={() => onView('leaderboard')}>
            Leaderboard
          </button>
        </nav>
        <div className="nav-actions">
          <button className="btn-primary" onClick={() => onView('start-combat')}>
            Start Combat
          </button>
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}

function CombatDetail({
  duel,
  walletAddress,
  draft,
  onDraft,
  onSubmit,
  onJoin,
  onEvaluate,
  onForfeit,
  isProcessing,
}: {
  duel: Duel;
  walletAddress: string | null;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onJoin: () => void;
  onEvaluate: () => void;
  onForfeit: () => void;
  isProcessing: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);

  // Action eligibility checks using only contract fields
  const canJoin = duel.status === 'open' && walletAddress && duel.creator !== walletAddress;
  const canSubmit = duel.status === 'active' && walletAddress &&
    ((duel.pro_player === walletAddress && !duel.pro_argument) ||
     (duel.con_player === walletAddress && !duel.con_argument));
  const canJudge = duel.status === 'submitted' && walletAddress &&
    duel.pro_argument && duel.con_argument;
  const canExpire = (duel.status === 'open' || duel.status === 'active' || duel.status === 'submitted') &&
    !duel.settled && (duel.join_deadline < now || duel.submit_deadline < now);

  return (
    <section className="combat-detail">
      <DuelMeta duel={duel} walletAddress={walletAddress} />

      {/* Open status - show join button if eligible, otherwise waiting */}
      {duel.status === 'open' && (
        <>
          {canJoin && (
            <section className="action-panel panel">
              <h3>Join This Combat</h3>
              <p>Stake: {(duel.stake / 1000000).toFixed(1)}M GEN</p>
              <button className="btn-primary" onClick={onJoin} disabled={isProcessing}>
                {isProcessing ? 'Processing...' : 'Join as CON'}
              </button>
            </section>
          )}
          {!canJoin && (
            <PendingAcceptance duel={duel} onForfeit={onForfeit} />
          )}
        </>
      )}

      {/* Active status - show submit if eligible, otherwise waiting */}
      {duel.status === 'active' && walletAddress && canSubmit && (
        <AssignedDuel duel={duel} draft={draft} onDraft={onDraft} onSubmit={onSubmit} onForfeit={onForfeit} isProcessing={isProcessing} />
      )}
      {duel.status === 'active' && walletAddress && !canSubmit && (
        <section className="action-panel panel">
          <h3>Waiting for Opponent</h3>
          <p>Your opponent is preparing their argument.</p>
        </section>
      )}
      {duel.status === 'active' && !walletAddress && (
        <section className="action-panel panel">
          <h3>Connect to View Details</h3>
          <p>Connect your wallet to see combat details.</p>
        </section>
      )}

      {/* Submitted status - show judge if eligible, otherwise waiting */}
      {duel.status === 'submitted' && canJudge && (
        <SubmittedDuel duel={duel} onEvaluate={onEvaluate} isProcessing={isProcessing} />
      )}
      {duel.status === 'submitted' && !canJudge && (
        <section className="action-panel panel">
          <h3>Waiting for AI Judgment</h3>
          <p>Both arguments submitted. AI is evaluating the combat.</p>
        </section>
      )}

      {/* Judged status - show results */}
      {duel.status === 'judged' && <CompletedDuel duel={duel} />}

      {/* Expired status - show expiry reason */}
      {duel.status === 'expired' && (
        <section className="action-panel panel">
          <h3>Combat Expired</h3>
          <p>This combat expired due to missed deadlines.</p>
          {duel.winner && <p className="winner-text">Winner: {duel.winner.toUpperCase()}</p>}
        </section>
      )}

      {/* Expire action when eligible */}
      {canExpire && (
        <section className="action-panel panel warning">
          <h3>Combat Can Be Expired</h3>
          <p>Deadlines have passed. You can expire this combat.</p>
          <button className="btn-primary" onClick={onForfeit} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Expire Combat'}
          </button>
        </section>
      )}
    </section>
  );
}

function DuelMeta({ duel, walletAddress }: { duel: Duel; walletAddress: string | null }) {
  const label =
    !walletAddress
      ? 'PENDING ACCEPTANCE'
      : duel.status === 'active'
      ? 'YOUR TURN'
      : duel.status === 'submitted'
        ? 'AWAITING JUDGMENT'
        : duel.status === 'judged'
          ? 'COMPLETED'
          : duel.status === 'open'
            ? 'OPEN FOR JOINING'
            : 'EXPIRED';

  return (
    <div className="combat-detail-header">
      <div className="combat-header-top">
        <div className="combat-status-row">
          <span className={`status-badge ${duel.status}`}>{label}</span>
          <span className="combat-id">Combat #{duel.id}</span>
        </div>
        <div className="combat-meta-row">
          <span className="category">{duel.category}</span>
          <span className="stake">{(duel.stake / 1000000).toFixed(1)}M GEN</span>
        </div>
      </div>
      <h1 className="combat-topic-large">{duel.topic}</h1>
      <div className="combat-participants">
        <div className="participant pro">
          <span className="participant-label">PRO</span>
          <span className="participant-address">{shortAddress(duel.pro_player)}</span>
          {duel.pro_argument && <span className="participant-status">Submitted</span>}
        </div>
        {duel.has_con_player && (
          <div className="participant con">
            <span className="participant-label">CON</span>
            <span className="participant-address">{shortAddress(duel.con_player)}</span>
            {duel.con_argument && <span className="participant-status">Submitted</span>}
          </div>
        )}
        {!duel.has_con_player && (
          <div className="participant waiting">
            <span className="participant-label">WAITING</span>
            <span className="participant-address">No opponent yet</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingAcceptance({ duel, onForfeit }: { duel: Duel; onForfeit: () => void }) {
  const totalTime = duel.submit_deadline - duel.join_deadline;
  return (
    <PendingAcceptanceComponent
      timeRemaining={duel.timeRemaining}
      totalTime={totalTime}
      opponentName={duel.opponentName}
      onCancel={onForfeit}
    />
  );
}

function AssignedDuel({
  duel,
  draft,
  onDraft,
  onSubmit,
  onForfeit,
  isProcessing,
}: {
  duel: Duel;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onForfeit: () => void;
  isProcessing: boolean;
}) {
  const canSubmit = draft.trim().length >= CONTRACT_CONSTANTS.MIN_ARGUMENT_LENGTH && draft.trim().length <= CONTRACT_CONSTANTS.MAX_ARGUMENT_LENGTH;

  return (
    <>
      <section className="assignment-banner">
        <span>You have been assigned</span>
        <strong>{duel.playerSide.toUpperCase()}</strong>
        <p>You must argue for the topic. Construct a compelling, evidence-based argument supporting this position.</p>
      </section>
      <div className="assignment-grid">
        <TopicBlock topic={duel.topic} />
        <section className="opponent-card panel">
          <PlayerOrb label="CK" tone="con" />
          <div>
            <span>Opponent</span>
            <strong>{duel.opponentName}</strong>
            <em>Assigned: CON</em>
            <div className="opponent-record">
              <span>8W–2L</span>
              <span>80% Win Rate</span>
            </div>
          </div>
        </section>
        <section className="timer-card panel">
          <CountdownTimer
            timeRemaining={duel.timeRemaining}
            totalTime={duel.submit_deadline - duel.join_deadline}
            isLow={duel.timeRemaining < 3600}
          />
          <span>Deadline</span>
          <p>{new Date(duel.submit_deadline * 1000).toLocaleString()}</p>
        </section>
        <section className="stats-card panel">
          <span>Duel Stake</span>
          <strong>{(duel.stake / 1000000).toFixed(1)}M GEN</strong>
          <span>Your Reputation</span>
          <strong>85% Win Rate</strong>
        </section>
        <section className="draft-card panel">
          <div className="draft-head">
            <span>Draft your argument</span>
            <CharacterCounter 
              current={draft.length}
              min={CONTRACT_CONSTANTS.MIN_ARGUMENT_LENGTH}
              max={CONTRACT_CONSTANTS.MAX_ARGUMENT_LENGTH}
            />
          </div>
          <textarea
            data-testid="argument-input"
            value={draft}
            maxLength={CONTRACT_CONSTANTS.MAX_ARGUMENT_LENGTH}
            placeholder="Build your case. Use evidence, logic, and rhetoric to argue your position..."
            onChange={(event) => onDraft(event.target.value)}
          />
          <div className="draft-actions">
            <button className="forfeit-link" onClick={onForfeit}>
              Forfeit Combat
            </button>
            <button className="save-draft">Save Draft</button>
            <button className="submit-argument" data-testid="submit-argument" disabled={!canSubmit || isProcessing} onClick={onSubmit}>
              {isProcessing ? 'Processing...' : 'Submit Argument'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function SubmittedDuel({ duel, onEvaluate, isProcessing }: { duel: Duel; onEvaluate: () => void; isProcessing: boolean }) {
  const remaining = Math.max(0, duel.timeRemaining);
  const hrs = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const timeStr = hrs > 0
    ? `${hrs}:${mins.toString().padStart(2, '0')}`
    : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const totalDuration = duel.submit_deadline - duel.join_deadline;
  const progress = totalDuration > 0
    ? Math.round((remaining / totalDuration) * 100)
    : 50;
  const timeLabel = hrs > 0 ? `${hrs}H ${mins}M` : `${mins}M ${secs}S`;
  const isLow = remaining < 3600;

  return (
    <>
      <section className="submitted-card panel">
        <div className="submitted-head">
          <span>Argument Submitted</span>
          <p>Your argument is locked and encrypted. It will be revealed once both sides have submitted.</p>
        </div>
        <div className="locked-submission">
          <span>Your submission - locked</span>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="submission-versus">
          <PlayerStatus name="You (PRO)" state="Submitted" tone="pro" />
          <strong>VS</strong>
          <PlayerStatus name={`${duel.opponentName} (CON)`} state="Drafting..." tone="con" />
        </div>
      </section>
      <section className="opponent-time panel">
        <span>Opponent's time remaining</span>
        <div className={`opponent-timer-ring ${isLow ? 'warning' : ''}`}>
          <strong>{timeStr}</strong>
          <span>Remaining</span>
        </div>
        <ProgressLine label="Time Remaining" value={timeLabel} percent={progress} warning={isLow} />
        <button className="submit-argument evaluate" data-testid="call-verdict" onClick={onEvaluate} disabled={isProcessing}>
          {isProcessing ? 'Processing...' : 'Evaluate Now'}
        </button>
      </section>
      <TopicBlock topic={duel.topic} />
    </>
  );
}

function CompletedDuel({ duel }: { duel: Duel }) {
  return (
    <VerdictReveal
      winner={duel.winner as 'pro' | 'con'}
      proScore={duel.pro_score}
      conScore={duel.con_score}
      verdictReasoning={duel.verdict_reasoning}
      winningQuote={duel.verdict_reasoning}
      factSnapshot={duel.facts_snapshot}
    />
  );
}

function ForfeitModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-layer">
      <section className="forfeit-modal">
        <div className="warning-mark">!</div>
        <h2>Forfeit Duel?</h2>
        <p>This action cannot be undone. You will lose this duel and it will be recorded as a forfeit on your record.</p>
        <div>
          <button className="save-draft" onClick={onClose}>
            Keep Fighting
          </button>
          <button className="danger" onClick={onConfirm}>
            Confirm Forfeit
          </button>
        </div>
      </section>
    </div>
  );
}

function TxToast({ item, onDismiss }: { item: TxToastItem; onDismiss: () => void }) {
  const phase = item.phase;

  const icon =
    phase === 'preparing' || phase === 'wallet_prompt' || phase === 'signing' || phase === 'submitting' || phase === 'pending_confirmation' || phase === 'finalizing'
      ? <span className="tx-toast-icon spinner" />
      : phase === 'confirmed'
        ? <span className="tx-toast-icon confirmed">✓</span>
        : <span className="tx-toast-icon failed">✗</span>;

  const title =
    phase === 'preparing' ? 'Preparing transaction...' :
    phase === 'wallet_prompt' ? 'Confirm in wallet...' :
    phase === 'signing' ? 'Signing...' :
    phase === 'submitting' ? 'Submitting...' :
    phase === 'pending_confirmation' ? 'Waiting for GenLayer consensus...' :
    phase === 'finalizing' ? 'AI judges are deliberating' :
    phase === 'confirmed' ? 'Transaction confirmed' :
    'Transaction failed';

  const desc =
    phase === 'failed' ? (item.errorMsg || 'Something went wrong') :
    phase === 'finalizing' ? 'The transaction was submitted successfully. The AI validators are evaluating arguments — this can take a few minutes. You can close this and check later.' :
    phase === 'confirmed' ? (item.hash ? `Hash: ${item.hash.slice(0, 10)}...${item.hash.slice(-6)}` : '') :
    '';

  return (
    <motion.div
      className={`tx-toast ${phase === 'finalizing' ? 'finalizing' : ''}`}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      layout
    >
      {icon}
      <div className="tx-toast-body">
        <div className="tx-toast-title">{title}</div>
        {desc && <div className="tx-toast-desc">{desc}</div>}
        {phase === 'finalizing' && (
          <div className="tx-toast-actions">
            {item.checkAgain && (
              <button className="tx-toast-check" onClick={item.checkAgain}>Check again</button>
            )}
            <button className="tx-toast-explorer" onClick={() => window.open(`https://explorer.bradbury.genlayer.com/tx/${item.hash}`, '_blank')}>
              View on Explorer
            </button>
          </div>
        )}
        {phase === 'failed' && item.retry && (
          <div className="tx-toast-actions">
            <button className="tx-toast-retry" onClick={item.retry}>Retry</button>
          </div>
        )}
        {phase === 'confirmed' && item.hash && (
          <div className="tx-toast-actions">
            <button className="tx-toast-explorer" onClick={() => window.open(`https://explorer.bradbury.genlayer.com/tx/${item.hash}`, '_blank')}>
              View on Explorer
            </button>
          </div>
        )}
        {phase === 'failed' && item.error && (
          <div className="tx-toast-actions">
            <button className="tx-toast-explorer" onClick={() => {
              console.log('Transaction error details:', JSON.stringify(item.error, null, 2));
            }}>
              Details (Console)
            </button>
          </div>
        )}
      </div>
      <button className="tx-toast-dismiss" onClick={onDismiss}>×</button>
    </motion.div>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 3 14 13M9 3l10 10M4 21l8-8m7 8-7-8" />
      <path d="M5 14h6v6" />
    </svg>
  );
}

function TopicBlock({ topic }: { topic: string }) {
  return (
    <section className="topic-block panel">
      <span>The Topic</span>
      <h2>"{topic}"</h2>
    </section>
  );
}

function ProgressLine({ label, value, percent, warning }: { label: string; value: string; percent: number; warning?: boolean }) {
  return (
    <div className="progress-line">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>
        <b className={warning ? 'warning' : ''} style={{ width: `${percent}%` }} />
      </i>
    </div>
  );
}

function PlayerOrb({ label, tone }: { label: string; tone: 'pro' | 'con' }) {
  return <span className={`player-orb ${tone}`}>{label}</span>;
}

function PlayerStatus({ name, state, tone }: { name: string; state: string; tone: 'pro' | 'con' }) {
  return (
    <div className="player-status">
      <PlayerOrb label={tone === 'pro' ? 'VX' : 'CK'} tone={tone} />
      <div>
        <strong>{name}</strong>
        <span>{state}</span>
      </div>
    </div>
  );
}

function winRate(row: Debater) {
  const total = row.wins + row.losses + row.draws;
  return total === 0 ? 0 : (row.wins / total) * 100;
}

function shortAddress(address: string) {
  if (!address.startsWith('0x') || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Error boundary to display runtime exceptions
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('[ErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#1a1a1a',
          color: '#fff',
          fontFamily: 'monospace',
          padding: '40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            maxWidth: '800px',
            width: '100%',
            backgroundColor: '#2d2d2d',
            padding: '30px',
            borderRadius: '12px',
            border: '2px solid #ff4444',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
          }}>
            <h1 style={{ color: '#ff4444', marginBottom: '20px' }}>⚠️ Runtime Error</h1>
            <pre style={{
              backgroundColor: '#1a1a1a',
              padding: '20px',
              border: '1px solid #444',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '14px',
              lineHeight: '1.5',
              marginBottom: '20px'
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ff4444',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Render the app with WalletProvider and Error Boundary
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <WalletProvider>
      <App />
    </WalletProvider>
  </ErrorBoundary>
);
