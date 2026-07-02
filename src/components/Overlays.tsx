import { FlightSession } from "../engine/session";
import { rankInfo } from "../engine/data";
import type { SessionSnapshot } from "../engine/types";

interface DebriefProps {
  snapshot: SessionSnapshot;
  xp: number;
  bestStreak: number;
  onNewFlight: () => void;
}

function tone(score: number): string {
  return score >= 80 ? "good" : score >= 55 ? "partial" : "bad";
}

export function DebriefOverlay({ snapshot, xp, bestStreak, onNewFlight }: DebriefProps) {
  const total = snapshot.results.length;
  const avg = total ? Math.round(snapshot.results.reduce((s, r) => s + r.score, 0) / total) : 0;
  const letter = FlightSession.gradeLetter(avg);
  const flight = snapshot.flight!;
  const rank = rankInfo(xp);

  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>Flight debrief</h2>
        <div className="summary-grade">
          <div className={`grade-letter ${tone(avg)}`}>{letter}</div>
          <div className="grade-meta">
            <div>{flight.tag} · {flight.route}</div>
            <div>
              Average readback <strong>{avg}%</strong> · Flight score <strong>{snapshot.score}</strong> · Best streak <strong>{bestStreak}</strong>
            </div>
            <div className="grade-xp-note">
              +{snapshot.score} XP banked · {rank.title}
              {rank.next ? ` · ${rank.nextXp! - xp} XP to ${rank.next}` : " · max rank"}
            </div>
          </div>
        </div>
        <div className="summary-table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>ATC</th>
                <th>Your readback</th>
                <th>Score</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.phase}</td>
                  <td className="sum-atc">{r.atc}</td>
                  <td className="sum-you">{r.readback || "—"}</td>
                  <td className={tone(r.score)}>{r.score}%</td>
                  <td className="pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-primary btn-big" onClick={onNewFlight}>
          New flight
        </button>
      </div>
    </div>
  );
}
