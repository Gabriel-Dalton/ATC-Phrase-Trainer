// WebAudio radio texture: squelch clicks at key/unkey and a faint
// carrier hiss while a transmission is in progress.

let ctx: AudioContext | null = null;
let hissSource: AudioBufferSourceNode | null = null;

export const fxSettings = {
  enabled: true,
};

export function ensureAudioContext(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx && ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function squelch(volume = 0.1): void {
  const ac = ensureAudioContext();
  if (!ac || !fxSettings.enabled) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.07);
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2000;
  band.Q.value = 0.8;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
  src.connect(band).connect(gain).connect(ac.destination);
  src.start();
}

export function hissStart(): void {
  const ac = ensureAudioContext();
  if (!ac || !fxSettings.enabled || hissSource) return;
  hissSource = ac.createBufferSource();
  hissSource.buffer = noiseBuffer(ac, 2);
  hissSource.loop = true;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600;
  band.Q.value = 0.6;
  const gain = ac.createGain();
  gain.gain.value = 0.014;
  hissSource.connect(band).connect(gain).connect(ac.destination);
  hissSource.start();
}

export function hissStop(): void {
  if (hissSource) {
    try {
      hissSource.stop();
    } catch {
      /* already stopped */
    }
    hissSource = null;
  }
}
