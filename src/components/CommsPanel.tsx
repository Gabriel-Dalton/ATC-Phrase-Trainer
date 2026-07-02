import { useEffect, useState } from "react";
import type { Feedback, Frequency, Phase } from "../engine/types";
import type { PushToTalk } from "../hooks/usePushToTalk";

interface Props {
  freq: Frequency | null;
  phase: Phase | null;
  atcText: string | null;
  showAtcText: boolean;
  speaking: boolean;
  awaiting: boolean;
  feedback: Feedback | null;
  ptt: PushToTalk;
  draft: string;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  onSayAgain: () => void;
}

const VERDICT_TEXT: Record<Feedback["verdict"], string> = {
  correct: "Readback correct",
  partial: "Partial readback",
  incorrect: "Readback incorrect",
  retry: "Negative — listen for the correction",
  noresponse: "No response",
};

function tone(score: number): string {
  return score >= 80 ? "good" : score >= 55 ? "partial" : "bad";
}

function micStatus(ptt: PushToTalk, awaiting: boolean): { text: string; cls: string } {
  switch (ptt.status) {
    case "unsupported":
      return { text: "No speech recognition in this browser — type your readbacks", cls: "warn" };
    case "denied":
    case "error":
      return { text: ptt.statusDetail ?? "Voice unavailable — type your readbacks", cls: "warn" };
    case "keyed":
      return { text: "Transmitting — speak now", cls: "active" };
    case "live":
      return { text: awaiting ? "Mic ready — hold SPACE to respond" : "Mic ready", cls: "ready" };
    default:
      return { text: awaiting ? "Type your readback, or hold to transmit" : "Standby", cls: "" };
  }
}

export function CommsPanel({
  freq, phase, atcText, showAtcText, speaking, awaiting, feedback,
  ptt, draft, onDraft, onSubmit, onSayAgain,
}: Props) {
  const mic = micStatus(ptt, awaiting);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 350);
    return () => clearTimeout(t);
  }, [feedback]);

  let display: string;
  let displayCls = "";
  if (showAtcText && atcText) {
    display = atcText;
  } else if (speaking) {
    display = "Incoming transmission — listen.";
  } else if (awaiting) {
    display = ptt.keyed ? "Listening…" : "Respond with your readback.";
    displayCls = ptt.keyed ? "listening" : "";
  } else {
    display = atcText ?? "Start a flight to pick up your clearance.";
  }

  return (
    <section className="panel comms-panel">
      <div className="freq-display">
        <div>
          <p className="label">{phase ?? "Standby"}</p>
          <h2>{freq?.name ?? "Vancouver Terminal"}</h2>
        </div>
        <div className="freq-mhz">{freq?.mhz ?? "---.--"}</div>
      </div>

      <div className={`atc-display ${speaking ? "speaking" : ""} ${displayCls}`}>{display}</div>

      <div className={`feedback ${flash ? "flash" : ""}`}>
        {feedback && (
          <>
            <div className="feedback-head">
              <span className={`feedback-verdict ${tone(feedback.score)}`}>
                {VERDICT_TEXT[feedback.verdict]} — {feedback.score}%
              </span>
              {feedback.points > 0 && (
                <span className={`feedback-points ${tone(feedback.score)}`}>+{feedback.points}</span>
              )}
            </div>
            {feedback.note && <div className="feedback-note">{feedback.note}</div>}
            {feedback.missed.length > 0 && (
              <div className="feedback-missed">Missed: {feedback.missed.join(" · ")}</div>
            )}
            <div className="feedback-example">Ideal: “{feedback.example}”</div>
          </>
        )}
      </div>

      <div className="mic-row">
        <button
          type="button"
          className={`btn btn-ptt ${ptt.keyed ? "keyed" : ""}`}
          disabled={ptt.status === "unsupported" || ptt.status === "denied" || ptt.status === "error"}
          onPointerDown={(e) => {
            e.preventDefault();
            ptt.keyDown();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            ptt.keyUp();
          }}
          onPointerLeave={() => ptt.keyUp()}
          title="Hold to transmit (or hold SPACE). Release to send."
        >
          <svg className="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
          </svg>
          {ptt.keyed ? "Transmitting…" : "Hold to transmit"}
        </button>
        <span className={`mic-status ${mic.cls}`}>{mic.text}</span>
      </div>

      <textarea
        className="readback-area"
        placeholder="Your readback appears here as you speak — or type it and press Enter."
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />

      <div className="comms-actions">
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={!awaiting || !draft.trim()}>
          Transmit readback
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSayAgain}>
          Say again
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onDraft("")}>
          Clear
        </button>
      </div>
    </section>
  );
}
