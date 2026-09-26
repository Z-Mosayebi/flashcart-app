/** A ring that fills with today's answers toward the daily goal. */
export default function GoalRing({ done, goal, size = 40 }: { done: number; goal: number; size?: number }) {
  const stroke = size >= 60 ? 7 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(done / Math.max(goal, 1), 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} / ${goal}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgb(var(--gold))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size >= 60 ? 15 : 10}
        fontWeight={800}
        fill="rgb(var(--ink))"
      >
        {Math.min(done, goal)}/{goal}
      </text>
    </svg>
  );
}
