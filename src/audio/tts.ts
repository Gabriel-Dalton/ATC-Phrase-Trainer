import { hissStart, hissStop, squelch } from "./radioFx";

// Serialized text-to-speech queue with radio effects and a watchdog for
// environments where speechSynthesis never fires onend.

interface SpeakJob {
  text: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceIdx?: number;
  onstart?: () => void;
  onend?: () => void;
}

class Tts {
  settings = {
    rate: 1.0,
    muted: false,
  };

  private queue: SpeakJob[] = [];
  private speaking = false;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if ("speechSynthesis" in window) {
      const load = () => {
        this.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      };
      load();
      speechSynthesis.onvoiceschanged = load;
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  transmit(text: string, opts: Omit<SpeakJob, "text"> = {}): void {
    this.queue.push({ text, ...opts });
    this.playNext();
  }

  stopAll(): void {
    this.queue = [];
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    hissStop();
    this.speaking = false;
  }

  private playNext(): void {
    if (this.speaking || !this.queue.length) return;
    const job = this.queue.shift()!;
    if (!("speechSynthesis" in window) || this.settings.muted) {
      job.onstart?.();
      job.onend?.();
      this.playNext();
      return;
    }
    this.speaking = true;
    const u = new SpeechSynthesisUtterance(job.text);
    u.rate = this.settings.rate * (job.rate ?? 1);
    u.pitch = job.pitch ?? 1;
    u.volume = job.volume ?? 1;
    if (this.voices.length) u.voice = this.voices[(job.voiceIdx ?? 0) % this.voices.length];

    u.onstart = () => {
      squelch();
      hissStart();
      job.onstart?.();
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      hissStop();
      squelch(0.08);
      this.speaking = false;
      job.onend?.();
      this.playNext();
    };
    u.onend = finish;
    u.onerror = finish;
    // some environments never fire onend (no voices, muted OS) — don't hang
    const watchdog = setTimeout(finish, Math.min(30000, 3000 + job.text.length * 110));
    speechSynthesis.speak(u);
  }
}

export const tts = new Tts();
