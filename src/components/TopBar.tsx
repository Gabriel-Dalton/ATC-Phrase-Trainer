import { DIFFICULTIES } from "../engine/session";
import type { SessionSettings } from "../engine/types";

interface Stats {
  xp: number;
  flights: number;
  bestStreak: number;
}

interface Props {
  score: number;
  streak: number;
  stats: Stats;
  rank: string;
  settings: SessionSettings;
  onSettings: (next: Partial<SessionSettings>) => void;
}

export function TopBar({ score, streak, stats, rank, settings, onSettings }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-badge">CYVR</span>
        <div>
          <h1>ATC Sim</h1>
          <p className="brand-sub">Vancouver Terminal — Radio Simulation</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{score}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{streak}</span>
        </div>
        <div className="stat">
          <span className="stat-label">XP</span>
          <span className="stat-value">{stats.xp}</span>
        </div>
        <div className="stat stat-rank">
          <span className="stat-label">Rank</span>
          <span className="stat-value">{rank}</span>
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
          <input
            type="checkbox"
            checked={settings.chatter}
            onChange={(e) => onSettings({ chatter: e.target.checked })}
          />
          Chatter
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.radioFx}
            onChange={(e) => onSettings({ radioFx: e.target.checked })}
          />
          Radio FX
        </label>
      </div>
    </header>
  );
}
