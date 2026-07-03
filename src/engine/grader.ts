import type { GradeResult, ReadbackElement } from "./types";

// Normalizes a spoken or typed readback into a canonical token stream so
// "niner", "tree", "one two six decimal one two" and "126.12" all compare
// equal, then scores it against the instruction's required elements.

const WORD_NUMBERS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", won: "1", two: "2", to: "2", too: "2",
  three: "3", tree: "3", four: "4", for: "4", fore: "4", five: "5",
  fife: "5", six: "6", seven: "7", eight: "8", ate: "8", nine: "9",
  niner: "9", ten: "10", eleven: "11", twelve: "12",
};

const SYNONYMS: Record<string, string> = {
  decimal: ".",
  point: ".",
  centre: "center",
  juliet: "juliett",
};

export function normalizeTranscript(raw: string): string {
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
    .map((w) => SYNONYMS[w] ?? w)
    .map((w) => (WORD_NUMBERS[w] !== undefined && w !== "to" && w !== "for" ? WORD_NUMBERS[w] : w));

  // "to"/"for" become digits only when between other digits ("descend 2 4000")
  words = words.map((w, i) => {
    if (w === "to" || w === "for") {
      const near = words[i - 1] || "";
      const next = words[i + 1] || "";
      if (/^\d/.test(near) && /^\d/.test(next)) return WORD_NUMBERS[w];
    }
    return w;
  });

  // merge runs of spelled-out single digits: "1 2 6" -> "126", "0 8" -> "08";
  // multi-digit tokens are left alone so "240 10" stays two numbers
  const merged: string[] = [];
  let run: string[] = [];
  for (const w of words) {
    if (/^\d$/.test(w)) {
      run.push(w);
      continue;
    }
    if (run.length) {
      merged.push(run.join(""));
      run = [];
    }
    merged.push(w);
  }
  if (run.length) merged.push(run.join(""));

  let text = merged.join(" ");
  text = text.replace(/(\d+)\s*\.\s*(\d+)/g, "$1.$2");
  // "8 thousand" -> 8000, "8 thousand 5 hundred" -> 8500
  text = text.replace(/\b(\d{1,2})\s+thousand\s+(\d)\s+hundred\b/g, (_m, t, h) =>
    String(Number(t) * 1000 + Number(h) * 100),
  );
  text = text.replace(/\b(\d{1,2})\s+thousand\b/g, (_m, t) => String(Number(t) * 1000));
  text = text.replace(/\b(\d)\s+hundred\b/g, (_m, h) => String(Number(h) * 100));
  return text.replace(/\s+/g, " ").trim();
}

export function gradeReadback(rawTranscript: string, elements: ReadbackElement[]): GradeResult {
  const normalized = normalizeTranscript(rawTranscript);
  const padded = ` ${normalized} `;
  let earned = 0;
  let total = 0;
  const missed: string[] = [];
  const hit: string[] = [];
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
  return {
    score,
    ok: score >= 80,
    partial: score >= 55 && score < 80,
    missed,
    hit,
    normalized,
  };
}
