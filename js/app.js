// ============================================================
// APP — flight generation, comms step engine, scoring, UI
// ============================================================

const $ = (id) => document.getElementById(id);

const els = {
  ovrTime: $("ovr-time"), ovrWind: $("ovr-wind"), ovrAtis: $("ovr-atis"),
  ovrFlow: $("ovr-flow"),
  freqName: $("freq-name"), freqMhz: $("freq-mhz"), phaseLabel: $("phase-label"),
  atcDisplay: $("atc-display"), micStatus: $("mic-status"),
  ptt: $("ptt"), readback: $("readback"), submit: $("submit-btn"),
  clearBtn: $("clear-btn"), repeatBtn: $("repeat-btn"), feedback: $("feedback"),
  strip: $("flight-strip"), checklist: $("checklist"), log: $("log"),
  statScore: $("stat-score"), statStreak: $("stat-streak"),
  statXp: $("stat-xp"), statRank: $("stat-rank"),
  setDifficulty: $("set-difficulty"), setScenario: $("set-scenario"),
  setAmbient: $("set-ambient"), setRadiofx: $("set-radiofx"),
  startOverlay: $("start-overlay"), startBtn: $("start-btn"),
  summaryOverlay: $("summary-overlay"), summaryBody: $("summary-body"),
  summaryNew: $("summary-new"),
};

const DIFFICULTY = {
  rookie: { label: "ROOKIE", rate: 0.95, showText: true, timeout: 32000, multiplier: 1, retry: true },
  fo: { label: "FIRST OFFICER", rate: 1.05, showText: false, timeout: 22000, multiplier: 1.5, retry: true },
  captain: { label: "CAPTAIN", rate: 1.16, showText: false, timeout: 15000, multiplier: 2, retry: false },
};

const state = {
  flight: null,
  steps: [],
  stepIndex: -1,
  awaiting: false,
  attempts: 0,
  spokeAt: 0,
  responseTimer: null,
  nextTimer: null,
  results: [],
  score: 0,
  streak: 0,
  stats: { xp: 0, flights: 0, bestStreak: 0 },
  player: null,
  saidAgain: false,
};

// ------------------------------------------------------------
// Persistence
// ------------------------------------------------------------
function loadStats() {
  try {
    const raw = localStorage.getItem("atc-sim-stats");
    if (raw) state.stats = { ...state.stats, ...JSON.parse(raw) };
  } catch (e) { /* fresh start */ }
}
function saveStats() {
  try { localStorage.setItem("atc-sim-stats", JSON.stringify(state.stats)); } catch (e) { /* ignore */ }
}
function rankFor(xp) {
  let current = RANKS[0];
  for (const r of RANKS) if (xp >= r.xp) current = r;
  return current;
}
function updateStatsUi() {
  els.statScore.textContent = state.score;
  els.statStreak.textContent = state.streak;
  els.statXp.textContent = state.stats.xp;
  els.statRank.textContent = rankFor(state.stats.xp).title;
}

// ------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------
function log(who, text, cls = "") {
  const li = document.createElement("li");
  li.className = `log-entry ${cls}`;
  li.innerHTML = `<span class="log-who">${who}</span><span class="log-text"></span>`;
  li.querySelector(".log-text").textContent = text;
  els.log.prepend(li);
  while (els.log.children.length > 40) els.log.lastChild.remove();
}

function setFrequency(freq) {
  els.freqName.textContent = freq.name.toUpperCase();
  els.freqMhz.textContent = freq.mhz;
}

function setPhase(phase) {
  els.phaseLabel.textContent = phase;
  for (const li of els.checklist.children) {
    li.classList.toggle("active", li.dataset.phase === phase);
    if (li.dataset.done === "1") li.classList.add("done");
  }
}

function markPhaseDone(phase) {
  for (const li of els.checklist.children) {
    if (li.dataset.phase === phase) li.dataset.done = "1";
  }
}

function renderChecklist(phases) {
  els.checklist.innerHTML = "";
  for (const p of phases) {
    const li = document.createElement("li");
    li.dataset.phase = p;
    li.textContent = p;
    els.checklist.appendChild(li);
  }
}

function renderStrip(f) {
  els.strip.innerHTML = `
    <div class="strip-row strip-head"><span>${f.tag}</span><span>${f.type}</span></div>
    <div class="strip-row"><span class="strip-label">FLIGHT</span><span>${f.radio}</span></div>
    <div class="strip-row"><span class="strip-label">ROUTE</span><span>${f.route}</span></div>
    <div class="strip-row"><span class="strip-label">${f.scenario === "departure" ? "SID" : "STAR"}</span><span>${f.procedure}</span></div>
    <div class="strip-row"><span class="strip-label">RWY</span><span>${f.runway}</span></div>
    <div class="strip-row"><span class="strip-label">SQUAWK</span><span>${f.squawk}</span></div>
    <div class="strip-row"><span class="strip-label">ALT</span><span>${f.scenario === "departure" ? "5000 / FL" + f.cruise / 100 : "ILS " + f.runway}</span></div>
  `;
}

function difficulty() {
  return DIFFICULTY[els.setDifficulty.value] || DIFFICULTY.rookie;
}

// ------------------------------------------------------------
// Flight generation
// ------------------------------------------------------------
function makeCallsign() {
  const al = rand(AIRLINES);
  const num = randInt(100, 999);
  return {
    tag: `${al.icao}${num}`,
    radio: `${al.radio} ${num}`,
    type: rand(al.types),
  };
}

