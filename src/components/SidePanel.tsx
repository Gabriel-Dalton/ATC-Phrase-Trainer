import type { FlightPlan, LogEntry, Phase } from "../engine/types";

interface Props {
  flight: FlightPlan | null;
  phase: Phase | null;
  completedPhases: Phase[];
  logs: LogEntry[];
}

function FlightStrip({ flight }: { flight: FlightPlan | null }) {
  if (!flight) {
    return (
      <div className="flight-strip">
        <div className="strip-empty">No active flight</div>
      </div>
    );
  }
  const alt = flight.scenario === "departure" ? `5000 / FL${flight.cruise / 100}` : `ILS ${flight.runway}`;
  const rows: [string, string][] = [
    ["Flight", flight.radio],
    ["Route", flight.route],
    [flight.scenario === "departure" ? "SID" : "Approach", flight.procedure],
    ["Runway", flight.runway],
    ["Squawk", flight.squawk],
    ["Altitude", alt],
  ];
  return (
    <div className="flight-strip">
      <div className="strip-row strip-head">
        <span>{flight.tag}</span>
        <span>{flight.type}</span>
      </div>
      {rows.map(([label, value]) => (
        <div className="strip-row" key={label}>
          <span className="strip-label">{label}</span>
          <span className="strip-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function SidePanel({ flight, phase, completedPhases, logs }: Props) {
  return (
    <aside className="panel side-panel">
      <div className="side-block">
        <h3>Flight strip</h3>
        <FlightStrip flight={flight} />
      </div>

      <div className="side-block">
        <h3>Phase</h3>
        <ul className="phase-tracker">
          {(flight?.phases ?? []).map((p) => (
            <li
              key={p}
              className={p === phase ? "active" : completedPhases.includes(p) ? "done" : ""}
            >
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="side-block side-block--grow">
        <h3>Frequency log</h3>
        <ul className="log">
          {logs.map((entry) => (
            <li key={entry.id} className={`log-entry log-${entry.kind}`}>
              <span className="log-who">{entry.who}</span>
              <span className="log-text">{entry.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
