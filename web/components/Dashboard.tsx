"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface DashboardData {
  overall: { total: number; byBox: Record<number, number>; masteredPct: number };
  dueToday: number;
  topicMastery: { topic: string; total: number; mastered: number; pct: number }[];
  recentMistakes: {
    cardPrompt: string;
    topic: string;
    userAnswer: string;
    aiFeedback: string | null;
    errorTags: string[];
    createdAt: string;
  }[];
  accuracyPct: number;
  totalAttempts: number;
}

const BOX_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#84cc16",
  5: "#22c55e",
};

export default function Dashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard?userId=${userId}`)
      .then((r) => r.json())
      .then(setData);
  }, [userId]);

  if (!data) return <p className="text-neutral-400">Loading…</p>;

  const boxData = Object.entries(data.overall.byBox).map(([box, count]) => ({
    name: `Box ${box}`,
    value: count,
    color: BOX_COLORS[Number(box)],
  }));

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Due today" value={data.dueToday} />
        <StatCard label="Mastered" value={`${data.overall.masteredPct}%`} />
        <StatCard label="Accuracy" value={`${data.accuracyPct}%`} sub={`${data.totalAttempts} attempts`} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Leitner box distribution</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={boxData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {boxData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Mastery by grammar topic</h2>
        <div className="space-y-2">
          {data.topicMastery.map((t) => (
            <div key={t.topic}>
              <div className="flex justify-between text-sm mb-1">
                <span>{t.topic}</span>
                <span className="text-neutral-400">
                  {t.mastered}/{t.total} ({t.pct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${t.pct}%` }} />
              </div>
            </div>
          ))}
          {data.topicMastery.length === 0 && (
            <p className="text-sm text-neutral-500">No reviews yet — start a review session.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent mistakes</h2>
        <div className="space-y-3">
          {data.recentMistakes.map((m, i) => (
            <div key={i} className="border border-neutral-800 rounded-md p-3 text-sm">
              <p className="text-neutral-400 text-xs mb-1">{m.topic}</p>
              <p className="mb-1">{m.cardPrompt}</p>
              <p className="text-red-400">Your answer: {m.userAnswer}</p>
              {m.aiFeedback && <p className="text-neutral-400 mt-1">{m.aiFeedback}</p>}
            </div>
          ))}
          {data.recentMistakes.length === 0 && (
            <p className="text-sm text-neutral-500">No mistakes logged yet. Nice.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
