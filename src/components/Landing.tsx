import { DIFFICULTIES } from "../engine/session";
import type { DifficultyKey, Scenario, SessionSettings } from "../engine/types";

interface Props {
  settings: SessionSettings;
  onSettings: (next: Partial<SessionSettings>) => void;
  onStart: () => void;
  micNote: string | null;
  micWarn: boolean;
}

const FEATURES: { k: string; d: string }[] = [
  { k: "Voice or type", d: "Hold to transmit, or type your readback. Graded on the words that matter." },
  { k: "Real phraseology", d: "Runways, altitudes, headings, squawks — scored the way a controller would." },
  { k: "Live radar", d: "Your aircraft flies what you read back, amid ambient Vancouver traffic." },
  { k: "Rank up", d: "Earn XP every flight, from Student Pilot to Check Airman." },
];

export function Landing({ settings, onSettings, onStart, micNote, micWarn }: Props) {
  const scenarios: (Scenario | "random")[] = ["random", "departure", "arrival"];

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <div className="landing-sweep" aria-hidden />
      <div className="landing-inner">
        <div className="landing-badge">
          <span className="glyph">◈</span> CYVR ATC SIM · VANCOUVER TERMINAL
        </div>

        <h1 className="landing-title">
          Fly the radio.<br />
          <span className="accent">Read it back.</span>
        </h1>

        <p className="landing-lede">
          A live air-traffic-control radio simulation at Vancouver International. Work every
          controller from clearance delivery to the gate — listen, key the mic, and read back
          the clearance like a real crew.
        </p>

        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.k}>
              <span className="feature-k">{f.k}</span>
              <span className="feature-d">{f.d}</span>
            </div>
          ))}
        </div>

        <div className="landing-setup">
          <div className="setup-group">
            <span className="setup-label">Difficulty</span>
            <div className="diff-cards">
              {Object.values(DIFFICULTIES).map((d) => (
                <button
                  type="button"
                  key={d.key}
                  className={`diff-card ${settings.difficulty === d.key ? "selected" : ""}`}
                  onClick={() => onSettings({ difficulty: d.key as DifficultyKey })}
                >
                  <span className="dc-name">{d.label}</span>
                  <span className="dc-desc">{d.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="setup-group">
            <span className="setup-label">Flight</span>
            <div className="scenario-toggle">
              {scenarios.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={settings.scenario === s ? "selected" : ""}
                  onClick={() => onSettings({ scenario: s })}
                >
                  {s === "random" ? "Random" : s === "departure" ? "Departure" : "Arrival"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-cta">
          <button type="button" className="btn btn-primary btn-big" onClick={onStart}>
            Start flight
          </button>
          <span className="setup-label">Hold SPACE to transmit · Enter to send a typed readback</span>
        </div>

        {micNote && <p className={`landing-note ${micWarn ? "warn" : ""}`}>{micNote}</p>}
      </div>
    </div>
  );
}
