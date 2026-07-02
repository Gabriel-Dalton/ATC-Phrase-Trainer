// Core domain types shared across the engine. This layer has no React
// and no DOM dependencies beyond timers.

export type Scenario = "departure" | "arrival";

export type Phase =
  | "CLEARANCE"
  | "GROUND"
  | "TOWER"
  | "DEPARTURE"
  | "ENROUTE"
  | "ARRIVAL"
  | "APPROACH"
  | "GATE";

export interface Frequency {
  name: string;
  mhz: string;
}

export interface Flow {
  key: "east" | "west";
  label: string;
  dep: string;
  arr: string;
  depHeading: number;
  arrHeading: number;
  windDir: [number, number];
}

/** One item the pilot must include in a readback. */
export interface ReadbackElement {
  label: string;
  patterns: string[];
  weight?: number;
}

export interface GradeResult {
  score: number;
  ok: boolean;
  partial: boolean;
  missed: string[];
  hit: string[];
  normalized: string;
}

export interface Aircraft {
  callsign: string;
  kind: "player" | "arrival" | "departure";
  player: boolean;
  /** position in nm, +x east, +y north, origin at CYVR */
  x: number;
  y: number;
  alt: number;
  gs: number;
  hdg: number;
  targetAlt: number | null;
  targetGs: number | null;
  targetHdg: number | null;
  turnDir: "left" | "right" | null;
  climbRate: number;
  accel: number;
  turnRate: number;
  onGround: boolean;
  ils: boolean;
  arrFlow: "east" | "west" | null;
  waypoint: { x: number; y: number } | null;
  history: { x: number; y: number }[];
  /** ft/min, derived each tick for the datablock trend arrow */
  vs: number;
  dead: boolean;
}

export interface FlightPlan {
  scenario: Scenario;
  flow: Flow;
  tag: string;
  radio: string;
  type: string;
  route: string;
  procedure: string;
  runway: string;
  squawk: string;
  cruise: number;
  atisLetter: string;
  atisWord: string;
  windDir: number;
  windKt: number;
  altimeter: string;
  phases: Phase[];
}

export interface CommStep {
  phase: Phase;
  freq: Frequency;
  atc: string;
  elements: ReadbackElement[];
  example: string;
  /** Pilot's initial call when switching to this frequency (log flavour only). */
  checkIn?: string;
  ack?: string;
  delayAfterMs?: number;
  onCorrect?: (player: Aircraft) => void;
}

export interface BuiltFlight {
  plan: FlightPlan;
  steps: CommStep[];
}

export interface LogEntry {
  id: number;
  who: string;
  text: string;
  kind: "atc" | "you" | "sys" | "atis" | "ambient";
}

export interface StepResult {
  phase: Phase;
  atc: string;
  readback: string;
  score: number;
  points: number;
  missed: string[];
}

export type Verdict = "correct" | "partial" | "incorrect" | "retry" | "noresponse";

export interface Feedback {
  score: number;
  verdict: Verdict;
  missed: string[];
  example: string;
}

export type DifficultyKey = "rookie" | "fo" | "captain";

export interface DifficultySpec {
  key: DifficultyKey;
  label: string;
  description: string;
  speechRate: number;
  showText: boolean;
  responseTimeoutMs: number;
  multiplier: number;
  allowRetry: boolean;
}

export interface SessionSettings {
  difficulty: DifficultyKey;
  scenario: Scenario | "random";
  chatter: boolean;
  radioFx: boolean;
}

export type SessionStatus = "idle" | "active" | "debrief";

export interface SessionSnapshot {
  status: SessionStatus;
  flight: FlightPlan | null;
  stepIndex: number;
  totalSteps: number;
  phase: Phase | null;
  completedPhases: Phase[];
  freq: Frequency | null;
  atcText: string | null;
  speaking: boolean;
  awaiting: boolean;
  attempts: number;
  feedback: Feedback | null;
  results: StepResult[];
  score: number;
  streak: number;
  maxStreak: number;
  logs: LogEntry[];
}
