import { motion } from 'framer-motion';

interface CharacterCounterProps {
  current: number;
  min: number;
  max: number;
}

export function CharacterCounter({ current, min, max }: CharacterCounterProps) {
  const progress = current / max;
  const isValid = current >= min && current <= max;
  const isNearLimit = current > max * 0.9;
  const isOverLimit = current > max;

  return (
    <div className="character-counter">
      <div className="counter-labels">
        <span className={current < min ? 'warning' : ''}>
          {current}/{max}
        </span>
        {!isValid && current > 0 && (
          <motion.span
            className="error-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {current < min ? `Min ${min} chars` : 'Too long'}
          </motion.span>
        )}
      </div>
      <div className="counter-track">
        <motion.div
          className="counter-fill"
          initial={{ width: 0 }}
          animate={{ 
            width: `${Math.min(progress, 1) * 100}%`,
            backgroundColor: isOverLimit ? '#ef4444' : isNearLimit ? '#f97316' : '#6366f1',
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        />
      </div>
    </div>
  );
}
