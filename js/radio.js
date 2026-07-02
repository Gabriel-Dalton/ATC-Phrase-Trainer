// ============================================================
// RADIO — TTS with radio effects, speech recognition, grading
// ============================================================

const Radio = (() => {
  let audioCtx = null;
  let hissNode = null;
  let hissGain = null;
  let voices = [];
  let speaking = false;
  let queue = [];

  const settings = {
    radioFx: true,
    rate: 1.0,
    muted: false,
  };

  function ensureCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function loadVoices() {
    voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Short static burst — the squelch click at key/unkey
  function squelch(volume = 0.12) {
    const ctx = ensureCtx();
    if (!ctx || !settings.radioFx || settings.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.07);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2000;
    band.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start();
  }

  // Faint background hiss while a transmission is in progress
  function hissStart() {
    const ctx = ensureCtx();
    if (!ctx || !settings.radioFx || settings.muted || hissNode) return;
    hissNode = ctx.createBufferSource();
    hissNode.buffer = noiseBuffer(ctx, 2);
    hissNode.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 0.6;
    hissGain = ctx.createGain();
    hissGain.gain.value = 0.016;
    hissNode.connect(band).connect(hissGain).connect(ctx.destination);
    hissNode.start();
  }

  function hissStop() {
    if (hissNode) {
      try { hissNode.stop(); } catch (e) { /* already stopped */ }
      hissNode = null;
      hissGain = null;
    }
  }

  function playNext() {
    if (speaking || !queue.length) return;
    const job = queue.shift();
    if (!("speechSynthesis" in window) || settings.muted) {
      job.onstart && job.onstart();
      job.onend && job.onend();
      playNext();
      return;
    }
    speaking = true;
    const u = new SpeechSynthesisUtterance(job.text);
    u.rate = settings.rate * (job.rate || 1);
    u.pitch = job.pitch || 1;
    u.volume = job.volume ?? 1;
    if (voices.length) u.voice = voices[(job.voiceIdx || 0) % voices.length];
    u.onstart = () => {
      squelch();
      hissStart();
      job.onstart && job.onstart();
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      hissStop();
      squelch(0.08);
      speaking = false;
      job.onend && job.onend();
      playNext();
    };
    u.onend = finish;
    u.onerror = finish;
    // some environments never fire onend (no voices, muted OS) — don't hang
    const watchdog = setTimeout(finish, Math.min(30000, 3000 + job.text.length * 110));
    speechSynthesis.speak(u);
  }

  function transmit(text, opts = {}) {
    queue.push({ text, ...opts });
    playNext();
  }

  function stopAll() {
    queue = [];
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    hissStop();
    speaking = false;
  }

  // ----------------------------------------------------------
  // Speech recognition (push-to-talk)
  // ----------------------------------------------------------
  let recognition = null;
  let recActive = false;

  function initRecognition(handlers) {
    const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Engine) return false;
    recognition = new Engine();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => { recActive = true; handlers.onstart && handlers.onstart(); };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join(" ");
      handlers.onresult && handlers.onresult(transcript.trim());
    };
    recognition.onend = () => { recActive = false; handlers.onend && handlers.onend(); };
    recognition.onerror = (event) => { recActive = false; handlers.onerror && handlers.onerror(event.error); };
    return true;
  }

  function pttDown() {
    if (!recognition || recActive) return;
    stopAll(); // keying the mic steps on whoever is talking
    squelch();
    try { recognition.start(); } catch (e) { /* already started */ }
  }

  function pttUp() {
    if (!recognition) return;
    try { recognition.stop(); } catch (e) { /* not running */ }
    squelch(0.08);
  }

  return {
    settings, transmit, stopAll, initRecognition, pttDown, pttUp,
    get isSpeaking() { return speaking; },
    get hasRecognition() { return !!recognition; },
    ensureCtx,
  };
})();

// ============================================================
// GRADER — normalize a spoken/typed readback and score it
// against the required elements of the instruction
// ============================================================

const WORD_NUMBERS = {
  zero: "0", oh: "0", one: "1", won: "1", two: "2", to: "2", too: "2",
  three: "3", tree: "3", four: "4", for: "4", fore: "4", five: "5",
  fife: "5", six: "6", seven: "7", eight: "8", ate: "8", nine: "9",
  niner: "9", ten: "10", eleven: "11", twelve: "12",
};

const NORMALIZE_SYNONYMS = {
  "decimal": ".", "point": ".",
  "centre": "center",
  "juliet": "juliett",
};

function normalizeTranscript(raw) {
  let words = String(raw)
    .toLowerCase()
    .replace(/,/g, "")
    // keep "." only as a numeric decimal (119.5); sentence periods become spaces
    .replace(/(\d)\.(\d)/g, "$1__dot__$2")
    .replace(/\./g, " ")
    .replace(/__dot__/g, ".")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/(\d)-(\d)/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NORMALIZE_SYNONYMS[w] ?? w)
    .map((w) => (WORD_NUMBERS[w] !== undefined && w !== "to" && w !== "for" ? WORD_NUMBERS[w] : w));

  // "to"/"for" become digits only when adjacent to other digits ("descend to 4000")
  words = words.map((w, i) => {
    if (w === "to" || w === "for") {
      const near = words[i - 1] || "", next = words[i + 1] || "";
      if (/^\d/.test(near) && /^\d/.test(next)) return WORD_NUMBERS[w];
    }
    return w;
  });

  // merge runs of spelled-out single digits: "1 2 6" -> "126", "0 8" -> "08"
  // (multi-digit tokens like "240" are left alone so "240 10" stays two numbers)
  const merged = [];
  let run = [];
  for (const w of words) {
    if (/^\d$/.test(w)) { run.push(w); continue; }
    if (run.length) { merged.push(run.join("")); run = []; }
    merged.push(w);
  }
  if (run.length) merged.push(run.join(""));

  let text = merged.join(" ");
  text = text.replace(/(\d+)\s*\.\s*(\d+)/g, "$1.$2");
  // "8 thousand" -> 8000, "8 thousand 5 hundred" -> 8500
  text = text.replace(/\b(\d{1,2})\s+thousand\s+(\d)\s+hundred\b/g, (m, t, h) => String(Number(t) * 1000 + Number(h) * 100));
  text = text.replace(/\b(\d{1,2})\s+thousand\b/g, (m, t) => String(Number(t) * 1000));
  text = text.replace(/\b(\d)\s+hundred\b/g, (m, h) => String(Number(h) * 100));
  return text.replace(/\s+/g, " ").trim();
}

// element: { label, patterns: [normalized strings], weight? }
function gradeReadback(rawTranscript, elements) {
  const normalized = normalizeTranscript(rawTranscript);
  const padded = ` ${normalized} `;
  let earned = 0;
  let total = 0;
  const missed = [];
  const hit = [];
  for (const el of elements) {
    const weight = el.weight ?? 1;
    total += weight;
    const found = el.patterns.some((p) => padded.includes(` ${normalizeTranscript(p)} `));
    if (found) {
      earned += weight;
      hit.push(el.label);
    } else {
      missed.push(el.label);
    }
  }
  const score = total ? Math.round((earned / total) * 100) : 100;
  return { score, ok: score >= 80, partial: score >= 55 && score < 80, missed, hit, normalized };
}
