import { tts } from "../audio/tts";
import { buildFlight } from "./flightgen";
import { gradeReadback } from "./grader";
import { sayAltimeter, sayRunway, sayWind } from "./phraseology";
import { world } from "./world";
import type {
  Aircraft, CommStep, DifficultySpec, DifficultyKey, LogEntry,
  Scenario, SessionSettings, SessionSnapshot, StepResult,
} from "./types";

export const DIFFICULTIES: Record<DifficultyKey, DifficultySpec> = {
  rookie: {
    key: "rookie",
    label: "Rookie",
    description: "Transmission text shown",
    speechRate: 0.95,
    showText: true,
    responseTimeoutMs: 32000,
    multiplier: 1,
    allowRetry: true,
  },
  fo: {
    key: "fo",
    label: "First Officer",
    description: "Listen only",
    speechRate: 1.05,
    showText: false,
    responseTimeoutMs: 22000,
    multiplier: 1.5,
    allowRetry: true,
  },
  captain: {
    key: "captain",
    label: "Captain",
    description: "Fast speech, no retry",
    speechRate: 1.16,
    showText: false,
    responseTimeoutMs: 15000,
    multiplier: 2,
    allowRetry: false,
  },
};

// The FlightSession is the application-layer state machine: it owns the
// step sequence, timers, grading, scoring and the transmission log, and
// exposes an immutable snapshot for React via subscribe/getSnapshot.

export class FlightSession {
  settings: SessionSettings = {
    difficulty: "rookie",
    scenario: "random",
    chatter: true,
    radioFx: true,
  };

  /** Multiplier on inter-step delays; e2e tests compress this. */
  delayScale = 1;

  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = FlightSession.emptySnapshot();

  private steps: CommStep[] = [];
  private stepIndex = -1;
  private player: Aircraft | null = null;
  private attempts = 0;
  private nudged = false;
  private spokeAt = 0;
  private logId = 0;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;

  private static emptySnapshot(): SessionSnapshot {
    return {
      status: "idle",
      flight: null,
      stepIndex: -1,
      totalSteps: 0,
      phase: null,
      completedPhases: [],
      freq: null,
      atcText: null,
      speaking: false,
      awaiting: false,
      attempts: 0,
      feedback: null,
      results: [],
      score: 0,
      streak: 0,
      maxStreak: 0,
      logs: [],
    };
  }

  // ---- store interface ----

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  private patch(partial: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.listeners.forEach((cb) => cb());
  }

  private difficulty(): DifficultySpec {
    return DIFFICULTIES[this.settings.difficulty];
  }

  private log(who: string, text: string, kind: LogEntry["kind"]) {
    const entry: LogEntry = { id: ++this.logId, who, text, kind };
    this.patch({ logs: [entry, ...this.snapshot.logs].slice(0, 60) });
  }

  private clearTimers() {
    if (this.responseTimer) clearTimeout(this.responseTimer);
    if (this.nextTimer) clearTimeout(this.nextTimer);
  }

  // ---- lifecycle ----

  start(): void {
    this.clearTimers();
    tts.stopAll();
    tts.settings.rate = this.difficulty().speechRate;

    const scenario: Scenario =
      this.settings.scenario === "random"
        ? (Math.random() < 0.5 ? "departure" : "arrival")
        : this.settings.scenario;

    const built = buildFlight(scenario);
    this.steps = built.steps;
    this.stepIndex = -1;
    world.flow = built.plan.flow;
    this.player = built.spawnPlayer();
    this.logId = 0;

    this.snapshot = {
      ...FlightSession.emptySnapshot(),
      status: "active",
      flight: built.plan,
      totalSteps: this.steps.length,
    };
    this.listeners.forEach((cb) => cb());

    const p = built.plan;
    const atis = `Vancouver International information ${p.atisWord}. ${sayWind(p.windDir, p.windKt)}. ${sayAltimeter(p.altimeter)}. Landing runway ${sayRunway(p.flow.arr)}, departing runway ${sayRunway(p.flow.dep)}. Inform ATC you have information ${p.atisWord}.`;
    this.log("ATIS", atis, "atis");
    this.log("SYS", `${scenario === "departure" ? "Departure" : "Arrival"} flight ${p.tag} (${p.type}) — ${p.route}`, "sys");
    tts.transmit(atis, { rate: 1.06, volume: 0.55, pitch: 0.92 });

    this.scheduleNextStep(1500);
  }

