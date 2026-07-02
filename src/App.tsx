import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAudioContext, fxSettings } from "./audio/radioFx";
import { tts } from "./audio/tts";
import { DIFFICULTIES, session } from "./engine/session";
import { world } from "./engine/world";
import type { SessionSettings } from "./engine/types";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { usePushToTalk } from "./hooks/usePushToTalk";
import { useSession } from "./hooks/useSession";
import { CommsPanel } from "./components/CommsPanel";
import { DebriefOverlay } from "./components/Overlays";
import { Landing } from "./components/Landing";
import { RadarScope } from "./components/RadarScope";
import { SidePanel } from "./components/SidePanel";
import { TopBar } from "./components/TopBar";

interface Stats {
  xp: number;
  flights: number;
  bestStreak: number;
}

export default function App() {
  const snapshot = useSession();
  const [settings, setSettings] = useLocalStorage<SessionSettings>("atc-sim-settings", {
    difficulty: "rookie",
    scenario: "random",
    chatter: true,
    radioFx: true,
  });
  const [stats, setStats] = useLocalStorage<Stats>("atc-sim-stats", {
    xp: 0,
    flights: 0,
    bestStreak: 0,
  });
  const [draft, setDraft] = useState("");
  const [clock, setClock] = useState("0000Z");

  // keep engine settings in sync with UI settings
  useEffect(() => {
    session.settings = settings;
    fxSettings.enabled = settings.radioFx;
    tts.settings.rate = DIFFICULTIES[settings.difficulty].speechRate;
  }, [settings]);

  // ambient traffic: seed the scope once, and voice AI calls
  useEffect(() => {
    world.seed();
    world.onAmbient = (ev) => session.ambientCall(ev.kind, ev.tag, ev.radio);
    return () => {
      world.onAmbient = null;
    };
  }, []);

  // bank XP once per completed flight
  const bankedRef = useRef(false);
  useEffect(() => {
    if (snapshot.status === "debrief" && !bankedRef.current) {
      bankedRef.current = true;
      setStats((prev) => ({
        xp: prev.xp + snapshot.score,
        flights: prev.flights + 1,
        bestStreak: Math.max(prev.bestStreak, snapshot.maxStreak),
      }));
    }
    if (snapshot.status === "active") bankedRef.current = false;
  }, [snapshot.status, snapshot.score, snapshot.maxStreak, setStats]);

  // UTC clock for the scope overlay
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const z = (n: number) => String(n).padStart(2, "0");
      setClock(`${z(now.getUTCHours())}${z(now.getUTCMinutes())}${z(now.getUTCSeconds())}Z`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? draft).trim();
      if (!value) return;
      session.submit(value);
      setDraft("");
    },
    [draft],
  );

  const ptt = usePushToTalk({
    onInterim: (text) => setDraft(text),
    onFinal: (text) => {
      if (text) {
        setDraft(text);
        setTimeout(() => submit(text), 300);
      }
    },
  });

  // arm the mic only while a response window is open
  const { arm, disarm } = ptt;
  useEffect(() => {
    if (snapshot.awaiting) arm();
    else disarm();
  }, [snapshot.awaiting, arm, disarm]);

  const startFlight = useCallback(() => {
    ensureAudioContext();
    setDraft("");
    if (ptt.supported) void ptt.enable();
    session.start();
  }, [ptt]);

  // reset the transcript whenever a new instruction starts
  const lastStepRef = useRef(-1);
  useEffect(() => {
    if (snapshot.stepIndex !== lastStepRef.current) {
      lastStepRef.current = snapshot.stepIndex;
      setDraft("");
    }
  }, [snapshot.stepIndex]);

  const flight = snapshot.flight;
  const showAtcText = DIFFICULTIES[settings.difficulty].showText || !!snapshot.feedback;

  const micNote = !ptt.supported
    ? "Voice needs the Web Speech API — use Chrome or Edge, or just type your readbacks here."
    : ptt.status === "denied" || ptt.status === "error"
      ? ptt.statusDetail
      : "Voice uses your browser's speech recognition (best in Chrome/Edge). No mic? Type your readbacks — it plays exactly the same.";
  const micWarn = !ptt.supported || ptt.status === "denied" || ptt.status === "error";

  return (
    <div className="app">
      <TopBar
        score={snapshot.score}
        streak={snapshot.streak}
        streakMultiplier={snapshot.streakMultiplier}
        stats={stats}
        settings={settings}
        onSettings={(next) => setSettings((prev) => ({ ...prev, ...next }))}
      />

      <main className="sim-grid">
        <section className="panel radar-panel">
          <RadarScope
            overlay={{
              time: clock,
              flow: flight?.flow.label ?? world.flow.label,
              wind: flight ? `${String(flight.windDir).padStart(3, "0")}° / ${flight.windKt} kt` : "---° / -- kt",
              atis: flight ? `INFO ${flight.atisLetter}` : "INFO —",
            }}
          />
        </section>

        <CommsPanel
          freq={snapshot.freq}
          phase={snapshot.phase}
          atcText={snapshot.atcText}
          showAtcText={showAtcText}
          speaking={snapshot.speaking}
          awaiting={snapshot.awaiting}
          feedback={snapshot.feedback}
          ptt={ptt}
          draft={draft}
          onDraft={setDraft}
          onSubmit={() => submit()}
          onSayAgain={() => session.sayAgain()}
        />

        <SidePanel
          flight={flight}
          phase={snapshot.phase}
          completedPhases={snapshot.completedPhases}
          logs={snapshot.logs}
        />
      </main>

      <footer className="footer">
        <p>Training simulation only — not for real-world ATC or flight operations. Phraseology simplified from the Canadian AIM.</p>
      </footer>

      {snapshot.status === "idle" && (
        <Landing
          settings={settings}
          onSettings={(next) => setSettings((prev) => ({ ...prev, ...next }))}
          onStart={startFlight}
          micNote={micNote}
          micWarn={micWarn}
        />
      )}
      {snapshot.status === "debrief" && (
        <DebriefOverlay snapshot={snapshot} xp={stats.xp} bestStreak={stats.bestStreak} onNewFlight={startFlight} />
      )}
    </div>
  );
}
