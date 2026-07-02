// Formatting numbers and identifiers the way controllers speak them,
// plus the accepted-pattern builders used by the grader.

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"];

export function sayDigits(str: string | number): string {
  return String(str)
    .split("")
    .map((ch) => (ch === "." ? "decimal" : DIGIT_WORDS[Number(ch)] ?? ch))
    .join(" ");
}

export function sayAltitude(ft: number): string {
  if (ft >= 18000) {
    return "flight level " + sayDigits(String(Math.round(ft / 100)));
  }
  const thousands = Math.floor(ft / 1000);
  const hundreds = Math.floor((ft % 1000) / 100);
  let out = "";
  if (thousands) out += sayDigits(String(thousands)) + " thousand";
  if (hundreds) out += (out ? " " : "") + DIGIT_WORDS[hundreds] + " hundred";
  return out || "zero";
}

export function sayHeading(hdg: number): string {
  return sayDigits(String(hdg).padStart(3, "0"));
}

export function sayFreq(mhz: string): string {
  return sayDigits(mhz);
}

export function sayRunway(rwy: string): string {
  const num = rwy.replace(/[LRC]/g, "");
  const side = rwy.endsWith("L") ? " left" : rwy.endsWith("R") ? " right" : rwy.endsWith("C") ? " centre" : "";
  return sayDigits(num) + side;
}

export function sayWind(dir: number, kt: number): string {
  return `wind ${sayDigits(String(dir).padStart(3, "0"))} at ${kt < 10 ? DIGIT_WORDS[kt] : sayDigits(String(kt))}`;
}

export function sayAltimeter(setting: string): string {
  return "altimeter " + sayDigits(setting.replace(".", ""));
}

// ---- accepted patterns, expressed in normalized-transcript space ----

export function runwayPatterns(rwy: string): string[] {
  const num = rwy.replace(/[LRC]/g, "");
  const short = String(Number(num));
  const side = rwy.endsWith("L") ? "left" : rwy.endsWith("R") ? "right" : "centre";
  const letter = rwy.slice(-1).toLowerCase();
  return [
    `${num} ${side}`, `${short} ${side}`,
    `${num}${letter}`, `${short}${letter}`,
    `${num} ${letter}`, `${short} ${letter}`,
  ];
}

export function altitudePatterns(ft: number): string[] {
  if (ft >= 18000) {
    const fl = String(Math.round(ft / 100));
    return [`flight level ${fl}`, `fl ${fl}`, `fl${fl}`, `level ${fl}`];
  }
  return [String(ft)];
}

export function freqPatterns(mhz: string): string[] {
  const pats = [mhz, mhz.replace(".", " ")];
  if (mhz.endsWith("0")) pats.push(mhz.slice(0, -1));
  const [int, dec] = mhz.split(".");
  if (dec) pats.push(`${int}.${Number(dec)}`);
  return pats;
}
