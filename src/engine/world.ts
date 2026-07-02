import { AIRLINES, FLOWS, rand, randInt } from "./data";
import type { Aircraft, Flow } from "./types";

// The simulation world: aircraft kinematics and ambient AI traffic.
// Pure state + tick(); rendering lives in the RadarScope component.

export const RWY_HDG = 83; // orientation of the 08/26 pair
const RWY_LEN = 1.7;
export const WORLD_EDGE_NM = 30;

export function headingVector(hdg: number): { x: number; y: number } {
  return { x: Math.sin((hdg * Math.PI) / 180), y: Math.cos((hdg * Math.PI) / 180) };
}

function runwayEnds(offset: number) {
  const v = headingVector(RWY_HDG);
  const half = RWY_LEN / 2;
  const perp = { x: -v.y, y: v.x };
  const cx = perp.x * offset;
  const cy = perp.y * offset;
  return {
    x1: cx - v.x * half, y1: cy - v.y * half,
    x2: cx + v.x * half, y2: cy + v.y * half,
  };
}

export const RUNWAYS = {
  north: runwayEnds(0.28), // 08L / 26R
  south: runwayEnds(-0.28), // 08R / 26L
};

function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export type AmbientEvent = {
  kind: "arrival" | "departure";
  tag: string;
  radio: string;
};

export class SimWorld {
  aircraft: Aircraft[] = [];
  flow: Flow = FLOWS.east;
  onAmbient: ((ev: AmbientEvent) => void) | null = null;

  private arrivalTimer = 15;
  private departureTimer = 50;

  spawn(props: Partial<Aircraft>): Aircraft {
    const ac: Aircraft = {
      callsign: "",
      kind: "departure",
      player: false,
      x: 0, y: 0, alt: 0, gs: 0, hdg: 90,
      targetAlt: null, targetGs: null, targetHdg: null, turnDir: null,
      climbRate: 2000, accel: 12, turnRate: 3,
      onGround: true, ils: false, arrFlow: null,
      waypoint: null, history: [], vs: 0, dead: false,
      ...props,
    };
    this.aircraft.push(ac);
    return ac;
  }

  removePlayer() {
    for (const ac of this.aircraft) if (ac.player) ac.dead = true;
  }

  ilsThreshold(ac: Aircraft): { x: number; y: number } {
    const r = RUNWAYS.south;
    const flowKey = ac.arrFlow ?? this.flow.key;
    return flowKey === "east" ? { x: r.x1, y: r.y1 } : { x: r.x2, y: r.y2 };
  }

  private updateAircraft(ac: Aircraft, dt: number) {
    const prevAlt = ac.alt;

    // ground taxi steering toward a waypoint
    if (ac.waypoint) {
      const dx = ac.waypoint.x - ac.x;
      const dy = ac.waypoint.y - ac.y;
      if (Math.hypot(dx, dy) < 0.06) {
        ac.waypoint = null;
        ac.targetGs = 0;
      } else {
        ac.hdg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      }
    }

    // crude ILS: home on the arrival threshold, ride the glidepath down
    if (ac.ils) {
      const thr = this.ilsThreshold(ac);
      const dx = thr.x - ac.x;
      const dy = thr.y - ac.y;
      const dist = Math.hypot(dx, dy);
      ac.targetHdg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      ac.turnDir = null;
      ac.alt = Math.min(ac.alt, Math.max(0, dist * 310));
      if (dist < 0.45 && ac.alt < 100) {
        ac.ils = false;
        ac.hdg = this.flow.arrHeading;
        ac.targetHdg = null;
        ac.targetAlt = null;
        ac.alt = 0;
        ac.targetGs = 25;
        ac.onGround = true;
      }
    }

    // heading
    if (ac.targetHdg != null) {
      let d = angleDelta(ac.hdg, ac.targetHdg);
      if (ac.turnDir === "left" && d > 0) d -= 360;
      if (ac.turnDir === "right" && d < 0) d += 360;
      const step = ac.turnRate * dt;
      if (Math.abs(d) <= step) {
        ac.hdg = ac.targetHdg;
        ac.targetHdg = null;
        ac.turnDir = null;
      } else {
        ac.hdg = (ac.hdg + Math.sign(d) * step + 360) % 360;
      }
    }

    // speed
    if (ac.targetGs != null) {
      const d = ac.targetGs - ac.gs;
      const step = ac.accel * dt;
      if (Math.abs(d) <= step) {
        ac.gs = ac.targetGs;
        ac.targetGs = null;
      } else {
        ac.gs += Math.sign(d) * step;
      }
    }

    // altitude
    if (ac.targetAlt != null) {
      const d = ac.targetAlt - ac.alt;
      const step = (ac.climbRate / 60) * dt;
      if (Math.abs(d) <= step) {
        ac.alt = ac.targetAlt;
        ac.targetAlt = null;
      } else {
        ac.alt += Math.sign(d) * step;
      }
    }

    // position
    const v = headingVector(ac.hdg);
    const nmPerSec = ac.gs / 3600;
    ac.x += v.x * nmPerSec * dt;
    ac.y += v.y * nmPerSec * dt;

    // vertical speed for the datablock trend arrow (smoothed)
    const instVs = dt > 0 ? ((ac.alt - prevAlt) / dt) * 60 : 0;
    ac.vs = ac.vs * 0.9 + instVs * 0.1;
  }

