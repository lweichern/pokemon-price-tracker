"use client";

type Release = {
  name: string;
  date: string;
  pokemon: string;
  status: string;
  score: number;
};

const RELEASES: Release[] = [
  {
    name: "Prismatic Evolutions (Wave 2 Restock)",
    date: "2025-02-28",
    pokemon: "Eeveelutions",
    status: "Restocking",
    score: 92,
  },
  {
    name: "Journey Together",
    date: "2025-03-28",
    pokemon: "Pikachu & Friends",
    status: "Preorders open",
    score: 78,
  },
  {
    name: "Mythical Island",
    date: "2025-06-13",
    pokemon: "Mew",
    status: "JP release announced",
    score: 75,
  },
  {
    name: "SV09: Space-Time Smackdown",
    date: "2025-09-05",
    pokemon: "Dialga & Palkia",
    status: "Rumored",
    score: 70,
  },
];

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownColor(days: number): string {
  if (days <= 0) return "#16a34a";
  if (days < 30) return "#f59e0b";
  if (days < 90) return "#2A75BB";
  return "#9ca3af";
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "#f59e0b";
  if (score >= 60) return "#7c3aed";
  return "#2A75BB";
}

export default function Calendar() {
  const sorted = [...RELEASES].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {sorted.map((release) => {
          const days = daysUntil(release.date);
          const isReleased = days <= 0;
          const cdColor = countdownColor(days);
          const barColor = scoreBarColor(release.score);

          return (
            <div
              key={release.name}
              className="flex items-center gap-4 rounded-lg px-4 py-3 shadow-sm"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                className="shrink-0 w-20 text-center"
                style={{ color: cdColor }}
              >
                {isReleased ? (
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Released
                  </span>
                ) : (
                  <>
                    <span className="text-2xl font-mono font-bold block leading-none">
                      {days}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider">
                      days
                    </span>
                  </>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "#1a1a2e" }}
                >
                  {release.name}
                </p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs" style={{ color: "#6b7280" }}>
                    {new Date(release.date + "T00:00:00").toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </span>
                  <span className="text-xs" style={{ color: "#7c3aed" }}>
                    {release.pokemon}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
                    style={{
                      color: "#1a1a2e",
                      backgroundColor: "#f3f4f6",
                    }}
                  >
                    {release.status}
                  </span>
                </div>
              </div>

              <div className="shrink-0 w-28 flex flex-col items-end gap-1">
                <span
                  className="text-xs font-mono font-bold"
                  style={{ color: barColor }}
                >
                  {release.score}/100
                </span>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "#f3f4f6" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${release.score}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center py-2" style={{ color: "#9ca3af" }}>
        Release dates are manually maintained. Data sourced from PokeBeach and
        official Pok&eacute;mon announcements.
      </p>
    </div>
  );
}
