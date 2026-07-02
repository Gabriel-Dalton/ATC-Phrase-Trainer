import type { Flow, Frequency } from "./types";

export const AIRLINES: { icao: string; radio: string; types: string[] }[] = [
  { icao: "ACA", radio: "Air Canada", types: ["A320", "A321", "B38M", "B77W", "B789"] },
  { icao: "WJA", radio: "WestJet", types: ["B737", "B38M", "B789"] },
  { icao: "JZA", radio: "Jazz", types: ["DH8D", "CRJ9"] },
  { icao: "ASA", radio: "Alaska", types: ["B739", "E175"] },
  { icao: "UAL", radio: "United", types: ["B739", "A320"] },
  { icao: "DAL", radio: "Delta", types: ["A220", "B739"] },
  { icao: "POE", radio: "Porter", types: ["E195"] },
  { icao: "SWG", radio: "Sunwing", types: ["B38M"] },
  { icao: "PCO", radio: "Pasco", types: ["SF34"] },
  { icao: "KLM", radio: "KLM", types: ["B789"] },
  { icao: "DLH", radio: "Lufthansa", types: ["A359"] },
  { icao: "CPA", radio: "Cathay", types: ["A359", "B77W"] },
  { icao: "ANA", radio: "All Nippon", types: ["B789"] },
  { icao: "EVA", radio: "Eva", types: ["B77W"] },
  { icao: "QFA", radio: "Qantas", types: ["B789"] },
];

export const DESTINATIONS: { name: string; fix: string }[] = [
  { name: "Toronto", fix: "GRIZZ" },
  { name: "Calgary", fix: "GRIZZ" },
  { name: "Edmonton", fix: "GRIZZ" },
  { name: "Winnipeg", fix: "GRIZZ" },
  { name: "Ottawa", fix: "GRIZZ" },
  { name: "Montreal", fix: "GRIZZ" },
  { name: "Seattle", fix: "SEA" },
  { name: "San Francisco", fix: "HUH" },
  { name: "Los Angeles", fix: "HUH" },
  { name: "Kelowna", fix: "GRIZZ" },
  { name: "Victoria", fix: "VARDI" },
  { name: "Prince George", fix: "CANUC" },
  { name: "Tokyo", fix: "VARDI" },
  { name: "Hong Kong", fix: "VARDI" },
  { name: "London", fix: "GRIZZ" },
];

export const ORIGINS = [
  "Toronto", "Calgary", "Edmonton", "Seattle", "San Francisco",
  "Kelowna", "Victoria", "Winnipeg", "Los Angeles", "Montreal",
];

/** Simplified CYVR SIDs. */
export const SIDS: { name: string; number: number; spoken: string }[] = [
  { name: "GRIZZ", number: 7, spoken: "GRIZZ seven" },
  { name: "RICHMOND", number: 6, spoken: "Richmond six" },
  { name: "VARDI", number: 4, spoken: "VARDI four" },
  { name: "CANUC", number: 5, spoken: "CANUC five" },
];

export const FREQS: Record<string, Frequency> = {
  atis: { name: "Vancouver ATIS", mhz: "124.60" },
  clearance: { name: "Vancouver Clearance", mhz: "121.40" },
  ground: { name: "Vancouver Ground", mhz: "121.70" },
  towerNorth: { name: "Vancouver Tower", mhz: "118.70" },
  towerSouth: { name: "Vancouver Tower", mhz: "119.55" },
  departure: { name: "Vancouver Departure", mhz: "126.12" },
  arrival: { name: "Vancouver Arrival", mhz: "133.10" },
  centre: { name: "Vancouver Centre", mhz: "133.05" },
};

export const FLOWS: Record<"east" | "west", Flow> = {
  east: {
    key: "east",
    label: "EAST FLOW",
    dep: "08L",
    arr: "08R",
    depHeading: 83,
    arrHeading: 83,
    windDir: [60, 110],
  },
  west: {
    key: "west",
    label: "WEST FLOW",
    dep: "26R",
    arr: "26L",
    depHeading: 263,
    arrHeading: 263,
    windDir: [230, 290],
  },
};

export const TAXI_ROUTES: Record<"east" | "west", string[][]> = {
  east: [
    ["Alpha", "Kilo"],
    ["Alpha", "Golf"],
    ["Juliett", "Alpha"],
  ],
  west: [
    ["Mike", "Lima"],
    ["Juliett", "Mike"],
    ["Alpha", "Mike"],
  ],
};

export const PHONETIC: Record<string, string> = {
  A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot",
  G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima",
  M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo",
  S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey",
  X: "X-ray", Y: "Yankee", Z: "Zulu",
};

/** Decorative en-route fixes drawn on the scope (nm from field). */
export const MAP_FIXES: { name: string; x: number; y: number }[] = [
  { name: "GRIZZ", x: 20, y: 7 },
  { name: "CANUC", x: 8, y: 18 },
  { name: "VARDI", x: -7, y: -15 },
  { name: "SEA", x: 14, y: -20 },
  { name: "HUH", x: -2, y: -22 },
];

export const RANKS: { xp: number; title: string }[] = [
  { xp: 0, title: "Student Pilot" },
  { xp: 150, title: "Private Pilot" },
  { xp: 400, title: "Commercial Pilot" },
  { xp: 800, title: "First Officer" },
  { xp: 1500, title: "Senior First Officer" },
  { xp: 2500, title: "Captain" },
  { xp: 4000, title: "Training Captain" },
  { xp: 6000, title: "Check Airman" },
];

export const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));
