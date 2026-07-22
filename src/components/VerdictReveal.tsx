import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';

interface VerdictRevealProps {
  winner: 'pro' | 'con';
  proScore: number;
  conScore: number;
  verdictReasoning: string;
  winningQuote: string;
  factSnapshot: string;
  onComplete?: () => void;
}

export function VerdictReveal({
  winner,
  proScore,
  conScore,
  verdictReasoning,
  winningQuote,
  factSnapshot,
  onComplete,
}: VerdictRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const proScoreRef = useRef<HTMLDivElement>(null);
  const conScoreRef = useRef<HTMLDivElement>(null);
  const winnerRef = useRef<HTMLDivElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const factRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline({
      onComplete,
    });

    // Step 1: Fade in container
    tl.fromTo(containerRef.current, 
      { opacity: 0 },
      { opacity: 1, duration: 0.5 }
    );

    // Step 2: Animate scores counting up
    tl.to({}, { duration: 0.3 }); // small delay

    if (proScoreRef.current) {
      tl.fromTo(proScoreRef.current,
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
      );
      
      // Count up animation
      gsap.to(proScoreRef.current, {
        innerHTML: proScore,
        duration: 1.5,
        snap: { innerHTML: 1 },
        ease: 'power2.out',
      });
    }

    if (conScoreRef.current) {
      tl.fromTo(conScoreRef.current,
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' },
        '-=0.3'
      );
      
      // Count up animation
      gsap.to(conScoreRef.current, {
        innerHTML: conScore,
        duration: 1.5,
        snap: { innerHTML: 1 },
        ease: 'power2.out',
      });
    }

    // Step 3: Winner reveal with glow effect
    tl.to({}, { duration: 0.5 });
    
    if (winnerRef.current) {
      tl.fromTo(winnerRef.current,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }
      );
      
      // Glow pulse
      gsap.to(winnerRef.current, {
        boxShadow: '0 0 30px rgba(99, 102, 241, 0.8)',
        duration: 0.5,
        yoyo: true,
        repeat: 3,
        ease: 'power1.inOut',
      });
    }

    // Step 4: Type out reasoning
    tl.to({}, { duration: 0.3 });
    
    if (reasoningRef.current) {
      tl.fromTo(reasoningRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    }

    // Step 5: Show fact snapshot
    tl.to({}, { duration: 0.3 });
    
    if (factRef.current) {
      tl.fromTo(factRef.current,
        { opacity: 0, height: 0 },
        { opacity: 1, height: 'auto', duration: 0.4, ease: 'power2.out' }
      );
    }

    return () => {
      gsap.killTweensOf([
        containerRef.current,
        proScoreRef.current,
        conScoreRef.current,
        winnerRef.current,
        reasoningRef.current,
        factRef.current,
      ]);
    };
  }, [proScore, conScore, winner, onComplete]);

  const winnerText = winner === 'pro' ? 'PRO WINS' : 'CON WINS';
  const winnerColor = winner === 'pro' ? '#6366f1' : '#f97316';

  return (
    <div ref={containerRef} className="verdict-reveal">
      {/* Score comparison */}
      <div className="score-comparison">
        <div className="score-side pro">
          <span className="score-label">PRO</span>
          <div ref={proScoreRef} className="score-value">0</div>
        </div>
        <div className="score-divider">VS</div>
        <div className="score-side con">
          <span className="score-label">CON</span>
          <div ref={conScoreRef} className="score-value">0</div>
        </div>
      </div>

      {/* Winner announcement */}
      <motion.div
        ref={winnerRef}
        className="winner-banner"
        style={{
          borderColor: winnerColor,
          backgroundColor: `${winnerColor}20`,
        }}
      >
        <h2 style={{ color: winnerColor }}>{winnerText}</h2>
        <p className="winning-quote">"{winningQuote}"</p>
      </motion.div>

      {/* Verdict reasoning */}
      <div ref={reasoningRef} className="verdict-reasoning">
        <h3>Verdict</h3>
        <p>{verdictReasoning}</p>
      </div>

      {/* Fact snapshot */}
      <div ref={factRef} className="fact-snapshot">
        <h4>Market Context Used</h4>
        <pre>{JSON.stringify(JSON.parse(factSnapshot), null, 2)}</pre>
      </div>
    </div>
  );
}