  private scheduleNextStep(extraDelayMs: number) {
    this.clearTimers();
    this.nextTimer = setTimeout(() => {
      const prev = this.currentStep();
      if (prev && !this.snapshot.completedPhases.includes(prev.phase)) {
        // a phase is complete once we move past its last step
        const next = this.steps[this.stepIndex + 1];
        if (!next || next.phase !== prev.phase) {
          this.patch({ completedPhases: [...this.snapshot.completedPhases, prev.phase] });
        }
      }
      this.stepIndex++;
      const step = this.currentStep();
      if (!step) {
        this.finishFlight();
        return;
      }
      this.runStep(step);
    }, Math.max(50, extraDelayMs * this.delayScale));
  }

  private currentStep(): CommStep | null {
    return this.steps[this.stepIndex] ?? null;
  }

  private runStep(step: CommStep) {
    this.attempts = 0;
    this.nudged = false;
    this.patch({
      stepIndex: this.stepIndex,
      phase: step.phase,
      freq: step.freq,
      atcText: step.atc,
      awaiting: false,
      attempts: 0,
      feedback: null,
    });
    if (step.checkIn) this.log("YOU", step.checkIn, "you");
    this.speak(step.atc);
  }

  private speak(text: string) {
    this.patch({ speaking: true });
    this.log("ATC", text, "atc");
    tts.transmit(text, {
      onend: () => {
        this.spokeAt = performance.now();
        this.patch({ speaking: false, awaiting: true });
        this.armResponseTimer();
      },
    });
  }

