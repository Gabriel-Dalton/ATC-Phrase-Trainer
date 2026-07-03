// Push-to-talk speech capture.
//
// Two problems shaped this design:
//
//  1. Clipping — starting recognition on key-down loses the first ~0.5-1s
//     of audio (exactly when the callsign is spoken), because the engine
//     takes time to spin up.
//  2. Retry storms — a permanently-hot continuous session that we restart
//     on every `onend` hammers the (cloud) speech backend; if the backend
//     is unreachable it produces an endless stream of `network` errors.
//
// So recognition is *armed on demand*: the app arms it when a response
// window opens (ATC finished talking) and disarms it when the window
// closes. Within a window one session stays live, so by the time the pilot
// keys the mic it is already warm — no clipping — and sessions only run
// during the handful of response windows in a flight, not the whole time.
// The PTT key gates which recognition results count toward the readback.
//
// Chrome's SpeechRecognition is cloud-based; on Brave / privacy browsers /
// blocked networks it fails with `network`. We surface that as a clear,
// non-spammy state and fall back to typing.

export type CaptureStatus =
  | "unsupported"
  | "idle"       // enabled but no window open
  | "live"       // armed, session running, not keyed
  | "keyed"      // PTT held, capturing
  | "denied"     // mic permission refused
  | "error";     // speech backend unreachable

export interface CaptureEvents {
  onStatus?: (status: CaptureStatus, detail?: string) => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
}

const GRACE_MS = 1000;
const MAX_NETWORK_ERRORS = 3;
const DENIED_MSG = "Microphone blocked — allow it in the browser and reload, or just type your readbacks.";
const NETWORK_MSG =
  "Voice unavailable — your browser's speech service is unreachable (common on Brave / privacy browsers). Type your readbacks and press Enter.";

export class SpeechCapture {
  readonly supported: boolean;

  private events: CaptureEvents;
  private rec: SpeechRecognition | null = null;
  private enabled = false;   // permission granted, capture allowed
  private armed = false;     // a response window is open
  private running = false;
  private starting = false;
  private keyed = false;
  private inGrace = false;
  private gaveUp = false;     // backend declared unreachable
  private networkErrors = 0;
  private boundary = 0;       // result index where this transmission starts
  private resultCount = 0;
  private carried = "";       // transcript kept across session restarts
  private latest = "";        // most recent transcript for this transmission
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
    if (!this.supported || this.gaveUp) return false;
    if (this.enabled) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      this.setStatus("denied", DENIED_MSG);
      return false;
    }
    this.enabled = true;
    this.setStatus("idle");
    return true;
  }

  /** Open a response window: warm up a session so the mic is ready. */
  arm(): void {
    if (!this.enabled || this.gaveUp) return;
    this.armed = true;
    this.startSession();
    if (this.status === "idle") this.setStatus("live");
  }

  /** Close the response window: stop listening. */
  disarm(): void {
    this.armed = false;
    if (this.keyed || this.inGrace) return; // let an in-flight transmission finish
    this.stopSession();
    if (this.enabled && !this.gaveUp) this.setStatus("idle");
  }

  keyDown(): void {
    if (!this.enabled || this.gaveUp) return;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    if (!this.running) this.startSession(); // safety: warm if arm() was missed
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
    if (!this.armed) this.disarm(); // window closed while we were finishing
  }

  private stopSession(): void {
    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        /* already stopped */
      }
    }
    this.rec = null;
    this.running = false;
  }

  private startSession(): void {
    if (!this.enabled || this.gaveUp || this.running || this.starting) return;
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
      this.boundary = 0; // accept everything a fresh session hears
    };

    rec.onresult = (ev) => {
      this.resultCount = ev.results.length;
      this.networkErrors = 0; // a result means the backend is reachable
      if (!this.keyed && !this.inGrace) return;

      let text = this.carried;
      let allFinal = true;
      for (let i = this.boundary; i < ev.results.length; i++) {
        text += (text ? " " : "") + ev.results[i][0].transcript.trim();
        if (!ev.results[i].isFinal) allFinal = false;
      }
      this.latest = text.trim();
      this.events.onInterim?.(this.latest);

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
        this.networkErrors++;
        if (this.networkErrors >= MAX_NETWORK_ERRORS) {
          this.gaveUp = true;
          this.setStatus("error", NETWORK_MSG);
        }
      }
      // 'no-speech' / 'aborted' are routine; onend decides whether to restart
    };

    rec.onend = () => {
      this.running = false;
      if (this.keyed || this.inGrace) {
        this.carried = this.latest; // preserve across a mid-transmission restart
      }
      // only restart while a window is genuinely open and the backend is alive
      if (this.armed && this.enabled && !this.gaveUp) {
        setTimeout(() => this.startSession(), 250);
      }
    };

    try {
      this.starting = true;
      rec.start();
    } catch {
      this.starting = false; // start() while already running — harmless
    }
  }

  destroy(): void {
    this.armed = false;
    this.enabled = false;
    this.keyed = false;
    this.inGrace = false;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.stopSession();
  }
}
