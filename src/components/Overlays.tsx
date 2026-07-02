import { FlightSession } from "../engine/session";
import type { SessionSnapshot } from "../engine/types";

export function StartOverlay({ onStart, micNote }: { onStart: () => void; micNote: string | null }) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <span className="brand-badge big">CYVR</span>
        <h2>Vancouver ATC Simulation</h2>
        <p>
          Fly a full departure or arrival at Vancouver International — clearance delivery, ground,
          tower and terminal control, live on frequency. Listen to each transmission, key the mic,
          and read it back.
        </p>
        <ul className="overlay-hints">
          <li><strong>Hold SPACE</strong> (or the mic button) to transmit — release to send</li>
          <li><strong>Type + Enter</strong> works if you have no microphone</li>
          <li>Graded on the items that matter: runways, altitudes, headings, frequencies, squawks</li>
          <li>Watch the radar — your aircraft flies what you read back</li>
        </ul>
        {micNote && <p className="mic-note">{micNote}</p>}
        <button type="button" className="btn btn-primary btn-big" onClick={onStart}>
          Start flight
        </button>
      </div>
    </div>
  );
}

interface DebriefProps {
  snapshot: SessionSnapshot;
  xp: number;
  rank: string;
  bestStreak: number;
  onNewFlight: () => void;
}

export function DebriefOverlay({ snapshot, xp, rank, bestStreak, onNewFlight }: DebriefProps) {
  const total = snapshot.results.length;
  const avg = total ? Math.round(snapshot.results.reduce((s, r) => s + r.score, 0) / total) : 0;
  const letter = FlightSession.gradeLetter(avg);
  const flight = snapshot.flight!;

  return (
    <div className="overlay">
      <div className="overlay-card overlay-card--wide">
        <h2>Flight debrief</h2>
        <div className="summary-grade">
          <div className={`grade-letter ${avg >= 80 ? "good" : avg >= 55 ? "partial" : "bad"}`}>{letter}</div>
          <div className="grade-meta">
            <div>
              {flight.tag} · {flight.route}
            </div>
            <div>
              Average readback <strong>{avg}%</strong> · Flight score <strong>{snapshot.score}</strong>
            </div>
            <div>
              Total XP <strong>{xp}</strong> · Rank <strong>{rank}</strong> · Best streak <strong>{bestStreak}</strong>
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
              </tr>
            </thead>
            <tbody>
              {snapshot.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.phase}</td>
                  <td className="sum-atc">{r.atc}</td>
                  <td className="sum-you">{r.readback || "—"}</td>
                  <td className={r.score >= 80 ? "good" : r.score >= 55 ? "partial" : "bad"}>{r.score}%</td>
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
