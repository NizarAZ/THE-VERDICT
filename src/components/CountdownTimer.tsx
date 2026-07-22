import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface CountdownTimerProps {
  timeRemaining: number; // in seconds
  totalTime: number; // in seconds
  isLow?: boolean;
}

export function CountdownTimer({ timeRemaining, totalTime, isLow = false }: CountdownTimerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number>(timeRemaining / totalTime);

  useEffect(() => {
    if (!circleRef.current || !textRef.current) return;

    const circumference = 2 * Math.PI * 45; // radius = 45
    const progress = timeRemaining / totalTime;
    const offset = circumference * (1 - progress);

    // Animate the stroke
    gsap.to(circleRef.current, {
      strokeDashoffset: offset,
      duration: 0.5,
      ease: 'power2.out',
    });

    // Animate the text
    gsap.to(textRef.current, {
      scale: progress < 0.2 ? 1.1 : 1,
      duration: 0.3,
      ease: 'power2.inOut',
      yoyo: true,
      repeat: progress < 0.2 ? 1 : 0,
    });

    // Pulse effect when time is low
    if (isLow) {
      gsap.to(svgRef.current, {
        opacity: 0.7,
        duration: 0.5,
        yoyo: true,
        repeat: -1,
        ease: 'power1.inOut',
      });
    } else {
      gsap.killTweensOf(svgRef.current);
      gsap.set(svgRef.current, { opacity: 1 });
    }

    progressRef.current = progress;
  }, [timeRemaining, totalTime, isLow]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const circumference = 2 * Math.PI * 45;
  const progress = timeRemaining / totalTime;
  const offset = circumference * (1 - progress);

  return (
    <div className={`countdown-timer ${isLow ? 'critical' : ''}`}>
      <svg
        ref={svgRef}
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="timer-ring"
      >
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="6"
        />
        {/* Progress circle */}
        <circle
          ref={circleRef}
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={isLow ? '#ef4444' : '#6366f1'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{
            transition: 'stroke 0.3s ease',
            filter: isLow ? 'drop-shadow(0 0 15px rgba(239, 68, 68, 0.4))' : 'drop-shadow(0 0 15px rgba(99, 102, 241, 0.3))',
          }}
        />
      </svg>
      <div ref={textRef} className="timer-display">
        <strong>{formatTime(timeRemaining)}</strong>
        <span>Remaining</span>
      </div>
    </div>
  );
}
