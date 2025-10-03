import React, { useMemo, useRef, useState, useEffect } from "react";

// --- Simple in-browser ATC quiz & readback simulator ---
// Features:
// 1) Multiple‑choice: match ATC transmission → meaning
// 2) Readback practice: type your pilot readback; fuzzy scoring
// 3) Text‑to‑Speech "radio" to hear the controller
// 4) Tracks score & streaks; lightweight and embeddable
//
// Tip: You can export this as a single React component or copy logic into your site.

// -------------------- Helpers --------------------
const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);

// Very light normalization to compare typed readbacks
const normalize = (s) => s
  .toLowerCase()
  .replace(/[^a-z0-9\s\.]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Extract numbers & key tokens for fuzzy readback grading
const keyTokens = (s) => {
  const text = normalize(s);
  const words = text.split(" ");
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(m=>m[0]);
  const keep = new Set([
    "descend","climb","maintain","turn","left","right","heading","speed","contact","approach","tower","runway","cleared","ils","rnnav","gps","localizer","unrestricted","altitude","feet","flight","level"
  ]);
  const tokens = words.filter(w=>keep.has(w));
  return { tokens, nums };
};

// -------------------- Data --------------------
// You can expand this list freely.
const PHRASES = [
  {
    id: "unrestricted-5000",
    callsign: "Jazz three two three zero",
    atc: "Jazz 3230, descend to five thousand feet, unrestricted.",
    meaning: "Descend directly to 5,000 feet with no intermediate step-downs or crossing restrictions.",
    expectedReadback: "Down to five thousand unrestricted, Jazz three two three zero.",
  },
  {
    id: "contact-tower",
    callsign: "Air Canada one six two",
    atc: "Air Canada 162, contact tower one one eight decimal seven.",
    meaning: "Switch your radio to Tower frequency 118.7 MHz and check in.",
    expectedReadback: "Over to tower on one one eight decimal seven, Air Canada one six two.",
  },
  {
    id: "maintain-3000-ils",
    callsign: "WestJet four zero seven",
    atc: "WestJet 407, maintain three thousand until established, cleared ILS runway zero eight right.",
    meaning: "Hold 3,000 ft until you're established on the ILS, then continue the ILS approach to Runway 08R.",
    expectedReadback: "Maintain three thousand until established, cleared ILS zero eight right, WestJet four zero seven.",
  },
  {
    id: "turn-heading-220",
    callsign: "Harbour Air five niner",
    atc: "Harbour Air 59, turn right heading two two zero, vectors for sequence.",
    meaning: "Turn the aircraft to heading 220° for spacing into the arrival flow.",
    expectedReadback: "Right heading two two zero, Harbour Air five niner.",
  },
  {
    id: "speed-210",
    callsign: "Alaska two one three",
    atc: "Alaska 213, reduce speed to two one zero knots.",
    meaning: "Slow down to 210 knots indicated airspeed.",
    expectedReadback: "Speed two one zero, Alaska two one three.",
  },
  {
    id: "climb-fl180",
    callsign: "Pacific Coastal three one",
    atc: "Pacific Coastal 31, climb and maintain flight level one eight zero.",
    meaning: "Climb to FL180 (18,000 ft on standard pressure) and stay there.",
    expectedReadback: "Climb and maintain flight level one eight zero, Pacific Coastal three one.",
  },
];

// Build multiple choice options per card
const buildQuestion = () => {
  const main = PHRASES[rand(PHRASES.length)];
  const wrongs = shuffle(PHRASES.filter(p => p.id !== main.id)).slice(0,3).map(p=>p.meaning);
  return {
    ...main,
    choices: shuffle([main.meaning, ...wrongs])
  };
};

// -------------------- TTS (radio) --------------------
const speak = (text, rate=1.0) => {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate; // 0.1–10
  u.pitch = 1;
  u.volume = 1;
  // Try to pick a more "radio-like" en voice if available
  const enVoices = speechSynthesis.getVoices().filter(v => /en|English/i.test(v.lang));
  if (enVoices.length) u.voice = enVoices[0];
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
};

// -------------------- UI --------------------
export default function ATCPhraseTrainer(){
  const [mode, setMode] = useState("quiz"); // quiz | readback
  const [q, setQ] = useState(buildQuestion());
  const [sel, setSel] = useState(null);
  const [result, setResult] = useState(null); // correct | wrong | null
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const [currentRB, setCurrentRB] = useState(() => PHRASES[rand(PHRASES.length)]);
  const [typed, setTyped] = useState("");
  const [rbResult, setRbResult] = useState(null); // {ok, details}

  // Refresh voices list for TTS in some browsers
  useEffect(()=>{
    if ('speechSynthesis' in window) {
      speechSynthesis.onvoiceschanged = () => {};
    }
  },[]);

  const nextQuiz = () => {
    setSel(null); setResult(null); setQ(buildQuestion());
  };

  const checkChoice = (choice) => {
    setSel(choice);
    const correct = choice === q.meaning;
    setResult(correct ? "correct" : "wrong");
    if (correct){ setScore(s=>s+1); setStreak(s=>s+1); }
    else { setStreak(0); }
  };

  // Readback grading: compare tokens and numbers
  const gradeReadback = (typed, ref) => {
    const A = keyTokens(typed);
    const B = keyTokens(ref);

    // Token coverage
    const required = new Set(B.tokens);
    let hits = 0;
    for (const t of A.tokens) if (required.has(t)) hits++;
    const tokenScore = required.size ? hits / required.size : 1;

    // Numbers coverage (order‑agnostic)
    const numsA = new Set(A.nums);
    const numsB = new Set(B.nums);
    let numHits = 0;
    for (const n of numsB) if (numsA.has(n)) numHits++;
    const numScore = numsB.size ? numHits / numsB.size : 1;

    // Overall
    const overall = Math.round((0.65 * tokenScore + 0.35 * numScore) * 100);
    const ok = overall >= 75; // passing threshold
    return { ok, overall, tokenScore, numScore, neededTokens:[...required], numbers:[...numsB] };
  };

  const runGrade = () => {
    const res = gradeReadback(typed, currentRB.expectedReadback);
    setRbResult(res);
  };

  const nextRB = () => {
    setTyped(""); setRbResult(null);
    setCurrentRB(PHRASES[rand(PHRASES.length)]);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold">ATC Phrase Trainer</h1>
            <p className="text-sm text-slate-600">Practice real-world transmissions (YVR style) with a quick quiz and readback simulator. Uses on-device speech for a radio feel.</p>
          </div>
          <div className="inline-flex rounded-2xl overflow-hidden shadow">
            <button className={`px-4 py-2 text-sm font-medium ${mode==='quiz' ? 'bg-slate-900 text-white' : 'bg-white'}`} onClick={()=>setMode('quiz')}>Multiple‑Choice</button>
            <button className={`px-4 py-2 text-sm font-medium ${mode==='readback' ? 'bg-slate-900 text-white' : 'bg-white'}`} onClick={()=>setMode('readback')}>Readback Practice</button>
          </div>
        </header>

        {mode==='quiz' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 shadow">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Controller says</p>
                  <p className="text-lg mt-1 font-semibold">{q.atc}</p>
                  <p className="text-slate-500 text-sm">Callsign: <span className="font-medium">{q.callsign}</span></p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded-xl border" onClick={()=>speak(q.atc, 1.02)}>▶︎ Play (TTS)</button>
                  <button className="px-3 py-2 rounded-xl border" onClick={()=>nextQuiz()}>↻ New</button>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {q.choices.map((c,i)=> (
                <button key={i}
                  onClick={()=>checkChoice(c)}
                  className={`text-left bg-white rounded-xl p-4 shadow border transition ${sel===c && result==='correct' ? 'border-green-500 ring-2 ring-green-200' : sel===c && result==='wrong' ? 'border-rose-500 ring-2 ring-rose-200' : 'border-transparent hover:border-slate-200'}`}
                >{c}</button>
              ))}
            </div>

            <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow">
              <div className="text-sm text-slate-600">Score: <span className="font-bold text-slate-900">{score}</span> · Streak: <span className="font-bold text-slate-900">{streak}</span></div>
              <div className="text-sm">
                {result==='correct' && <span className="text-green-700 font-medium">Nice! Correct.</span>}
                {result==='wrong' && (
                  <span className="text-rose-700 font-medium">Not quite. Correct meaning: “{q.meaning}”.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {mode==='readback' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 shadow">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Controller says</p>
                  <p className="text-lg mt-1 font-semibold">{currentRB.atc}</p>
                  <p className="text-slate-500 text-sm">Callsign: <span className="font-medium">{currentRB.callsign}</span></p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded-xl border" onClick={()=>speak(currentRB.atc, 1.02)}>▶︎ Play (TTS)</button>
                  <button className="px-3 py-2 rounded-xl border" onClick={nextRB}>↻ New</button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow space-y-3">
              <label className="text-sm text-slate-600">Type your readback like a pilot would say it:</label>
              <textarea
                value={typed}
                onChange={(e)=>setTyped(e.target.value)}
                className="w-full min-h-[120px] rounded-xl border p-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="e.g., Down to five thousand unrestricted, Jazz three two three zero."
              />
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={runGrade}>Check</button>
                <button className="px-4 py-2 rounded-xl border" onClick={()=>setTyped("")}>Clear</button>
                <button className="px-4 py-2 rounded-xl border" onClick={()=>speak(typed || "(No text typed)", 1)}>Speak My Readback</button>
              </div>

              {rbResult && (
                <div className={`mt-3 p-3 rounded-xl ${rbResult.ok ? 'bg-green-50 border border-green-200' : 'bg-rose-50 border border-rose-200'}`}>
                  <p className="font-medium mb-1">{rbResult.ok ? 'Great readback!' : 'Needs a bit more.'} Score: {rbResult.overall}%</p>
                  <p className="text-sm text-slate-700">Key tokens expected: <span className="font-mono">{rbResult.neededTokens.join(', ') || '—'}</span></p>
                  <p className="text-sm text-slate-700">Numbers expected: <span className="font-mono">{rbResult.numbers.join(', ') || '—'}</span></p>
                  {!rbResult.ok && (
                    <details className="mt-2 text-sm text-slate-600">
                      <summary className="cursor-pointer">Show ideal readback</summary>
                      <p className="mt-1 italic">{currentRB.expectedReadback}</p>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="mt-10 text-xs text-slate-500">
          <p>Training aid only. Not for real-world flight. ATC examples inspired by common Vancouver (CYVR) ops but not official phraseology.</p>
        </footer>
      </div>
    </div>
  );
}
