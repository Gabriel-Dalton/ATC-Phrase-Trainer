import { DIFFICULTIES } from "../engine/session";
import { rankInfo } from "../engine/data";
import type { SessionSettings } from "../engine/types";

interface Stats {
  xp: number;
  flights: number;
  bestStreak: number;
}

interface Props {
  score: number;
  streak: number;
  streakMultiplier: number;
  stats: Stats;
  settings: SessionSettings;
  onSettings: (next: Partial<SessionSettings>) => void;
}

export function TopBar({ score, streak, streakMultiplier, stats, settings, onSettings }: Props) {
  const rank = rankInfo(stats.xp);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge">
          <span className="glyph">◈</span> CYVR
        </span>
        <div>
          <h1>ATC Sim</h1>
          <p className="brand-sub">Vancouver Terminal · Radio Simulation</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{score}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value streak-value">
            {streak}
            {streakMultiplier > 1 && <span className="streak-mult">×{streakMultiplier}</span>}
          </span>
        </div>
        <div className="rank" title={`${stats.xp} XP total · ${stats.flights} flights`}>
          <div className="rank-head">
            <span className="rank-title">{rank.title}</span>
            <span className="rank-xp">
              {rank.next ? `${stats.xp} / ${rank.nextXp} XP` : `${stats.xp} XP · maxed`}
            </span>
          </div>
          <div className="rank-bar">
            <div className="rank-fill" style={{ width: `${Math.round(rank.pct * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="settings">
        <label>
          Difficulty
          <select
            value={settings.difficulty}
            onChange={(e) => onSettings({ difficulty: e.target.value as SessionSettings["difficulty"] })}
          >
            {Object.values(DIFFICULTIES).map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} — {d.description.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flight
          <select
            value={settings.scenario}
            onChange={(e) => onSettings({ scenario: e.target.value as SessionSettings["scenario"] })}
          >
            <option value="random">Random</option>
            <option value="departure">Departure</option>
            <option value="arrival">Arrival</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.chatter} onChange={(e) => onSettings({ chatter: e.target.checked })} />
          Chatter
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.radioFx} onChange={(e) => onSettings({ radioFx: e.target.checked })} />
          Radio FX
        </label>
      </div>
    </header>
  );
}