  private armResponseTimer() {
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => {
      const step = this.currentStep();
      if (!step || !this.snapshot.awaiting) return;
      const flight = this.snapshot.flight!;
      if (!this.nudged) {
        this.nudged = true;
        const nudge = `${flight.radio}, how do you read?`;
        this.log("ATC", nudge, "atc");
        tts.transmit(nudge, { onend: () => this.armResponseTimer() });
      } else {
        // no response at all — zero the step and move on
        this.recordResult(step, "(no response)", 0, step.elements.map((e) => e.label), 0);
        this.patch({
          awaiting: false,
          streak: 0,
          feedback: {
            score: 0,
            verdict: "noresponse",
            missed: step.elements.map((e) => e.label),
            example: step.example,
          },
        });
        this.scheduleNextStep(step.delayAfterMs ?? 4000);
      }
    }, this.difficulty().responseTimeoutMs * this.delayScale);
  }

  sayAgain(): void {
    const step = this.currentStep();
    if (!step || this.snapshot.status !== "active") return;
    this.log("YOU", `${this.snapshot.flight!.radio}, say again.`, "you");
    tts.transmit(step.atc);
  }

  submit(rawText: string): void {
    const step = this.currentStep();
    const text = rawText.trim();
    if (!step || !this.snapshot.awaiting || !text) return;

    if (this.responseTimer) clearTimeout(this.responseTimer);
    const diff = this.difficulty();
    const grade = gradeReadback(text, step.elements);
    const responseSec = (performance.now() - this.spokeAt) / 1000;
    this.log("YOU", text, "you");

    if (!grade.ok && this.attempts === 0 && diff.allowRetry) {
      this.attempts = 1;
      this.patch({
        awaiting: false,
        attempts: 1,
        feedback: { score: grade.score, verdict: "retry", missed: grade.missed, example: step.example },
      });
      const correction = `${this.snapshot.flight!.radio}, negative. I say again: ${step.atc}`;
      this.log("ATC", correction, "atc");
      this.patch({ speaking: true });
      tts.transmit(correction, {
        onend: () => {
          this.spokeAt = performance.now();
          this.patch({ speaking: false, awaiting: true });
          this.armResponseTimer();
        },
      });
      return;
    }

    // final grading for this step
    let points = 0;
    if (grade.ok) {
      points = 10;
      if (this.attempts === 0) {
        if (responseSec <= 6) points += 3;
        else if (responseSec <= 12) points += 1;
      } else {
        points = 6;
      }
    } else {
      points = Math.round(grade.score / 12);
    }
    points = Math.round(points * diff.multiplier);

    const streak = grade.ok ? this.snapshot.streak + 1 : 0;
    this.recordResult(step, text, grade.score, grade.missed, points);
    this.patch({
      awaiting: false,
      score: this.snapshot.score + points,
      streak,
      maxStreak: Math.max(this.snapshot.maxStreak, streak),
      feedback: {
        score: grade.score,
        verdict: grade.ok ? "correct" : grade.partial ? "partial" : "incorrect",
        missed: grade.missed,
        example: step.example,
      },
    });

    // the aircraft complies either way so the flight keeps moving
    if (step.onCorrect && this.player) step.onCorrect(this.player);
    if (grade.ok && step.ack) {
      const ackText = `${this.snapshot.flight!.radio}, ${step.ack}`;
      this.log("ATC", ackText, "atc");
      tts.transmit(ackText);
    }
    this.scheduleNextStep(step.delayAfterMs ?? 4500);
  }

  private recordResult(step: CommStep, readback: string, score: number, missed: string[], points: number) {
    const result: StepResult = {
      phase: step.phase,
      atc: step.atc,
      readback,
      score,
      points,
      missed,
    };
    this.patch({ results: [...this.snapshot.results, result] });
  }

  private finishFlight() {
    this.clearTimers();
    const flight = this.snapshot.flight!;
    tts.transmit(`${flight.radio}, ${flight.scenario === "departure" ? "have a good flight" : "welcome to Vancouver"}.`);
    const total = this.snapshot.results.length;
    const avg = total ? Math.round(this.snapshot.results.reduce((s, r) => s + r.score, 0) / total) : 0;
    this.log("SYS", `Flight complete — average readback ${avg}%`, "sys");
    this.patch({ status: "debrief", awaiting: false, phase: null });
  }

  /** Ambient AI radio call: log it, and voice it if the frequency is quiet. */
  ambientCall(kind: "arrival" | "departure", tag: string, radio: string): void {
    if (!this.settings.chatter) return;
    const arr = this.snapshot.flight?.flow.arr ?? "08R";
    const dep = this.snapshot.flight?.flow.dep ?? "08L";
    const text =
      kind === "arrival"
        ? `${radio}, established ILS runway ${sayRunway(arr)}.`
        : `${radio}, runway ${sayRunway(dep)}, cleared for takeoff.`;
    this.log(kind === "arrival" ? tag : "TWR", text, "ambient");
    if (!this.snapshot.awaiting && !tts.isSpeaking && this.snapshot.status === "active") {
      tts.transmit(text, { volume: 0.35, pitch: kind === "arrival" ? 1.12 : 0.9, rate: 1.1 });
    }
  }

  /** Grade summary letter for the debrief. */
  static gradeLetter(avg: number): string {
    return avg >= 90 ? "A" : avg >= 80 ? "B" : avg >= 65 ? "C" : avg >= 50 ? "D" : "F";
  }

  averageScore(): number {
    const total = this.snapshot.results.length;
    return total ? Math.round(this.snapshot.results.reduce((s, r) => s + r.score, 0) / total) : 0;
  }
}

export const session = new FlightSession();
