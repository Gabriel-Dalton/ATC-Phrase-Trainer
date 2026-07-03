import { AIRLINES, DESTINATIONS, FLOWS, FREQS, ORIGINS, PHONETIC, SIDS, TAXI_ROUTES, rand, randInt } from "./data";
import {
  altitudePatterns, freqPatterns, runwayPatterns,
  sayAltimeter, sayAltitude, sayDigits, sayFreq, sayHeading, sayRunway, sayWind,
} from "./phraseology";
import { RUNWAYS, headingVector, world } from "./world";
import type { Aircraft, BuiltFlight, CommStep, FlightPlan, Frequency, Phase, ReadbackElement, Scenario } from "./types";

// Procedural flight generation: builds a FlightPlan plus the ordered list
// of controller transmissions (CommSteps) the pilot will work through.

function el(label: string, patterns: string[], weight = 1): ReadbackElement {
  return { label, patterns, weight };
}

function callsignEl(radio: string): ReadbackElement {
  const parts = radio.split(" ");
  const num = parts[parts.length - 1];
  const lastWord = parts[parts.length - 2] ?? parts[0];
  return el(`callsign "${radio}"`, [radio, `${lastWord} ${num}`, num]);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function angleSide(from: number, to: number): "left" | "right" {
  const d = ((to - from + 540) % 360) - 180;
  return d >= 0 ? "right" : "left";
}

function interceptHeading(finalHdg: number, baseHdg: number): number {
  const side = angleSide(finalHdg, baseHdg);
  const offset = side === "right" ? -30 : 30;
  return (finalHdg + offset + 360) % 360;
}

function basePlan(scenario: Scenario): FlightPlan {
  const flow = FLOWS[rand(["east", "west"] as const)];
  const letter = rand(Object.keys(PHONETIC));
  return {
    scenario,
    flow,
    tag: "",
    radio: "",
    type: "",
    route: "",
    procedure: "",
    runway: "",
    squawk: `${randInt(1, 7)}${randInt(0, 7)}${randInt(0, 7)}${randInt(0, 7)}`,
    cruise: 0,
    atisLetter: letter,
    atisWord: PHONETIC[letter],
    windDir: randInt(flow.windDir[0], flow.windDir[1]),
    windKt: randInt(4, 18),
    altimeter: (29.2 + Math.random() * 1.1).toFixed(2),
    phases: [],
  };
}

function assignCallsign(plan: FlightPlan) {
  const al = rand(AIRLINES);
  const num = randInt(100, 999);
  plan.tag = `${al.icao}${num}`;
  plan.radio = `${al.radio} ${num}`;
  plan.type = rand(al.types);
}

function trafficAdvisoryStep(plan: FlightPlan, phase: Phase, freq: Frequency): CommStep {
  const clock = randInt(1, 12);
  const type = rand(["Dash 8", "737", "A320", "Twin Otter", "King Air", "Cessna Caravan"]);
  return {
    phase,
    freq,
    atc: `${plan.radio}, traffic ${sayDigits(String(clock))} o'clock, ${sayDigits(String(randInt(3, 8)))} miles, ${rand(["northbound", "southbound", "eastbound", "westbound"])} ${type}, ${rand(["same altitude", "1000 feet below", "1000 feet above"])}. Report traffic in sight.`,
    elements: [
      callsignEl(plan.radio),
      el("looking / traffic in sight", [
        "looking", "in sight", "negative contact", "searching",
        "looking for traffic", "traffic in sight", "looking out",
      ]),
    ],
    example: `Looking for traffic, ${plan.radio}.`,
    delayAfterMs: 8000,
  };
}

// ---------------- player choreography ----------------

function depThreshold(flowKey: "east" | "west") {
  const r = RUNWAYS.north;
  return flowKey === "east" ? { x: r.x1, y: r.y1 } : { x: r.x2, y: r.y2 };
}

function spawnDeparturePlayer(plan: FlightPlan): Aircraft {
  world.removePlayer();
  return world.spawn({
    player: true,
    kind: "player",
    callsign: plan.tag,
    x: -0.4, y: 0, gs: 0, alt: 0,
    hdg: plan.flow.depHeading,
    arrFlow: plan.flow.key,
  });
}

function spawnArrivalPlayer(plan: FlightPlan): Aircraft {
  world.removePlayer();
  const back = headingVector((plan.flow.arrHeading + 180) % 360);
  const perp = headingVector((plan.flow.arrHeading + 90) % 360);
  const side = rand([-1, 1]);
  return world.spawn({
    player: true,
    kind: "player",
    callsign: plan.tag,
    onGround: false,
    x: back.x * 21 + perp.x * 5 * side,
    y: back.y * 21 + perp.y * 5 * side,
    gs: 250,
    alt: 7000,
    hdg: (plan.flow.arrHeading - 12 * side + 360) % 360,
    arrFlow: plan.flow.key,
  });
}

// ---------------- departure scenario ----------------

export function buildDeparture(): BuiltFlight & { spawnPlayer: () => Aircraft } {
  const plan = basePlan("departure");
  assignCallsign(plan);
  const dest = rand(DESTINATIONS);
  const sid = SIDS.find((s) => s.name === dest.fix) ?? rand(SIDS);
  const cruise = randInt(28, 39) * 1000;
  const taxi = rand(TAXI_ROUTES[plan.flow.key]);
  const dep = plan.flow.dep;
  const arr = plan.flow.arr;
  const towerFreq = FREQS.towerNorth;
  const climbHdg = (plan.flow.depHeading + rand([-1, 1]) * randInt(20, 70) + 360) % 360;
  const turnDir = angleSide(plan.flow.depHeading, climbHdg);
  const initialClimb = Math.min(cruise, 23000);

  plan.route = `CYVR → ${dest.name.toUpperCase()}`;
  plan.procedure = `${sid.name}${sid.number}`;
  plan.runway = dep;
  plan.cruise = cruise;
  plan.phases = ["CLEARANCE", "GROUND", "TOWER", "DEPARTURE", "ENROUTE"];

  const steps: CommStep[] = [];

  steps.push({
    phase: "CLEARANCE",
    freq: FREQS.clearance,
    atc: `${plan.radio}, Vancouver Clearance, good day. Cleared to ${dest.name} via the ${sid.spoken} departure, flight planned route. Maintain ${sayAltitude(5000)}, expect ${sayAltitude(cruise)} one zero minutes after departure. Departure frequency ${sayFreq(FREQS.departure.mhz)}, squawk ${sayDigits(plan.squawk)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`the ${sid.spoken} departure`, [sid.name, `${sid.name} ${sid.number}`]),
      el("maintain 5000", altitudePatterns(5000)),
      el(`departure frequency ${FREQS.departure.mhz}`, freqPatterns(FREQS.departure.mhz)),
      el(`squawk ${plan.squawk}`, [plan.squawk, `squawk ${plan.squawk}`]),
    ],
    example: `Cleared to ${dest.name} via the ${sid.spoken}, maintain five thousand, expect ${sayAltitude(cruise)}, departure ${sayFreq(FREQS.departure.mhz)}, squawk ${sayDigits(plan.squawk)}, ${plan.radio}.`,
    ack: "Readback correct.",
  });

  steps.push({
    phase: "CLEARANCE",
    freq: FREQS.clearance,
    atc: `${plan.radio}, contact ground ${sayFreq(FREQS.ground.mhz)} when ready for pushback.`,
    elements: [callsignEl(plan.radio), el(`ground ${FREQS.ground.mhz}`, freqPatterns(FREQS.ground.mhz))],
    example: `Ground ${sayFreq(FREQS.ground.mhz)} when ready, ${plan.radio}.`,
  });

  steps.push({
    phase: "GROUND",
    freq: FREQS.ground,
    checkIn: `Vancouver Ground, ${plan.radio} with information ${plan.atisWord}.`,
    atc: `${plan.radio}, Vancouver Ground, pushback approved, tail ${plan.flow.key === "east" ? "west" : "east"}, advise ready to taxi.`,
    elements: [
      callsignEl(plan.radio),
      el("pushback approved", ["pushback approved", "push back approved", "pushback", "push back"]),
    ],
    example: `Pushback approved, will advise, ${plan.radio}.`,
    delayAfterMs: 7000,
  });

  steps.push({
    phase: "GROUND",
    freq: FREQS.ground,
    atc: `${plan.radio}, runway ${sayRunway(dep)}, taxi via ${taxi.join(", ")}, hold short of runway ${sayRunway(arr)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`runway ${dep}`, runwayPatterns(dep)),
      ...taxi.map((t) => el(`via ${t}`, [t])),
      el("hold short", ["hold short", "holding short"]),
      el(`…of runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Runway ${sayRunway(dep)} via ${taxi.join(", ")}, hold short runway ${sayRunway(arr)}, ${plan.radio}.`,
    onCorrect: (p) => {
      const t = depThreshold(plan.flow.key);
      const back = headingVector((plan.flow.depHeading + 180) % 360);
      p.waypoint = { x: t.x - back.x * 0.15, y: t.y - back.y * 0.15 - 0.1 };
      p.targetGs = 14;
      p.accel = 4;
    },
    delayAfterMs: 12000,
  });

  steps.push({
    phase: "GROUND",
    freq: FREQS.ground,
    atc: `${plan.radio}, cross runway ${sayRunway(arr)}, then contact tower ${sayFreq(towerFreq.mhz)}.`,
    elements: [
      callsignEl(plan.radio),
      el("cross", ["cross", "crossing"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
      el(`tower ${towerFreq.mhz}`, freqPatterns(towerFreq.mhz)),
    ],
    example: `Cross runway ${sayRunway(arr)}, tower ${sayFreq(towerFreq.mhz)}, ${plan.radio}.`,
    delayAfterMs: 8000,
  });

  if (Math.random() < 0.5) {
    steps.push({
      phase: "TOWER",
      freq: towerFreq,
      checkIn: `Vancouver Tower, ${plan.radio}.`,
      atc: `${plan.radio}, Vancouver Tower, runway ${sayRunway(dep)}, line up and wait. Traffic is a ${rand(["Dash 8", "737", "A320", "Cessna Caravan"])} on a three mile final for the parallel.`,
      elements: [
        callsignEl(plan.radio),
        el("line up and wait", ["line up and wait", "line up wait", "lineup and wait", "line up"]),
        el(`runway ${dep}`, runwayPatterns(dep)),
      ],
      example: `Line up and wait runway ${sayRunway(dep)}, ${plan.radio}.`,
      onCorrect: (p) => {
        const t = depThreshold(plan.flow.key);
        p.waypoint = { x: t.x, y: t.y };
        p.targetGs = 12;
        p.hdg = plan.flow.depHeading;
      },
      delayAfterMs: 9000,
    });
  }

  steps.push({
    phase: "TOWER",
    freq: towerFreq,
    atc: `${plan.radio}, ${sayWind(plan.windDir, plan.windKt)}, runway ${sayRunway(dep)}, cleared for takeoff.`,
    elements: [
      callsignEl(plan.radio),
      el("cleared for takeoff", ["cleared for takeoff", "cleared takeoff", "cleared for take off", "clear for takeoff"]),
      el(`runway ${dep}`, runwayPatterns(dep)),
    ],
    example: `Cleared for takeoff runway ${sayRunway(dep)}, ${plan.radio}.`,
    onCorrect: (p) => {
      const t = depThreshold(plan.flow.key);
      p.waypoint = null;
      p.x = t.x;
      p.y = t.y;
      p.hdg = plan.flow.depHeading;
      p.accel = 9;
      p.targetGs = 250;
      p.onGround = false;
      setTimeout(() => {
        if (!p.dead) {
          p.targetAlt = Math.max(p.targetAlt ?? 0, 5000);
          p.climbRate = 2600;
        }
      }, 9000);
    },
    delayAfterMs: 16000,
  });

  steps.push({
    phase: "TOWER",
    freq: towerFreq,
    atc: `${plan.radio}, airborne, contact departure ${sayFreq(FREQS.departure.mhz)}, good day.`,
    elements: [callsignEl(plan.radio), el(`departure ${FREQS.departure.mhz}`, freqPatterns(FREQS.departure.mhz))],
    example: `Departure ${sayFreq(FREQS.departure.mhz)}, ${plan.radio}, good day.`,
    delayAfterMs: 5000,
  });

  steps.push({
    phase: "DEPARTURE",
    freq: FREQS.departure,
    checkIn: `Vancouver Departure, ${plan.radio}, passing two thousand for five thousand.`,
    atc: `${plan.radio}, Vancouver Departure, radar identified. Turn ${turnDir} heading ${sayHeading(climbHdg)}, climb ${sayAltitude(8000)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`${turnDir} heading ${String(climbHdg).padStart(3, "0")}`, [String(climbHdg).padStart(3, "0"), String(climbHdg)]),
      el("climb 8000", altitudePatterns(8000)),
    ],
    example: `${cap(turnDir)} heading ${sayHeading(climbHdg)}, climb ${sayAltitude(8000)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetHdg = climbHdg;
      p.turnDir = turnDir;
      p.targetAlt = 8000;
    },
    delayAfterMs: 14000,
  });

  if (Math.random() < 0.55) {
    steps.push(trafficAdvisoryStep(plan, "DEPARTURE", FREQS.departure));
  }

  steps.push({
    phase: "DEPARTURE",
    freq: FREQS.departure,
    atc: `${plan.radio}, climb ${sayAltitude(initialClimb)}, proceed direct ${dest.fix}.`,
    elements: [
      callsignEl(plan.radio),
      el(`climb FL${initialClimb / 100}`, altitudePatterns(initialClimb)),
      el(`direct ${dest.fix}`, [dest.fix, `direct ${dest.fix}`]),
    ],
    example: `Climb ${sayAltitude(initialClimb)}, direct ${dest.fix}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetAlt = initialClimb;
    },
    delayAfterMs: 12000,
  });

  steps.push({
    phase: "ENROUTE",
    freq: FREQS.departure,
    atc: `${plan.radio}, contact Vancouver Centre ${sayFreq(FREQS.centre.mhz)}, good day.`,
    elements: [callsignEl(plan.radio), el(`centre ${FREQS.centre.mhz}`, freqPatterns(FREQS.centre.mhz))],
    example: `Centre ${sayFreq(FREQS.centre.mhz)}, ${plan.radio}, good day.`,
  });

  return { plan, steps, spawnPlayer: () => spawnDeparturePlayer(plan) };
}

// ---------------- arrival scenario ----------------

export function buildArrival(): BuiltFlight & { spawnPlayer: () => Aircraft } {
  const plan = basePlan("arrival");
  assignCallsign(plan);
  const origin = rand(ORIGINS);
  const arr = plan.flow.arr;
  const towerFreq = FREQS.towerSouth;
  const baseHdg = (plan.flow.arrHeading + rand([-1, 1]) * randInt(30, 60) + 360) % 360;
  const intHdg = interceptHeading(plan.flow.arrHeading, baseHdg);
  const exitTwy = rand(plan.flow.key === "east" ? ["Golf", "Juliett", "Mike"] : ["Alpha", "Golf", "Kilo"]);
  const gateTaxi = rand(TAXI_ROUTES[plan.flow.key]);
  const goAround = Math.random() < 0.18;

  plan.route = `${origin.toUpperCase()} → CYVR`;
  plan.procedure = `ILS ${arr}`;
  plan.runway = arr;
  plan.phases = ["ARRIVAL", "APPROACH", "TOWER", "GROUND", "GATE"];

  const steps: CommStep[] = [];

  const ilsClearanceStep = (again: boolean): CommStep => ({
    phase: "APPROACH",
    freq: FREQS.arrival,
    atc: `${plan.radio}, ${again ? "" : `${sayDigits(String(randInt(4, 8)))} miles from the marker. `}Turn ${angleSide(baseHdg, intHdg)} heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS runway ${sayRunway(arr)} approach.`,
    elements: [
      callsignEl(plan.radio),
      el(`heading ${String(intHdg).padStart(3, "0")}`, [String(intHdg).padStart(3, "0"), String(intHdg)]),
      el("maintain 3000 until established", altitudePatterns(3000)),
      el("cleared ILS", ["cleared ils", "clear ils", "cleared for the ils", "cleared ils approach"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Heading ${sayHeading(intHdg)}, maintain ${sayAltitude(3000)} until established, cleared ILS ${sayRunway(arr)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetHdg = intHdg;
      p.targetAlt = 3000;
      p.targetGs = 170;
      setTimeout(() => {
        if (!p.dead) p.ils = true;
      }, 4000);
    },
    delayAfterMs: 13000,
  });

  const landingClearanceStep = (again: boolean): CommStep => ({
    phase: "TOWER",
    freq: towerFreq,
    checkIn: again ? undefined : `Vancouver Tower, ${plan.radio}.`,
    atc: `${plan.radio}, ${again ? "tower again, " : "Vancouver Tower, "}${sayWind(plan.windDir, plan.windKt)}, runway ${sayRunway(arr)}, cleared to land.`,
    elements: [
      callsignEl(plan.radio),
      el("cleared to land", ["cleared to land", "clear to land", "cleared land"]),
      el(`runway ${arr}`, runwayPatterns(arr)),
    ],
    example: `Cleared to land runway ${sayRunway(arr)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetGs = 145;
    },
    delayAfterMs: again || !goAround ? 20000 : 9000,
  });

  steps.push({
    phase: "ARRIVAL",
    freq: FREQS.arrival,
    checkIn: `Vancouver Arrival, ${plan.radio}, with information ${plan.atisWord}.`,
    atc: `${plan.radio}, Vancouver Arrival, good day. Information ${plan.atisWord} is current, expect ILS runway ${sayRunway(arr)}. Descend ${sayAltitude(6000)}, ${sayAltimeter(plan.altimeter)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`ILS runway ${arr}`, runwayPatterns(arr)),
      el("descend 6000", altitudePatterns(6000)),
      el(`altimeter ${plan.altimeter}`, [plan.altimeter.replace(".", ""), plan.altimeter]),
    ],
    example: `Information ${plan.atisWord}, expect ILS ${sayRunway(arr)}, descend ${sayAltitude(6000)}, ${sayAltimeter(plan.altimeter)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetAlt = 6000;
    },
    delayAfterMs: 12000,
  });

  steps.push({
    phase: "ARRIVAL",
    freq: FREQS.arrival,
    atc: `${plan.radio}, descend ${sayAltitude(4000)}, reduce speed two one zero knots.`,
    elements: [
      callsignEl(plan.radio),
      el("descend 4000", altitudePatterns(4000)),
      el("speed 210", ["210"]),
    ],
    example: `Descend ${sayAltitude(4000)}, speed two one zero, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetAlt = 4000;
      p.targetGs = 210;
    },
    delayAfterMs: 12000,
  });

  if (Math.random() < 0.55) {
    steps.push(trafficAdvisoryStep(plan, "ARRIVAL", FREQS.arrival));
  }

  steps.push({
    phase: "APPROACH",
    freq: FREQS.arrival,
    atc: `${plan.radio}, turn ${angleSide((plan.flow.arrHeading + 180) % 360, baseHdg)} heading ${sayHeading(baseHdg)}, vectors for the ILS runway ${sayRunway(arr)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`heading ${String(baseHdg).padStart(3, "0")}`, [String(baseHdg).padStart(3, "0"), String(baseHdg)]),
    ],
    example: `Heading ${sayHeading(baseHdg)}, vectors ILS ${sayRunway(arr)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.targetHdg = baseHdg;
    },
    delayAfterMs: 11000,
  });

  steps.push(ilsClearanceStep(false));

  steps.push({
    phase: "APPROACH",
    freq: FREQS.arrival,
    atc: `${plan.radio}, contact tower ${sayFreq(towerFreq.mhz)}.`,
    elements: [callsignEl(plan.radio), el(`tower ${towerFreq.mhz}`, freqPatterns(towerFreq.mhz))],
    example: `Tower ${sayFreq(towerFreq.mhz)}, ${plan.radio}.`,
    delayAfterMs: 6000,
  });

  steps.push(landingClearanceStep(false));

  if (goAround) {
    steps.push({
      phase: "TOWER",
      freq: towerFreq,
      atc: `${plan.radio}, go around, I say again, go around. Traffic on the runway. Fly runway heading, climb ${sayAltitude(3000)}.`,
      elements: [
        callsignEl(plan.radio),
        el("going around", ["go around", "going around", "go round", "going round"]),
        el("runway heading", ["runway heading"]),
        el("climb 3000", altitudePatterns(3000)),
      ],
      example: `Going around, runway heading, climb ${sayAltitude(3000)}, ${plan.radio}.`,
      onCorrect: (p) => {
        p.ils = false;
        p.targetAlt = 3000;
        p.targetGs = 190;
        p.targetHdg = plan.flow.arrHeading;
        p.climbRate = 2400;
      },
      delayAfterMs: 9000,
    });
    steps.push({
      phase: "TOWER",
      freq: towerFreq,
      atc: `${plan.radio}, contact arrival ${sayFreq(FREQS.arrival.mhz)} for re-sequencing.`,
      elements: [callsignEl(plan.radio), el(`arrival ${FREQS.arrival.mhz}`, freqPatterns(FREQS.arrival.mhz))],
      example: `Arrival ${sayFreq(FREQS.arrival.mhz)}, ${plan.radio}.`,
      delayAfterMs: 7000,
    });
    steps.push({
      phase: "APPROACH",
      freq: FREQS.arrival,
      checkIn: `Vancouver Arrival, ${plan.radio}, on the go.`,
      atc: `${plan.radio}, Vancouver Arrival, radar identified. Turn ${angleSide(plan.flow.arrHeading, baseHdg)} heading ${sayHeading(baseHdg)}, vectors back for the ILS runway ${sayRunway(arr)}.`,
      elements: [
        callsignEl(plan.radio),
        el(`heading ${String(baseHdg).padStart(3, "0")}`, [String(baseHdg).padStart(3, "0"), String(baseHdg)]),
      ],
      example: `Heading ${sayHeading(baseHdg)}, ${plan.radio}.`,
      onCorrect: (p) => {
        p.targetHdg = baseHdg;
      },
      delayAfterMs: 14000,
    });
    steps.push(ilsClearanceStep(true));
    steps.push(landingClearanceStep(true));
  }

  steps.push({
    phase: "GROUND",
    freq: towerFreq,
    atc: `${plan.radio}, welcome to Vancouver. Exit ${plan.flow.key === "east" ? "left" : "right"} at ${exitTwy}, contact ground ${sayFreq(FREQS.ground.mhz)}.`,
    elements: [
      callsignEl(plan.radio),
      el(`exit at ${exitTwy}`, [exitTwy]),
      el(`ground ${FREQS.ground.mhz}`, freqPatterns(FREQS.ground.mhz)),
    ],
    example: `${exitTwy}, ground ${sayFreq(FREQS.ground.mhz)}, ${plan.radio}.`,
    onCorrect: (p) => {
      p.ils = false;
      p.targetGs = 12;
      p.accel = 20;
      p.waypoint = { x: -0.4, y: 0 };
    },
    delayAfterMs: 8000,
  });

  steps.push({
    phase: "GATE",
    freq: FREQS.ground,
    checkIn: `Vancouver Ground, ${plan.radio}, clear of the runway.`,
    atc: `${plan.radio}, Vancouver Ground, taxi to the gate via ${gateTaxi.join(", ")}.`,
    elements: [callsignEl(plan.radio), ...gateTaxi.map((t) => el(`via ${t}`, [t]))],
    example: `Gate via ${gateTaxi.join(", ")}, ${plan.radio}.`,
  });

  return { plan, steps, spawnPlayer: () => spawnArrivalPlayer(plan) };
}

export function buildFlight(scenario: Scenario) {
  return scenario === "departure" ? buildDeparture() : buildArrival();
}
