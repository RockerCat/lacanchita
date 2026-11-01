// Purely presentational — no hooks needed, works inside any client component.

type Particle = {
  id: number;
  x: number;
  size: number;
  color: string;
  round: boolean;
  delay: number;
  duration: number;
};

// Static particles — deterministic positions to avoid SSR/hydration issues.
// Colors: brand green, gold, red, light green, gold-yellow.
const CONFETTI_PARTICLES: Particle[] = [
  { id: 0,  x: 5,  size: 6, color: "#00c85a", round: false, delay: 0,   duration: 1400 },
  { id: 1,  x: 15, size: 5, color: "#f59e0b", round: true,  delay: 100, duration: 1600 },
  { id: 2,  x: 25, size: 7, color: "#ef4444", round: false, delay: 50,  duration: 1500 },
  { id: 3,  x: 35, size: 5, color: "#00c85a", round: true,  delay: 200, duration: 1300 },
  { id: 4,  x: 45, size: 6, color: "#f59e0b", round: false, delay: 80,  duration: 1700 },
  { id: 5,  x: 55, size: 5, color: "#00e87a", round: true,  delay: 160, duration: 1450 },
  { id: 6,  x: 65, size: 7, color: "#ef4444", round: false, delay: 30,  duration: 1550 },
  { id: 7,  x: 75, size: 5, color: "#f59e0b", round: true,  delay: 250, duration: 1350 },
  { id: 8,  x: 85, size: 6, color: "#00c85a", round: false, delay: 120, duration: 1650 },
  { id: 9,  x: 92, size: 5, color: "#fcd34d", round: true,  delay: 70,  duration: 1500 },
  { id: 10, x: 10, size: 4, color: "#f59e0b", round: false, delay: 300, duration: 1400 },
  { id: 11, x: 40, size: 5, color: "#00c85a", round: true,  delay: 180, duration: 1600 },
  { id: 12, x: 60, size: 4, color: "#ef4444", round: false, delay: 230, duration: 1350 },
  { id: 13, x: 80, size: 6, color: "#fcd34d", round: true,  delay: 140, duration: 1500 },
];

interface GoalCelebrationOverlayProps {
  active: boolean;
}

export default function GoalCelebrationOverlay({ active }: GoalCelebrationOverlayProps) {
  if (!active) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* ⚽ Badge */}
      <span className="animate-goal-badge bg-[#00c85a] text-[#0a0a12] text-sm font-black px-5 py-2.5 rounded-full shadow-[0_0_32px_rgba(0,200,90,0.60)] select-none relative z-20">
        ⚽ ¡Gol!
      </span>

      {/* Confetti — clipped to parent's overflow-hidden boundary */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {CONFETTI_PARTICLES.map((p) => (
          <span
            key={p.id}
            className="absolute animate-confetti-particle"
            style={{
              left:            `${p.x}%`,
              top:             "-6px",
              width:           `${p.size}px`,
              height:          `${p.size}px`,
              backgroundColor: p.color,
              borderRadius:    p.round ? "50%" : "2px",
              animationDelay:    `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
