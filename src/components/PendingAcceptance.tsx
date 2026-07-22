import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';

interface PendingAcceptanceProps {
  timeRemaining: number;
  totalTime: number;
  opponentName: string;
  onCancel: () => void;
}

export function PendingAcceptance({ 
  timeRemaining, 
  totalTime, 
  opponentName, 
  onCancel 
}: PendingAcceptanceProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const pulseTextRef = useRef<HTMLDivElement>(null);
  const progress = timeRemaining / totalTime;

  useEffect(() => {
    if (!progressBarRef.current) return;

    // Animate progress bar with easing
    gsap.to(progressBarRef.current, {
      width: `${progress * 100}%`,
      duration: 0.5,
      ease: 'power2.out',
    });

    // Pulse effect when time is low
    if (progress < 0.3 && pulseTextRef.current) {
      gsap.to(pulseTextRef.current, {
        opacity: 0.5,
        duration: 0.5,
        yoyo: true,
        repeat: -1,
        ease: 'power1.inOut',
      });
    } else if (pulseTextRef.current) {
      gsap.killTweensOf(pulseTextRef.current);
      gsap.set(pulseTextRef.current, { opacity: 1 });
    }
  }, [progress, timeRemaining, totalTime]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const isLow = progress < 0.3;

  return (
    <motion.div
      className="pending-acceptance"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="pending-card panel">
        <div className="panel-status">Waiting for response</div>
        
        <div className="versus-line">
          <div className="player-orb pro">PRO</div>
          <div className="vs-divider">
            <strong>VS</strong>
            <span>Pending</span>
          </div>
          <div className="player-orb con">CON</div>
        </div>

        <p className="challenge-copy">
          <strong>You</strong> challenged <strong>{opponentName}</strong>
        </p>

        <div className="time-info">
          <div className="info-grid">
            <div className="info-box">
              <span>Time Remaining</span>
              <strong 
                ref={pulseTextRef}
                className={isLow ? 'warning' : ''}
              >
                {formatTime(timeRemaining)}
              </strong>
            </div>
          </div>

          <div className="progress-line">
            <div className="progress-track">
              <div
                ref={progressBarRef}
                className="progress-fill"
                style={{
                  width: `${progress * 100}%`,
                  backgroundColor: isLow ? '#ef4444' : '#6366f1',
                }}
              />
            </div>
            <span className="progress-percent">{Math.round(progress * 100)}%</span>
          </div>
        </div>

        <motion.button
          className="cancel-btn"
          onClick={onCancel}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Cancel Challenge
        </motion.button>
      </div>
    </motion.div>
  );
}
