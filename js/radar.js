// ============================================================
// RADAR — coordinate space, aircraft kinematics, scope render
// Coordinates: nautical miles, origin at CYVR field centre,
// +x east, +y north. Headings are compass degrees.
// ============================================================

const Radar = (() => {
  const RANGE_NM = 26; // half-width of the scope
  const RWY_LEN = 1.7;
  const RWY_HDG = 83; // true-ish orientation of the 08/26 pair

  const canvas = () => document.getElementById("radar");

  const aircraft = []; // { callsign, x, y, alt, gs, hdg, targets, kind, player }
  let sweepAngle = 0;
  let lastTs = null;

  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;

  function headingVector(hdg) {
    return { x: Math.sin((hdg * Math.PI) / 180), y: Math.cos((hdg * Math.PI) / 180) };
  }

  function runwayEnds(offsetY) {
    const v = headingVector(RWY_HDG);
    const half = RWY_LEN / 2;
    const perp = { x: -v.y, y: v.x };
    const cx = perp.x * offsetY, cy = perp.y * offsetY;
    return {
      x1: cx - v.x * half, y1: cy - v.y * half,
      x2: cx + v.x * half, y2: cy + v.y * half,
    };
  }

  const RUNWAYS = {
    north: runwayEnds(0.28), // 08L / 26R
    south: runwayEnds(-0.28), // 08R / 26L
  };

  function spawn(props) {
    const ac = {
      callsign: "", x: 0, y: 0, alt: 0, gs: 0, hdg: 90,
      targetAlt: null, targetGs: null, targetHdg: null, turnDir: null,
      climbRate: 2000, accel: 12, turnRate: 3,
      player: false, kind: "ai", history: [], dead: false,
      onGround: true,
      ...props,
    };
    aircraft.push(ac);
    return ac;
  }

  function clearAll() {
    aircraft.length = 0;
  }

  function angleDelta(from, to) {
    let d = ((to - from + 540) % 360) - 180;
    return d;
  }

  function ilsThreshold(ac) {
    const r = RUNWAYS.south;
    return (ac.arrFlow || (flow === FLOWS.east ? "east" : "west")) === "east"
      ? { x: r.x1, y: r.y1 }
      : { x: r.x2, y: r.y2 };
  }

  function updateAircraft(ac, dt) {
    // ground taxi steering toward a waypoint
    if (ac.waypoint) {
      const dx = ac.waypoint.x - ac.x, dy = ac.waypoint.y - ac.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.06) {
        ac.waypoint = null;
        ac.targetGs = 0;
      } else {
        ac.hdg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      }
    }
    // crude ILS: home on the arrival threshold and ride the glidepath down
    if (ac.ils) {
      const thr = ilsThreshold(ac);
      const dx = thr.x - ac.x, dy = thr.y - ac.y;
      const dist = Math.hypot(dx, dy);
      ac.targetHdg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      ac.turnDir = null;
      ac.alt = Math.min(ac.alt, Math.max(0, dist * 310));
      if (dist < 0.45 && ac.alt < 100) {
        ac.ils = false;
        ac.hdg = flow.arrHeading;
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
      if (Math.abs(d) <= step) { ac.gs = ac.targetGs; ac.targetGs = null; }
      else ac.gs += Math.sign(d) * step;
    }
    // altitude
    if (ac.targetAlt != null) {
      const d = ac.targetAlt - ac.alt;
      const step = (ac.climbRate / 60) * dt;
      if (Math.abs(d) <= step) { ac.alt = ac.targetAlt; ac.targetAlt = null; }
      else ac.alt += Math.sign(d) * step;
    }
    // position
    const v = headingVector(ac.hdg);
    const nmPerSec = ac.gs / 3600;
    ac.x += v.x * nmPerSec * dt;
    ac.y += v.y * nmPerSec * dt;
  }

  // ----------------------------------------------------------
  // Ambient AI traffic
  // ----------------------------------------------------------
  let flow = FLOWS.east;
  let aiTimers = { arrival: 20, departure: 55 };
  let onAmbientEvent = null;

  function setFlow(f) { flow = f; }
  function setAmbientHandler(fn) { onAmbientEvent = fn; }

  function aiCallsign() {
    const al = rand(AIRLINES);
    return { tag: `${al.icao}${randInt(100, 999)}`, radio: `${al.radio} ${randInt(100, 999)}` };
  }

  function spawnAiArrival() {
    const cs = aiCallsign();
    const inboundHdg = flow.arrHeading;
    const back = headingVector((inboundHdg + 180) % 360);
    const dist = randInt(16, 23);
    const ac = spawn({
      callsign: cs.tag, kind: "arrival", onGround: false,
      x: back.x * dist, y: back.y * dist - 0.28,
      hdg: inboundHdg, gs: 180, alt: Math.min(5000, dist * 300),
      targetGs: 140, targetAlt: 0, climbRate: 900,
    });
    if (onAmbientEvent) onAmbientEvent("arrival", cs, ac);
  }

  function spawnAiDeparture() {
    const cs = aiCallsign();
    const rwy = RUNWAYS.north;
    const east = flow === FLOWS.east;
    const ac = spawn({
      callsign: cs.tag, kind: "departure", onGround: false,
      x: east ? rwy.x1 : rwy.x2, y: east ? rwy.y1 : rwy.y2,
      hdg: flow.depHeading, gs: 20, alt: 0,
      targetGs: 250, targetAlt: 8000, climbRate: 2600, accel: 9,
    });
    setTimeout(() => {
      if (!ac.dead) {
        ac.targetHdg = (flow.depHeading + rand([-1, 1]) * randInt(20, 60) + 360) % 360;
      }
    }, 25000);
    if (onAmbientEvent) onAmbientEvent("departure", cs, ac);
  }

  function updateAi(dt) {
    aiTimers.arrival -= dt;
    aiTimers.departure -= dt;
    if (aiTimers.arrival <= 0) {
      spawnAiArrival();
      aiTimers.arrival = randInt(75, 130);
    }
    if (aiTimers.departure <= 0) {
      spawnAiDeparture();
      aiTimers.departure = randInt(95, 160);
    }
    for (const ac of aircraft) {
      if (ac.player || ac.dead) continue;
      // arrivals slow + descend on a crude glidepath, vanish after landing
      if (ac.kind === "arrival") {
        const dist = Math.hypot(ac.x, ac.y + 0.28);
        ac.alt = Math.min(ac.alt, Math.max(0, dist * 310));
        if (dist < 0.4 && ac.alt < 50) {
          ac.gs = Math.max(0, ac.gs - 25 * dt);
          if (ac.gs < 25) ac.dead = true;
        }
      }
      if (Math.abs(ac.x) > RANGE_NM + 4 || Math.abs(ac.y) > RANGE_NM + 4) ac.dead = true;
    }
    for (let i = aircraft.length - 1; i >= 0; i--) {
      if (aircraft[i].dead) aircraft.splice(i, 1);
    }
  }

  // ----------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------
  function resize() {
    const c = canvas();
    if (!c) return;
    const rect = c.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
  }

  function draw() {
    const c = canvas();
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    const scale = Math.min(w, h) / 2 / RANGE_NM;
    const px = (x) => w / 2 + x * scale;
    const py = (y) => h / 2 - y * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#04070d";
    ctx.fillRect(0, 0, w, h);

    // range rings
    ctx.strokeStyle = "rgba(0, 255, 65, 0.12)";
    ctx.fillStyle = "rgba(0, 255, 65, 0.35)";
    ctx.lineWidth = 1;
    ctx.font = `${11 * (window.devicePixelRatio || 1)}px "Courier New", monospace`;
    for (let r = 5; r <= RANGE_NM; r += 5) {
      ctx.beginPath();
      ctx.arc(px(0), py(0), r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${r}`, px(0) + 4, py(r) - 4);
    }

    // radar sweep
    const grad = ctx.createConicGradient
      ? ctx.createConicGradient(sweepAngle, px(0), py(0))
      : null;
    if (grad) {
      grad.addColorStop(0, "rgba(0,255,65,0.10)");
      grad.addColorStop(0.08, "rgba(0,255,65,0)");
      grad.addColorStop(1, "rgba(0,255,65,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px(0), py(0), RANGE_NM * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // extended centrelines (dashes toward the arrival side)
    ctx.strokeStyle = "rgba(0, 170, 255, 0.25)";
    ctx.setLineDash([6, 10]);
    const back = headingVector((flow.arrHeading + 180) % 360);
    for (const key of ["north", "south"]) {
      const r = RUNWAYS[key];
      const startX = flow === FLOWS.east ? r.x1 : r.x2;
      const startY = flow === FLOWS.east ? r.y1 : r.y2;
      ctx.beginPath();
      ctx.moveTo(px(startX), py(startY));
      ctx.lineTo(px(startX + back.x * 15), py(startY + back.y * 15));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // runways
    ctx.strokeStyle = "#9fb4c7";
    ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
    for (const key of ["north", "south"]) {
      const r = RUNWAYS[key];
      ctx.beginPath();
      ctx.moveTo(px(r.x1), py(r.y1));
      ctx.lineTo(px(r.x2), py(r.y2));
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(159,180,199,0.7)";
    ctx.fillText("CYVR", px(0.4), py(-1.0));

    // aircraft
    const dpr = window.devicePixelRatio || 1;
    for (const ac of aircraft) {
      const X = px(ac.x), Y = py(ac.y);
      const color = ac.player ? "#39d5ff" : "#00ff41";

      // history trail
      ctx.fillStyle = ac.player ? "rgba(57,213,255,0.35)" : "rgba(0,255,65,0.28)";
      for (const p of ac.history) {
        ctx.fillRect(px(p.x) - 1.5 * dpr, py(p.y) - 1.5 * dpr, 3 * dpr, 3 * dpr);
      }

      // target symbol
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      const s = 5 * dpr;
      ctx.strokeRect(X - s / 2, Y - s / 2, s, s);

      // leader line (1 minute of travel)
      if (ac.gs > 40) {
        const v = headingVector(ac.hdg);
        const lead = ac.gs / 60; // nm per minute
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(px(ac.x + v.x * lead), py(ac.y + v.y * lead));
        ctx.stroke();
      }

      // data block
      ctx.fillStyle = color;
      ctx.font = `${10.5 * dpr}px "Courier New", monospace`;
      const altTxt = String(Math.max(0, Math.round(ac.alt / 100))).padStart(3, "0");
      const gsTxt = String(Math.round(ac.gs / 10)).padStart(2, "0");
      ctx.fillText(ac.callsign, X + 8 * dpr, Y - 10 * dpr);
      ctx.fillText(`${altTxt} ${gsTxt}`, X + 8 * dpr, Y + 1 * dpr);
    }
    ctx.lineWidth = 1;
  }

  let historyTimer = 0;

  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    sweepAngle = (sweepAngle + dt * 0.9) % (Math.PI * 2);

    for (const ac of aircraft) updateAircraft(ac, dt);
    updateAi(dt);

    historyTimer += dt;
    if (historyTimer > 2.5) {
      historyTimer = 0;
      for (const ac of aircraft) {
        if (ac.gs > 40) {
          ac.history.push({ x: ac.x, y: ac.y });
          if (ac.history.length > 5) ac.history.shift();
        }
      }
    }

    draw();
    requestAnimationFrame(tick);
  }

  function start() {
    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);
  }

  return { spawn, clearAll, setFlow, setAmbientHandler, start, RUNWAYS, headingVector, aircraft };
})();
