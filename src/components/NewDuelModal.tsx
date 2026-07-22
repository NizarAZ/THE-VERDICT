import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACT_CONSTANTS } from '../lib/contract';

interface NewDuelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (topic: string, category: string, stake: number, joinDeadline: number, submitDeadline: number) => void;
}

export function NewDuelModal({ isOpen, onClose, onCreate }: NewDuelModalProps) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('');
  const [stake, setStake] = useState<number>(1000000);
  const [joinDeadline, setJoinDeadline] = useState<number>(CONTRACT_CONSTANTS.JOIN_DEADLINE_SECONDS);
  const [submitDeadline, setSubmitDeadline] = useState<number>(CONTRACT_CONSTANTS.SUBMIT_DURATION_SECONDS);

  const topicLength = topic.length;
  const isTopicValid = topicLength >= CONTRACT_CONSTANTS.MIN_TOPIC_LENGTH &&
                      topicLength <= CONTRACT_CONSTANTS.MAX_TOPIC_LENGTH;
  const isCategoryValid = category.length > 0 &&
                          category.length <= CONTRACT_CONSTANTS.MAX_CATEGORY_LENGTH;
  const isStakeValid = stake > 0;
  const canSubmit = isTopicValid && isCategoryValid && isStakeValid && joinDeadline > 0 && submitDeadline > joinDeadline;

  const handleSubmit = () => {
    if (canSubmit) {
      const now = Math.floor(Date.now() / 1000);
      onCreate(topic, category, stake, now + joinDeadline, now + submitDeadline);
      onClose();
      setTopic('');
      setCategory('');
      setStake(1000000);
      setJoinDeadline(CONTRACT_CONSTANTS.JOIN_DEADLINE_SECONDS);
      setSubmitDeadline(CONTRACT_CONSTANTS.SUBMIT_DURATION_SECONDS);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-card new-duel-modal"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Start New Combat</h2>
            
            <div className="form-group">
              <label htmlFor="topic">Topic</label>
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter debate topic..."
                maxLength={CONTRACT_CONSTANTS.MAX_TOPIC_LENGTH}
                className={topicLength > 0 && !isTopicValid ? 'invalid' : ''}
              />
              <div className="character-count">
                <span className={topicLength < CONTRACT_CONSTANTS.MIN_TOPIC_LENGTH ? 'warning' : ''}>
                  {topicLength}/{CONTRACT_CONSTANTS.MAX_TOPIC_LENGTH}
                </span>
                {!isTopicValid && topicLength > 0 && (
                  <span className="error">
                    {topicLength < CONTRACT_CONSTANTS.MIN_TOPIC_LENGTH 
                      ? `Too short (min ${CONTRACT_CONSTANTS.MIN_TOPIC_LENGTH})`
                      : `Too long (max ${CONTRACT_CONSTANTS.MAX_TOPIC_LENGTH})`
                    }
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <input
                id="category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Market predictions, Technology, Politics..."
                maxLength={CONTRACT_CONSTANTS.MAX_CATEGORY_LENGTH}
                className={category.length > 0 && !isCategoryValid ? 'invalid' : ''}
              />
              <div className="character-count">
                <span>{category.length}/{CONTRACT_CONSTANTS.MAX_CATEGORY_LENGTH}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="stake">Stake (tokens)</label>
              <input
                id="stake"
                type="number"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                min={1}
                step={100000}
              />
            </div>

            <div className="form-group">
              <label htmlFor="joinDeadline">Join Deadline (seconds from now)</label>
              <input
                id="joinDeadline"
                type="number"
                value={joinDeadline}
                onChange={(e) => setJoinDeadline(Number(e.target.value))}
                min={3600}
                max={604800}
                step={3600}
              />
              <div className="duration-hint">
                {Math.floor(joinDeadline / 86400)} days, {Math.floor((joinDeadline % 86400) / 3600)} hours
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="submitDeadline">Submit Deadline (seconds from now)</label>
              <input
                id="submitDeadline"
                type="number"
                value={submitDeadline}
                onChange={(e) => setSubmitDeadline(Number(e.target.value))}
                min={3600}
                max={604800}
                step={3600}
              />
              <div className="duration-hint">
                {Math.floor(submitDeadline / 86400)} days, {Math.floor((submitDeadline % 86400) / 3600)} hours
              </div>
            </div>

            <div className="modal-actions">
              <motion.button
                className="btn-secondary"
                onClick={onClose}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Cancel
              </motion.button>
              <motion.button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                whileHover={{ scale: canSubmit ? 1.05 : 1 }}
                whileTap={{ scale: canSubmit ? 0.95 : 1 }}
                style={{
                  opacity: canSubmit ? 1 : 0.5,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                Start Combat
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