function baseFlight(scenario) {
  const flowKey = rand(["east", "west"]);
  const flow = FLOWS[flowKey];
  const cs = makeCallsign();
  return {
    scenario, flowKey, flow, ...cs,
    atis: rand(Object.keys(PHONETIC)),
    windDir: randInt(flow.windDir[0], flow.windDir[1]),
    windKt: randInt(4, 18),
    altimeter: (29.2 + Math.random() * 1.1).toFixed(2),
    squawk: `${randInt(1, 7)}${randInt(0, 7)}${randInt(0, 7)}${randInt(0, 7)}`,
  };
}

function el(label, patterns, weight = 1) {
  return { label, patterns, weight };
}

function callsignEl(f) {
  const lastWord = f.radio.split(" ").slice(0, -1).pop();
  const num = f.radio.split(" ").pop();
  return el(`callsign "${f.radio}"`, [f.radio, `${lastWord} ${num}`, num]);
}

// ---------------- DEPARTURE SCENARIO ----------------
function buildDeparture() {
  const f = baseFlight("departure");
  const dest = rand(DESTINATIONS);
  const sid = SIDS.find((s) => s.name === dest.fix) || rand(SIDS);
  const cruise = randInt(28, 39) * 1000;
  const taxi = rand(TAXI_ROUTES[f.flowKey]);
  const dep = f.flow.dep, arr = f.flow.arr;
  const towerFreq = FREQS.towerNorth; // north runway handles departures in both flows
  const climbHdg = (f.flow.depHeading + rand([-1, 1]) * randInt(20, 70) + 360) % 360;
  const turnDir = angleSide(f.flow.depHeading, climbHdg);

  Object.assign(f, {
    route: `CYVR → ${dest.name.toUpperCase()}`,
    procedure: `${sid.name}${sid.number}`,
    runway: dep,
    cruise,
  });

  const steps = [];

  steps.push({
    phase: "CLEARANCE", freq: FREQS.clearance,
    atc: `${f.radio}, Vancouver Clearance, good day. Cleared to ${dest.name} via the ${sid.spoken} departure, flight planned route. Maintain ${sayAltitude(5000)}, expect ${sayAltitude(cruise)} one zero minutes after departure. Departure frequency ${sayFreq(FREQS.departure.mhz)}, squawk ${sayDigits(f.squawk)}.`,
    elements: [
      callsignEl(f),
      el(`the ${sid.spoken} departure`, [sid.name, `${sid.name} ${sid.number}`]),
      el("maintain 5000", altitudePatterns(5000)),
      el(`departure frequency ${FREQS.departure.mhz}`, freqPatterns(FREQS.departure.mhz)),
      el(`squawk ${f.squawk}`, [f.squawk, `squawk ${f.squawk}`]),
    ],
    example: `Cleared to ${dest.name} via the ${sid.spoken}, maintain five thousand, expect ${sayAltitude(cruise)}, departure ${sayFreq(FREQS.departure.mhz)}, squawk ${sayDigits(f.squawk)}, ${f.radio}.`,
    ack: "Readback correct.",
  });

  steps.push({
    phase: "CLEARANCE", freq: FREQS.clearance,
    atc: `${f.radio}, contact ground ${sayFreq(FREQS.ground.mhz)} when ready for pushback.`,
    elements: [callsignEl(f), el(`ground ${FREQS.ground.mhz}`, freqPatterns(FREQS.ground.mhz))],
    example: `Ground ${sayFreq(FREQS.ground.mhz)} when ready, ${f.radio}.`,
  });

  steps.push({
    phase: "GROUND", freq: FREQS.ground, checkIn: true,
    atc: `${f.radio}, Vancouver Ground, pushback approved, tail ${f.flowKey === "east" ? "west" : "east"}, advise ready to taxi.`,
    elements: [callsignEl(f), el("pushback approved", ["pushback approved", "push back approved", "pushback", "push back"])],
    example: `Pushback approved, tail ${f.flowKey === "east" ? "west" : "east"}, will advise, ${f.radio}.`,
    delayAfter: 7000,
  });

  steps.push({
    phase: "GROUND", freq: FREQS.ground,
    atc: `${f.radio}, runway ${sayRunway(dep)}, taxi via ${taxi.join(", ")}, hold short of runway ${sayRunway(arr)}.`,
    elements: [
      callsignEl(f),
      el(`runway ${dep}`, runwayPatterns(dep)),
      ...taxi.map((t) => el(`via ${t}`, [t])),
      el("hold short", ["hold short", "holding short"]),
      el(`…of runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Runway ${sayRunway(dep)} via ${taxi.join(", ")}, hold short runway ${sayRunway(arr)}, ${f.radio}.`,
    onCorrect: (p) => { taxiToRunway(p, f); },
    delayAfter: 12000,
  });

  steps.push({
    phase: "GROUND", freq: FREQS.ground,
    atc: `${f.radio}, cross runway ${sayRunway(arr)}, then contact tower ${sayFreq(towerFreq.mhz)}.`,
    elements: [
      callsignEl(f),
      el("cross", ["cross", "crossing"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
      el(`tower ${towerFreq.mhz}`, freqPatterns(towerFreq.mhz)),
    ],
    example: `Cross runway ${sayRunway(arr)}, tower ${sayFreq(towerFreq.mhz)}, ${f.radio}.`,
    delayAfter: 8000,
  });

  if (Math.random() < 0.5) {
    steps.push({
      phase: "TOWER", freq: towerFreq, checkIn: true,
      atc: `${f.radio}, Vancouver Tower, runway ${sayRunway(dep)}, line up and wait. Traffic is a ${rand(["Dash 8", "737", "A320", "Cessna Caravan"])} on a three mile final for the parallel.`,
      elements: [
        callsignEl(f),
        el("line up and wait", ["line up and wait", "line up wait", "lineup and wait", "line up"]),
        el(`runway ${dep}`, runwayPatterns(dep)),
      ],
      example: `Line up and wait runway ${sayRunway(dep)}, ${f.radio}.`,
      onCorrect: (p) => { lineUp(p, f); },
      delayAfter: 9000,
    });
  }

  steps.push({
    phase: "TOWER", freq: towerFreq,
    atc: `${f.radio}, ${sayWind(f.windDir, f.windKt)}, runway ${sayRunway(dep)}, cleared for takeoff.`,
    elements: [
      callsignEl(f),
      el("cleared for takeoff", ["cleared for takeoff", "cleared takeoff", "cleared for take off", "clear for takeoff"]),
      el(`runway ${dep}`, runwayPatterns(dep)),
    ],
    example: `Cleared for takeoff runway ${sayRunway(dep)}, ${f.radio}.`,
    onCorrect: (p) => { takeoff(p, f); },
    delayAfter: 16000,
  });

  steps.push({
    phase: "TOWER", freq: towerFreq,
    atc: `${f.radio}, airborne, contact departure ${sayFreq(FREQS.departure.mhz)}, good day.`,
    elements: [callsignEl(f), el(`departure ${FREQS.departure.mhz}`, freqPatterns(FREQS.departure.mhz))],
    example: `Departure ${sayFreq(FREQS.departure.mhz)}, ${f.radio}, good day.`,
    delayAfter: 5000,
  });

  steps.push({
    phase: "DEPARTURE", freq: FREQS.departure, checkIn: true,
    atc: `${f.radio}, Vancouver Departure, radar identified. Turn ${turnDir} heading ${sayHeading(climbHdg)}, climb ${sayAltitude(8000)}.`,
    elements: [
      callsignEl(f),
      el(`${turnDir} heading ${String(climbHdg).padStart(3, "0")}`, [String(climbHdg).padStart(3, "0"), String(climbHdg)]),
      el("climb 8000", altitudePatterns(8000)),
    ],
    example: `${cap(turnDir)} heading ${sayHeading(climbHdg)}, climb ${sayAltitude(8000)}, ${f.radio}.`,
    onCorrect: (p) => { p.targetHdg = climbHdg; p.turnDir = turnDir; p.targetAlt = 8000; },
    delayAfter: 14000,
  });

  if (Math.random() < 0.55) {
    steps.push(trafficAdvisoryStep(f, "DEPARTURE", FREQS.departure));
  }

  steps.push({
    phase: "DEPARTURE", freq: FREQS.departure,
    atc: `${f.radio}, climb ${sayAltitude(cruise > 23000 ? 23000 : cruise)}, proceed direct ${dest.fix}.`,
    elements: [
      callsignEl(f),
      el(`climb ${cruise > 23000 ? "FL230" : "FL" + cruise / 100}`, altitudePatterns(cruise > 23000 ? 23000 : cruise)),
      el(`direct ${dest.fix}`, [dest.fix, `direct ${dest.fix}`]),
    ],
    example: `Climb ${sayAltitude(cruise > 23000 ? 23000 : cruise)}, direct ${dest.fix}, ${f.radio}.`,
    onCorrect: (p) => { p.targetAlt = Math.min(cruise, 23000); },
    delayAfter: 12000,
  });

  steps.push({
    phase: "ENROUTE", freq: FREQS.departure,
    atc: `${f.radio}, contact Vancouver Centre ${sayFreq(FREQS.centre.mhz)}, good day.`,
    elements: [callsignEl(f), el(`centre ${FREQS.centre.mhz}`, freqPatterns(FREQS.centre.mhz))],
    example: `Centre ${sayFreq(FREQS.centre.mhz)}, ${f.radio}, good day.`,
  });

  f.phases = ["CLEARANCE", "GROUND", "TOWER", "DEPARTURE", "ENROUTE"];
  return { flight: f, steps };
}

// ---------------- ARRIVAL SCENARIO ----------------
function buildArrival() {
  const f = baseFlight("arrival");
  const origin = rand(ORIGINS);
  const arr = f.flow.arr;
  const towerFreq = FREQS.towerSouth;
  const baseHdg = (f.flow.arrHeading + rand([-1, 1]) * randInt(30, 60) + 360) % 360;
  const intHdg = interceptHeading(f.flow.arrHeading, baseHdg);
  const exitTwy = rand(f.flowKey === "east" ? ["Golf", "Juliett", "Mike"] : ["Alpha", "Golf", "Kilo"]);
  const gateTaxi = rand(TAXI_ROUTES[f.flowKey]);
  const goAround = Math.random() < 0.18;

  Object.assign(f, {
    route: `${origin.toUpperCase()} → CYVR`,
    procedure: `ILS ${arr}`,
    runway: arr,
    cruise: 0,
  });

  const steps = [];

  steps.push({
    phase: "ARRIVAL", freq: FREQS.arrival, checkIn: true,
    atc: `${f.radio}, Vancouver Arrival, good day. Information ${PHONETIC[f.atis]} is current, expect ILS runway ${sayRunway(arr)}. Descend ${sayAltitude(6000)}, ${sayAltimeter(f.altimeter)}.`,
    elements: [
      callsignEl(f),
      el(`ILS runway ${arr}`, runwayPatterns(arr)),
      el("descend 6000", altitudePatterns(6000)),
      el(`altimeter ${f.altimeter}`, [f.altimeter.replace(".", ""), f.altimeter]),
    ],
    example: `Information ${PHONETIC[f.atis]}, expect ILS ${sayRunway(arr)}, descend ${sayAltitude(6000)}, ${sayAltimeter(f.altimeter)}, ${f.radio}.`,
    onCorrect: (p) => { p.targetAlt = 6000; },
    delayAfter: 12000,
  });

  steps.push({
    phase: "ARRIVAL", freq: FREQS.arrival,
    atc: `${f.radio}, descend ${sayAltitude(4000)}, reduce speed two one zero knots.`,
    elements: [
      callsignEl(f),
      el("descend 4000", altitudePatterns(4000)),
      el("speed 210", ["210"]),
    ],
    example: `Descend ${sayAltitude(4000)}, speed two one zero, ${f.radio}.`,
    onCorrect: (p) => { p.targetAlt = 4000; p.targetGs = 210; },
    delayAfter: 12000,
  });

  if (Math.random() < 0.55) {
    steps.push(trafficAdvisoryStep(f, "ARRIVAL", FREQS.arrival));
  }

  steps.push({
    phase: "APPROACH", freq: FREQS.arrival,
    atc: `${f.radio}, turn ${angleSide(f.flow.arrHeading + 180, baseHdg)} heading ${sayHeading(baseHdg)}, vectors for the ILS runway ${sayRunway(arr)}.`,
    elements: [
      callsignEl(f),
      el(`heading ${String(baseHdg).padStart(3, "0")}`, [String(baseHdg).padStart(3, "0"), String(baseHdg)]),
    ],
    example: `Heading ${sayHeading(baseHdg)}, vectors ILS ${sayRunway(arr)}, ${f.radio}.`,
    onCorrect: (p) => { p.targetHdg = baseHdg; },
    delayAfter: 11000,
  });

  steps.push({
    phase: "APPROACH", freq: FREQS.arrival,
    atc: `${f.radio}, ${sayDigits(String(randInt(4, 8)))} miles from the marker. Turn ${angleSide(baseHdg, intHdg)} heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS runway ${sayRunway(arr)} approach.`,
    elements: [
      callsignEl(f),
      el(`heading ${String(intHdg).padStart(3, "0")}`, [String(intHdg).padStart(3, "0"), String(intHdg)]),
      el("maintain 3000 until established", altitudePatterns(3000)),
      el("cleared ILS", ["cleared ils", "clear ils", "cleared for the ils", "cleared ils approach"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS ${sayRunway(arr)}, ${f.radio}.`,
    onCorrect: (p) => { p.targetHdg = intHdg; p.targetAlt = 3000; p.targetGs = 170; setTimeout(() => { p.ils = true; }, 4000); },
    delayAfter: 13000,
  });

  steps.push({
    phase: "APPROACH", freq: FREQS.arrival,
    atc: `${f.radio}, contact tower ${sayFreq(towerFreq.mhz)}.`,
    elements: [callsignEl(f), el(`tower ${towerFreq.mhz}`, freqPatterns(towerFreq.mhz))],
    example: `Tower ${sayFreq(towerFreq.mhz)}, ${f.radio}.`,
    delayAfter: 6000,
  });

  steps.push({
    phase: "TOWER", freq: towerFreq, checkIn: true,
    atc: `${f.radio}, Vancouver Tower, ${sayWind(f.windDir, f.windKt)}, runway ${sayRunway(arr)}, cleared to land.`,
    elements: [
      callsignEl(f),
      el("cleared to land", ["cleared to land", "clear to land", "cleared land"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Cleared to land runway ${sayRunway(arr)}, ${f.radio}.`,
    onCorrect: (p) => { p.targetGs = 145; },
    delayAfter: goAround ? 9000 : 20000,
  });

  if (goAround) {
    steps.push({
      phase: "TOWER", freq: towerFreq,
      atc: `${f.radio}, go around, I say again, go around. Traffic on the runway. Fly runway heading, climb ${sayAltitude(3000)}.`,
      elements: [
        callsignEl(f),
        el("going around", ["go around", "going around", "go round", "going round"]),
        el("runway heading", ["runway heading"]),
        el("climb 3000", altitudePatterns(3000)),
      ],
      example: `Going around, runway heading, climb ${sayAltitude(3000)}, ${f.radio}.`,
      onCorrect: (p) => { p.ils = false; p.targetAlt = 3000; p.targetGs = 190; p.targetHdg = f.flow.arrHeading; p.climbRate = 2400; },
      delayAfter: 9000,
    });
    steps.push({
      phase: "TOWER", freq: towerFreq,
      atc: `${f.radio}, contact arrival ${sayFreq(FREQS.arrival.mhz)} for re-sequencing.`,
      elements: [callsignEl(f), el(`arrival ${FREQS.arrival.mhz}`, freqPatterns(FREQS.arrival.mhz))],
      example: `Arrival ${sayFreq(FREQS.arrival.mhz)}, ${f.radio}.`,
      delayAfter: 7000,
    });
    steps.push({
      phase: "APPROACH", freq: FREQS.arrival, checkIn: true,
      atc: `${f.radio}, Vancouver Arrival, radar identified. Turn ${angleSide(f.flow.arrHeading, baseHdg)} heading ${sayHeading(baseHdg)}, vectors back for the ILS runway ${sayRunway(arr)}.`,
      elements: [
        callsignEl(f),
        el(`heading ${String(baseHdg).padStart(3, "0")}`, [String(baseHdg).padStart(3, "0"), String(baseHdg)]),
      ],
      example: `Heading ${sayHeading(baseHdg)}, ${f.radio}.`,
      onCorrect: (p) => { p.targetHdg = baseHdg; },
      delayAfter: 14000,
    });
    steps.push({
      phase: "APPROACH", freq: FREQS.arrival,
      atc: `${f.radio}, turn ${angleSide(baseHdg, intHdg)} heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS runway ${sayRunway(arr)} approach.`,
      elements: [
        callsignEl(f),
        el(`heading ${String(intHdg).padStart(3, "0")}`, [String(intHdg).padStart(3, "0"), String(intHdg)]),
        el("maintain 3000 until established", altitudePatterns(3000)),
        el("cleared ILS", ["cleared ils", "clear ils", "cleared for the ils"]),
      ],
      example: `Heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS ${sayRunway(arr)}, ${f.radio}.`,
      onCorrect: (p) => { p.targetHdg = intHdg; p.targetAlt = 3000; p.targetGs = 170; setTimeout(() => { p.ils = true; }, 4000); },
      delayAfter: 13000,
    });
    steps.push({
      phase: "TOWER", freq: towerFreq,
      atc: `${f.radio}, tower again, ${sayWind(f.windDir, f.windKt)}, runway ${sayRunway(arr)}, cleared to land.`,
      elements: [
        callsignEl(f),
        el("cleared to land", ["cleared to land", "clear to land", "cleared land"]),
        el(`runway ${arr}`, runwayPatterns(arr)),
      ],
      example: `Cleared to land runway ${sayRunway(arr)}, ${f.radio}.`,
      onCorrect: (p) => { p.targetGs = 145; },
      delayAfter: 20000,
    });
  }

  steps.push({
    phase: "GROUND", freq: towerFreq,
    atc: `${f.radio}, welcome to Vancouver. Exit ${f.flowKey === "east" ? "left" : "right"} at ${exitTwy}, contact ground ${sayFreq(FREQS.ground.mhz)}.`,
    elements: [
      callsignEl(f),
      el(`exit at ${exitTwy}`, [exitTwy]),
      el(`ground ${FREQS.ground.mhz}`, freqPatterns(FREQS.ground.mhz)),
    ],
    example: `${exitTwy}, ground ${sayFreq(FREQS.ground.mhz)}, ${f.radio}.`,
    onCorrect: (p) => { rolloutToGate(p, f); },
    delayAfter: 8000,
  });

  steps.push({
    phase: "GATE", freq: FREQS.ground, checkIn: true,
    atc: `${f.radio}, Vancouver Ground, taxi to the gate via ${gateTaxi.join(", ")}.`,
    elements: [callsignEl(f), ...gateTaxi.map((t) => el(`via ${t}`, [t]))],
    example: `Gate via ${gateTaxi.join(", ")}, ${f.radio}.`,
  });

  f.phases = ["ARRIVAL", "APPROACH", "TOWER", "GROUND", "GATE"];
  return { flight: f, steps };
}

function trafficAdvisoryStep(f, phase, freq) {
  const clock = randInt(1, 12);
  const type = rand(["Dash 8", "737", "A320", "Twin Otter", "King Air", "Cessna Caravan"]);
  return {
    phase, freq,
    atc: `${f.radio}, traffic ${sayDigits(String(clock))} o'clock, ${sayDigits(String(randInt(3, 8)))} miles, ${rand(["northbound", "southbound", "eastbound", "westbound"])} ${type}, ${rand(["same altitude", "1000 feet below", "1000 feet above"])}. Report traffic in sight.`,
    elements: [
      callsignEl(f),
      el("looking / traffic in sight", ["looking", "in sight", "negative contact", "searching", "looking for traffic", "traffic in sight", "looking out"]),
    ],
    example: `Looking for traffic, ${f.radio}.`,
    delayAfter: 8000,
  };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function angleSide(from, to) {
  const d = ((to - from + 540) % 360) - 180;
  return d >= 0 ? "right" : "left";
}

function interceptHeading(finalHdg, baseHdg) {
  const side = angleSide(finalHdg, baseHdg);
  const offset = side === "right" ? -30 : 30;
  return (finalHdg + offset + 360) % 360;
}

// ------------------------------------------------------------
// Player aircraft choreography
// ------------------------------------------------------------
function spawnPlayer(f) {
  if (state.player) state.player.dead = true;
  if (f.scenario === "departure") {
    state.player = Radar.spawn({
      player: true, callsign: f.tag, kind: "player",
      x: -0.4, y: 0, gs: 0, alt: 0, hdg: f.flow.depHeading,
    });
  } else {
    const back = Radar.headingVector((f.flow.arrHeading + 180) % 360);
    const perp = Radar.headingVector((f.flow.arrHeading + 90) % 360);
    const side = rand([-1, 1]);
    state.player = Radar.spawn({
      player: true, callsign: f.tag, kind: "player", onGround: false,
      x: back.x * 21 + perp.x * 5 * side,
      y: back.y * 21 + perp.y * 5 * side,
      gs: 250, alt: 7000,
      hdg: (f.flow.arrHeading - 12 * side + 360) % 360,
      arrFlow: f.flowKey,
    });
  }
  state.player.arrFlow = f.flowKey;
}

function depThreshold(f) {
  const r = Radar.RUNWAYS.north;
  return f.flowKey === "east" ? { x: r.x1, y: r.y1 } : { x: r.x2, y: r.y2 };
}

function taxiToRunway(p, f) {
  const t = depThreshold(f);
  const back = Radar.headingVector((f.flow.depHeading + 180) % 360);
  p.waypoint = { x: t.x - back.x * 0.15, y: t.y - back.y * 0.15 - 0.1 };
  p.targetGs = 14;
  p.accel = 4;
}

function lineUp(p, f) {
  const t = depThreshold(f);
  p.waypoint = { x: t.x, y: t.y };
  p.targetGs = 12;
  p.hdg = f.flow.depHeading;
}

function takeoff(p, f) {
  const t = depThreshold(f);
  p.waypoint = null;
  p.x = t.x; p.y = t.y;
  p.hdg = f.flow.depHeading;
  p.accel = 9;
  p.targetGs = 250;
  p.onGround = false;
  setTimeout(() => {
    if (!p.dead) {
      p.targetAlt = Math.max(p.targetAlt || 0, 5000);
      p.climbRate = 2600;
    }
  }, 9000);
}

function rolloutToGate(p, f) {
  p.ils = false;
  p.targetGs = 12;
  p.accel = 20;
  p.waypoint = { x: -0.4, y: 0 };
}

// ------------------------------------------------------------
// Step engine
// ------------------------------------------------------------
function currentStep() {
  return state.steps[state.stepIndex] || null;
}

function clearTimers() {
  clearTimeout(state.responseTimer);
  clearTimeout(state.nextTimer);
}

function startFlight() {
  clearTimers();
  Radio.stopAll();
  els.summaryOverlay.classList.remove("visible");
  els.startOverlay.classList.remove("visible");
  els.log.innerHTML = "";
  els.feedback.innerHTML = "";
  els.readback.value = "";
  state.score = 0;
  state.streak = 0;
  state.results = [];

  const scenario = els.setScenario.value === "random"
    ? rand(["departure", "arrival"])
    : els.setScenario.value;
  const built = scenario === "departure" ? buildDeparture() : buildArrival();
  state.flight = built.flight;
  state.steps = built.steps;
  state.stepIndex = -1;

  const f = state.flight;
  Radar.setFlow(f.flow);
  spawnPlayer(f);

  renderStrip(f);
  renderChecklist(f.phases);
  els.ovrAtis.textContent = `INFO ${f.atis}`;
  els.ovrWind.textContent = `${String(f.windDir).padStart(3, "0")}° / ${f.windKt}KT`;
  els.ovrFlow.textContent = f.flow.label;
  updateStatsUi();

  const atisText = `Vancouver International information ${PHONETIC[f.atis]}. ${sayWind(f.windDir, f.windKt)}. ${sayAltimeter(f.altimeter)}. Landing runway ${sayRunway(f.flow.arr)}, departing runway ${sayRunway(f.flow.dep)}. Inform ATC you have information ${PHONETIC[f.atis]}.`;
  log("ATIS", atisText, "log-atis");
  log("SYS", `${f.scenario === "departure" ? "Departure" : "Arrival"} flight ${f.tag} (${f.type}) — ${f.route}`, "log-sys");

  Radio.settings.rate = difficulty().rate;
  Radio.transmit(atisText, { rate: 1.06, volume: 0.55, pitch: 0.92 });

  nextStep(1500);
}

function nextStep(extraDelay = 0) {
  clearTimers();
  state.nextTimer = setTimeout(() => {
    const prev = currentStep();
    if (prev) markPhaseDone(prev.phase);
    state.stepIndex++;
    const step = currentStep();
    if (!step) {
      finishFlight();
      return;
    }
    runStep(step);
  }, extraDelay);
}

function runStep(step) {
  state.awaiting = false;
  state.attempts = 0;
  state.saidAgain = false;
  els.readback.value = "";
  els.feedback.innerHTML = "";
  setFrequency(step.freq);
  setPhase(step.phase);
  speakStep(step, step.checkIn ? checkInPreamble(step) : null);
}

function checkInPreamble(step) {
  // The pilot calls up on a new frequency first — shown in log for realism
  const f = state.flight;
  const parts = {
    GROUND: `Vancouver Ground, ${f.radio} with information ${PHONETIC[f.atis]}.`,
    TOWER: `Vancouver Tower, ${f.radio}.`,
    ARRIVAL: `Vancouver Arrival, ${f.radio}, with information ${PHONETIC[f.atis]}.`,
    APPROACH: `Vancouver Arrival, ${f.radio}.`,
    DEPARTURE: `Vancouver Departure, ${f.radio}, passing two thousand for five thousand.`,
    GATE: `Vancouver Ground, ${f.radio}, clear of the runway.`,
  };
  return parts[step.phase] || null;
}

function speakStep(step, preamble) {
  const diff = difficulty();
  els.atcDisplay.textContent = diff.showText ? step.atc : "— INCOMING TRANSMISSION — LISTEN —";
  els.atcDisplay.classList.add("speaking");

  if (preamble) log("YOU", preamble, "log-you log-dim");

  Radio.transmit(step.atc, {
    onend: () => {
      els.atcDisplay.classList.remove("speaking");
      state.awaiting = true;
      state.spokeAt = performance.now();
      armResponseTimer();
    },
  });
  log("ATC", step.atc, "log-atc");
}

function armResponseTimer() {
  clearTimeout(state.responseTimer);
  const diff = difficulty();
  state.responseTimer = setTimeout(() => {
    const step = currentStep();
    if (!step || !state.awaiting) return;
    if (!state.saidAgain) {
      state.saidAgain = true;
      const nudge = `${state.flight.radio}, how do you read?`;
      log("ATC", nudge, "log-atc");
      Radio.transmit(nudge, { onend: () => armResponseTimer() });
    } else {
      // no response at all — zero the step and move on
      state.awaiting = false;
      recordResult(step, "(no response)", { score: 0, missed: step.elements.map((e) => e.label), hit: [] });
      state.streak = 0;
      updateStatsUi();
      els.feedback.innerHTML = feedbackHtml(0, step, step.elements.map((e) => e.label), "(no response)");
      nextStep(step.delayAfter ?? 4000);
    }
  }, diff.timeout);
}

function submitReadback() {
  const step = currentStep();
  if (!step || !state.awaiting) return;
  const typed = els.readback.value.trim();
  if (!typed) return;

  clearTimeout(state.responseTimer);
  const diff = difficulty();
  const grade = gradeReadback(typed, step.elements);
  const responseSec = (performance.now() - state.spokeAt) / 1000;
  log("YOU", typed, "log-you");

  if (!grade.ok && state.attempts === 0 && diff.retry) {
    // one corrected retry
    state.attempts = 1;
    els.feedback.innerHTML = feedbackHtml(grade.score, step, grade.missed, typed, true);
    const correction = `${state.flight.radio}, negative. I say again: ${step.atc}`;
    els.readback.value = "";
    state.awaiting = false;
    log("ATC", correction, "log-atc");
    els.atcDisplay.classList.add("speaking");
    Radio.transmit(correction, {
      onend: () => {
        els.atcDisplay.classList.remove("speaking");
        state.awaiting = true;
        state.spokeAt = performance.now();
        armResponseTimer();
      },
    });
    return;
  }

  state.awaiting = false;
  finalizeStep(step, typed, grade, responseSec);
}

function finalizeStep(step, typed, grade, responseSec) {
  const diff = difficulty();
  let points = 0;
  if (grade.ok) {
    points = 10;
    if (state.attempts === 0) {
      if (responseSec <= 6) points += 3;
      else if (responseSec <= 12) points += 1;
    } else {
      points = 6;
    }
    state.streak++;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.streak);
  } else {
    points = Math.round(grade.score / 12);
    state.streak = 0;
  }
  points = Math.round(points * diff.multiplier);
  state.score += points;
  state.stats.xp += points;
  saveStats();
  updateStatsUi();

  recordResult(step, typed, grade, points);
  els.feedback.innerHTML = feedbackHtml(grade.score, step, grade.missed, typed);

  if (grade.ok) {
    if (step.onCorrect && state.player) step.onCorrect(state.player);
    if (step.ack) {
      log("ATC", `${state.flight.radio}, ${step.ack.toLowerCase()}`, "log-atc log-dim");
      Radio.transmit(`${state.flight.radio}, ${step.ack}`);
    }
  } else {
    // ATC moves things along anyway; the aircraft still complies
    if (step.onCorrect && state.player) step.onCorrect(state.player);
  }
  nextStep(step.delayAfter ?? 4500);
}

function recordResult(step, typed, grade, points = 0) {
  state.results.push({
    phase: step.phase,
    atc: step.atc,
    readback: typed,
    score: grade.score,
    points,
    missed: grade.missed,
  });
}

function feedbackHtml(score, step, missed, typed, isRetry = false) {
  const cls = score >= 80 ? "good" : score >= 55 ? "partial" : "bad";
  const verdict = isRetry
    ? "NEGATIVE — LISTEN FOR THE CORRECTION"
    : score >= 80 ? "READBACK CORRECT" : score >= 55 ? "PARTIAL READBACK" : "READBACK INCORRECT";
  return `
    <div class="feedback-verdict ${cls}">${verdict} — ${score}%</div>
    ${missed.length ? `<div class="feedback-missed">Missed: ${missed.join(" • ")}</div>` : ""}
    <div class="feedback-example">Ideal: “${step.example}”</div>
  `;
}

function finishFlight() {
  clearTimers();
  state.stats.flights++;
  saveStats();
  updateStatsUi();
  const f = state.flight;
  const total = state.results.length;
  const avg = total ? Math.round(state.results.reduce((s, r) => s + r.score, 0) / total) : 0;
  const grade = avg >= 90 ? "A" : avg >= 80 ? "B" : avg >= 65 ? "C" : avg >= 50 ? "D" : "F";

  Radio.transmit(`${f.radio}, ${f.scenario === "departure" ? "have a good flight" : "welcome to Vancouver"}.`);
  log("SYS", `Flight complete — average readback ${avg}%`, "log-sys");

  const rows = state.results.map((r) => `
    <tr>
      <td>${r.phase}</td>
      <td class="sum-atc">${r.atc}</td>
      <td class="sum-you">${r.readback || "—"}</td>
      <td class="${r.score >= 80 ? "good" : r.score >= 55 ? "partial" : "bad"}">${r.score}%</td>
    </tr>`).join("");

  els.summaryBody.innerHTML = `
    <div class="summary-grade">
      <div class="grade-letter ${avg >= 80 ? "good" : avg >= 55 ? "partial" : "bad"}">${grade}</div>
      <div class="grade-meta">
        <div>${f.tag} • ${f.route}</div>
        <div>AVERAGE READBACK: <strong>${avg}%</strong></div>
        <div>FLIGHT SCORE: <strong>${state.score}</strong> &nbsp; TOTAL XP: <strong>${state.stats.xp}</strong></div>
        <div>RANK: <strong>${rankFor(state.stats.xp).title}</strong> &nbsp; BEST STREAK: <strong>${state.stats.bestStreak}</strong></div>
      </div>
    </div>
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead><tr><th>PHASE</th><th>ATC</th><th>YOUR READBACK</th><th>SCORE</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  els.summaryOverlay.classList.add("visible");
}

// ------------------------------------------------------------
// Ambient traffic chatter
// ------------------------------------------------------------
Radar.setAmbientHandler((type, cs) => {
  if (!els.setAmbient.checked) return;
  const f = state.flight;
  const arr = f ? f.flow.arr : "08R";
  const dep = f ? f.flow.dep : "08L";
  const text = type === "arrival"
    ? `${cs.radio}, established ILS runway ${sayRunway(arr)}.`
    : `${cs.radio}, runway ${sayRunway(dep)}, cleared for takeoff.`;
  log(type === "arrival" ? cs.tag : "TWR", text, "log-dim");
  if (!state.awaiting && !Radio.isSpeaking) {
    Radio.transmit(text, { volume: 0.35, pitch: type === "arrival" ? 1.12 : 0.9, rate: 1.1 });
  }
});

// ------------------------------------------------------------
// Push-to-talk & input wiring
// ------------------------------------------------------------
let pttHeld = false;

function setMicStatus(text, cls) {
  els.micStatus.textContent = text;
  els.micStatus.className = `mic-status ${cls || ""}`;
}

function wirePtt() {
  const hasRec = Radio.initRecognition({
    onstart: () => setMicStatus("TRANSMITTING — SPEAK", "active"),
    onresult: (transcript) => { els.readback.value = transcript; },
    onend: () => {
      setMicStatus("STANDBY", "ready");
      els.ptt.classList.remove("keyed");
      if (els.readback.value.trim() && state.awaiting) {
        setTimeout(() => submitReadback(), 350);
      }
    },
    onerror: (err) => {
      setMicStatus(`MIC ERROR: ${err} — type instead`, "error");
      els.ptt.classList.remove("keyed");
    },
  });

  if (!hasRec) {
    els.ptt.disabled = true;
    els.ptt.innerHTML = "MIC N/A — TYPE READBACK";
    setMicStatus("No speech recognition — type your readbacks", "error");
    return;
  }

  const down = (e) => {
    e.preventDefault();
    if (pttHeld) return;
    pttHeld = true;
    els.ptt.classList.add("keyed");
    els.readback.value = "";
    Radio.pttDown();
  };
  const up = (e) => {
    e.preventDefault();
    if (!pttHeld) return;
    pttHeld = false;
    Radio.pttUp();
  };

  els.ptt.addEventListener("mousedown", down);
  els.ptt.addEventListener("mouseup", up);
  els.ptt.addEventListener("mouseleave", (e) => { if (pttHeld) up(e); });
  els.ptt.addEventListener("touchstart", down, { passive: false });
  els.ptt.addEventListener("touchend", up);

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
    e.preventDefault();
    if (!e.repeat) down(e);
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
    e.preventDefault();
    up(e);
  });
}

// ------------------------------------------------------------
// Clock
// ------------------------------------------------------------
setInterval(() => {
  const now = new Date();
  const z = (n) => String(n).padStart(2, "0");
  els.ovrTime.textContent = `${z(now.getUTCHours())}${z(now.getUTCMinutes())}${z(now.getUTCSeconds())}Z`;
}, 1000);

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  updateStatsUi();
  Radar.start();
  wirePtt();

  // restore settings
  try {
    const saved = JSON.parse(localStorage.getItem("atc-sim-settings") || "{}");
    if (saved.difficulty) els.setDifficulty.value = saved.difficulty;
    if (saved.scenario) els.setScenario.value = saved.scenario;
    if (saved.ambient != null) els.setAmbient.checked = saved.ambient;
    if (saved.radiofx != null) els.setRadiofx.checked = saved.radiofx;
  } catch (e) { /* defaults */ }

  const persistSettings = () => {
    Radio.settings.radioFx = els.setRadiofx.checked;
    try {
      localStorage.setItem("atc-sim-settings", JSON.stringify({
        difficulty: els.setDifficulty.value,
        scenario: els.setScenario.value,
        ambient: els.setAmbient.checked,
        radiofx: els.setRadiofx.checked,
      }));
    } catch (e) { /* ignore */ }
  };
  for (const elm of [els.setDifficulty, els.setScenario, els.setAmbient, els.setRadiofx]) {
    elm.addEventListener("change", persistSettings);
  }
  persistSettings();

  els.startBtn.addEventListener("click", () => {
    Radio.ensureCtx();
    startFlight();
  });
  els.summaryNew.addEventListener("click", () => startFlight());
  els.submit.addEventListener("click", submitReadback);
  els.readback.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitReadback();
    }
  });
  els.clearBtn.addEventListener("click", () => { els.readback.value = ""; });
  els.repeatBtn.addEventListener("click", () => {
    const step = currentStep();
    if (!step) return;
    log("YOU", `${state.flight.radio}, say again.`, "log-you log-dim");
    Radio.transmit(step.atc);
  });

  setMicStatus("STANDBY", "ready");
});