  private aiCallsign() {
    const al = rand(AIRLINES);
    const num = randInt(100, 999);
    return { tag: `${al.icao}${num}`, radio: `${al.radio} ${num}` };
  }

  private spawnAiArrival() {
    const cs = this.aiCallsign();
    const inbound = this.flow.arrHeading;
    const back = headingVector((inbound + 180) % 360);
    const dist = randInt(16, 24);
    this.spawn({
      callsign: cs.tag,
      kind: "arrival",
      onGround: false,
      x: back.x * dist,
      y: back.y * dist - 0.28,
      hdg: inbound,
      gs: 180,
      alt: Math.min(5000, dist * 300),
      targetGs: 140,
      targetAlt: 0,
      climbRate: 900,
    });
    this.onAmbient?.({ kind: "arrival", ...cs });
  }

  private spawnAiDeparture() {
    const cs = this.aiCallsign();
    const r = RUNWAYS.north;
    const east = this.flow.key === "east";
    const ac = this.spawn({
      callsign: cs.tag,
      kind: "departure",
      onGround: false,
      x: east ? r.x1 : r.x2,
      y: east ? r.y1 : r.y2,
      hdg: this.flow.depHeading,
      gs: 20,
      alt: 0,
      targetGs: 250,
      targetAlt: 8000,
      climbRate: 2600,
      accel: 9,
    });
    setTimeout(() => {
      if (!ac.dead) {
        ac.targetHdg = (this.flow.depHeading + rand([-1, 1]) * randInt(20, 60) + 360) % 360;
      }
    }, 25000);
    this.onAmbient?.({ kind: "departure", ...cs });
  }

  private historyTimer = 0;

  tick(dt: number) {
    this.arrivalTimer -= dt;
    this.departureTimer -= dt;
    if (this.arrivalTimer <= 0) {
      this.spawnAiArrival();
      this.arrivalTimer = randInt(75, 130);
    }
    if (this.departureTimer <= 0) {
      this.spawnAiDeparture();
      this.departureTimer = randInt(95, 160);
    }

    for (const ac of this.aircraft) {
      if (ac.dead) continue;
      this.updateAircraft(ac, dt);
      if (ac.player) continue;

      // AI arrivals descend on a crude glidepath and vanish after landing
      if (ac.kind === "arrival") {
        const dist = Math.hypot(ac.x, ac.y + 0.28);
        ac.alt = Math.min(ac.alt, Math.max(0, dist * 310));
        if (dist < 0.4 && ac.alt < 50) {
          ac.gs = Math.max(0, ac.gs - 25 * dt);
          if (ac.gs < 25) ac.dead = true;
        }
      }
      if (Math.abs(ac.x) > WORLD_EDGE_NM || Math.abs(ac.y) > WORLD_EDGE_NM) ac.dead = true;
    }

    this.historyTimer += dt;
    if (this.historyTimer > 2.5) {
      this.historyTimer = 0;
      for (const ac of this.aircraft) {
        if (ac.gs > 40) {
          ac.history.push({ x: ac.x, y: ac.y });
          if (ac.history.length > 6) ac.history.shift();
        }
      }
    }

    this.aircraft = this.aircraft.filter((ac) => !ac.dead);
  }
}

export const world = new SimWorld();
