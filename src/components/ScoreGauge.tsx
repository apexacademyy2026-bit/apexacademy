export function ScoreGauge({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, score / max));
  const r = 70;
  const C = 2 * Math.PI * r;
  const dash = C * pct;
  const color = pct >= 0.8 ? "hsl(var(--primary))" : pct >= 0.5 ? "#f59e0b" : "hsl(var(--destructive))";
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={r} stroke="hsl(var(--muted))" strokeWidth="14" fill="none" />
        <circle
          cx="90" cy="90" r={r}
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${C - dash}`}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold">{score.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">/ {max}</div>
      </div>
    </div>
  );
}