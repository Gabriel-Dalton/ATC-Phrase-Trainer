// Push-to-talk speech capture.
//
// The naive approach — recognition.start() on key-down — clips the first
// words, because the engine takes up to a second to begin capturing.
// Instead we keep one continuous recognition session hot for the whole
// flight (auto-restarting whenever the browser ends it) and use the PTT
// key only to GATE which results we keep:
//
//   keyDown()  -> remember how many results the session has delivered;
//                 everything after that boundary belongs to this transmission
//   keyUp()    -> stop accepting new speech, wait a short grace period for
//                 the recognizer to finalize, then emit the transcript
//
// Microphone permission is requested explicitly up front so a denial is a
// visible state, not a silent failure.

export type CaptureStatus =
  | "unsupported"
  | "idle"       // not enabled yet
  | "live"       // hot mic session running, not keyed
  | "keyed"      // PTT held, capturing
  | "denied"     // mic permission refused
  | "error";

export interface CaptureEvents {
  onStatus?: (status: CaptureStatus, detail?: string) => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
}

const GRACE_MS = 1100;
const DENIED_MSG = "Microphone access denied — allow it in the browser and reload, or type your readbacks.";

export class SpeechCapture {
  readonly supported: boolean;

  private events: CaptureEvents;
  private rec: SpeechRecognition | null = null;
  private enabled = false;
  private running = false;
  private starting = false;
  private keyed = false;
  private inGrace = false;
  private boundary = 0;     // result index where the current transmission starts
  private resultCount = 0;  // results delivered so far in the current session
  private carried = "";     // transcript carried across browser session restarts
  private latest = "";      // most recent full transcript for this transmission
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private status: CaptureStatus = "idle";

  constructor(events: CaptureEvents = {}) {
    this.events = events;
    this.supported = !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);
    if (!this.supported) this.setStatus("unsupported");
  }

  get currentStatus(): CaptureStatus {
    return this.status;
  }

  private setStatus(status: CaptureStatus, detail?: string) {
    this.status = status;
    this.events.onStatus?.(status, detail);
  }

  /** Must be called from a user gesture so the permission prompt can show. */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.enabled) return true;
    try {
      // Explicit permission preflight — otherwise recognition fails silently.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      this.setStatus("denied", DENIED_MSG);
      return false;
    }
    this.enabled = true;
    this.startSession();
    return true;
  }

  disable(): void {
    this.enabled = false;
    this.keyed = false;
    this.inGrace = false;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        /* already stopped */
      }
    }
    this.rec = null;
    this.running = false;
    this.setStatus("idle");
  }

  keyDown(): void {
    if (!this.enabled) return;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.carried = "";
    this.latest = "";
    this.boundary = this.resultCount;
    this.keyed = true;
    this.inGrace = false;
    this.setStatus("keyed");
  }

  keyUp(): void {
    if (!this.enabled || !this.keyed) return;
    this.keyed = false;
    this.inGrace = true;
    this.setStatus("live");
    // give the recognizer a moment to finalize the tail of the transmission
    this.graceTimer = setTimeout(() => this.finishTransmission(), GRACE_MS);
  }

  private finishTransmission(): void {
    if (!this.inGrace) return;
    this.inGrace = false;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    const text = this.latest.trim();
    this.carried = "";
    this.latest = "";
    this.events.onFinal?.(text);
  }

  private startSession(): void {
    if (!this.enabled || this.running || this.starting) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    this.rec = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.starting = false;
      this.running = true;
      this.resultCount = 0;
      // if the session restarted mid-transmission, keep what we already
      // heard and accept everything the new session delivers
      this.boundary = 0;
      if (!this.keyed && !this.inGrace) this.setStatus("live");
    };

    rec.onresult = (ev) => {
      this.resultCount = ev.results.length;
      if (!this.keyed && !this.inGrace) return;

      let text = this.carried;
      let allFinal = true;
      for (let i = this.boundary; i < ev.results.length; i++) {
        text += (text ? " " : "") + ev.results[i][0].transcript.trim();
        if (!ev.results[i].isFinal) allFinal = false;
      }
      this.latest = text.trim();
      this.events.onInterim?.(this.latest);

      // a finalized tail arrived during the grace window — emit early
      if (this.inGrace && allFinal && ev.results.length > this.boundary) {
        this.finishTransmission();
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        this.enabled = false;
        this.running = false;
        this.setStatus("denied", DENIED_MSG);
        return;
      }
      if (ev.error === "network") {
        this.setStatus("error", "Speech service unreachable — you can still type readbacks.");
      }
      // 'no-speech' / 'aborted' are routine; onend restarts the session
    };

    rec.onend = () => {
      this.running = false;
      // preserve transcript if the browser ended the session mid-transmission
      if (this.keyed || this.inGrace) {
        this.carried = this.latest;
        this.boundary = 0;
      }
      if (this.enabled) {
        setTimeout(() => this.startSession(), 150);
      }
    };

    try {
      this.starting = true;
      rec.start();
    } catch {
      this.starting = false; // start() while already running — harmless
    }
  }
}
