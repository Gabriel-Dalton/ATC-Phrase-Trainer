import { useEffect, useRef, useState } from "react";
import { MAP_FIXES } from "../engine/data";
import { RUNWAYS, headingVector, world } from "../engine/world";
import type { Aircraft } from "../engine/types";

// Canvas radar display. The world simulation ticks here (a single rAF loop
// drives both physics and paint); everything else only reads world state.
// The view supports drag-to-pan, wheel/button zoom, and recenter.

const COLORS = {
  bg: "#080c12",
  water: "#0b111b",
  coast: "#1e2a3a",
  ring: "rgba(230, 234, 240, 0.055)",
  ringLabel: "rgba(95, 178, 198, 0.5)",
  compass: "rgba(166, 176, 189, 0.32)",
  runway: "#8a97a6",
  centreline: "rgba(95, 178, 198, 0.3)",
  fix: "rgba(95, 178, 198, 0.55)",
  ai: "#7fa9b8",
  aiTrail: "rgba(127, 169, 184, 0.28)",
  player: "#f2a950",
  playerTrail: "rgba(242, 169, 80, 0.4)",
  selected: "#e6eaf0",
};

// Stylized Strait of Georgia shoreline, in nm around CYVR (decorative).
const COASTLINE: [number, number][] = [
  [-30, 30], [-9, 30], [-11, 22], [-7, 16], [-10, 10], [-5, 4],
  [-7, -2], [-3, -8], [-6, -14], [-2, -20], [-5, -26], [-3, -30], [-30, -30],
];

const DRAG_THRESHOLD = 5; // px of movement before a press counts as a pan

interface Props {
  overlay: { time: string; flow: string; wind: string; atis: string };
}

export function RadarScope({ overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(26); // nm half-width
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // camera center offset from the field, in nm
  const camRef = useRef({ x: 0, y: 0 });
  const hoverRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const recenter = () => {
    camRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let lastTs: number | null = null;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const project = () => {
      const w = canvas.width;
      const h = canvas.height;
      const scale = Math.min(w, h) / 2 / rangeRef.current;
      const cam = camRef.current;
      return {
        w, h, scale,
        px: (x: number) => w / 2 + (x - cam.x) * scale,
        py: (y: number) => h / 2 - (y - cam.y) * scale,
      };
    };

    // ---- pointer: pan (drag) vs select (click) ----
    const drag = { active: false, moved: false, startX: 0, startY: 0, camX: 0, camY: 0 };

    const localXY = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    };

    const nearestCallsign = (mx: number, my: number): string | null => {
      const { px, py } = project();
      const dpr = window.devicePixelRatio || 1;
      let best: string | null = null;
      let bestDist = 14 * dpr;
      for (const ac of world.aircraft) {
        const d = Math.hypot(px(ac.x) - mx, py(ac.y) - my);
        if (d < bestDist) {
          bestDist = d;
          best = ac.callsign;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      const { x, y } = localXY(e);
      drag.active = true;
      drag.moved = false;
      drag.startX = x;
      drag.startY = y;
      drag.camX = camRef.current.x;
      drag.camY = camRef.current.y;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = localXY(e);
      if (drag.active) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
        if (drag.moved) {
          const { scale } = project();
          camRef.current = { x: drag.camX - dx / scale, y: drag.camY + dy / scale };
          canvas.style.cursor = "grabbing";
        }
        return;
      }
      hoverRef.current = nearestCallsign(x, y);
      canvas.style.cursor = hoverRef.current ? "pointer" : "grab";
    };

    const onPointerUp = (e: PointerEvent) => {
      if (drag.active && !drag.moved) {
        const { x, y } = localXY(e);
        setSelected(nearestCallsign(x, y));
      }
      drag.active = false;
      canvas.style.cursor = "grab";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setRange((r) => Math.max(8, Math.min(46, r + dir * 3)));
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.style.cursor = "grab";

    const drawTarget = (p: ReturnType<typeof project>, ac: Aircraft, dpr: number) => {
      const X = p.px(ac.x);
      const Y = p.py(ac.y);
      const isSel = selectedRef.current === ac.callsign || hoverRef.current === ac.callsign;
      const color = ac.player ? COLORS.player : COLORS.ai;

      // history trail
      ctx.fillStyle = ac.player ? COLORS.playerTrail : COLORS.aiTrail;
      ac.history.forEach((pt, i) => {
        const r = (1 + i * 0.3) * dpr;
        ctx.beginPath();
        ctx.arc(p.px(pt.x), p.py(pt.y), r, 0, Math.PI * 2);
        ctx.fill();
      });

      // velocity leader: one minute of travel
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3 * dpr;
      if (ac.gs > 40) {
        const v = headingVector(ac.hdg);
        const lead = ac.gs / 60;
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(p.px(ac.x + v.x * lead), p.py(ac.y + v.y * lead));
        ctx.stroke();
      }

      // position symbol: filled chevron for ownship, open diamond for traffic
      ctx.save();
      ctx.translate(X, Y);
      if (ac.player) {
        ctx.rotate((ac.hdg * Math.PI) / 180);
        const s = 6 * dpr;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.8, s);
        ctx.lineTo(0, s * 0.45);
        ctx.lineTo(-s * 0.8, s);
        ctx.closePath();
        ctx.fill();
      } else {
        const s = 4.5 * dpr;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      if (isSel) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(X, Y, 11 * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // datablock: callsign / altitude(x100) + trend + groundspeed(x10)
      const trend = ac.vs > 300 ? "↑" : ac.vs < -300 ? "↓" : "";
      const altTxt = String(Math.max(0, Math.round(ac.alt / 100))).padStart(3, "0");
      const gsTxt = String(Math.round(ac.gs / 10)).padStart(2, "0");
      ctx.fillStyle = color;
      ctx.font = `${10.5 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      ctx.fillText(ac.callsign, X + 10 * dpr, Y - 9 * dpr);
      ctx.fillText(`${altTxt}${trend} ${gsTxt}`, X + 10 * dpr, Y + 3 * dpr);
      if (isSel) {
        ctx.fillStyle = COLORS.selected;
        const kindTxt = ac.player ? "OWNSHIP" : ac.kind.toUpperCase();
        ctx.fillText(`${kindTxt} · HDG ${String(Math.round(ac.hdg)).padStart(3, "0")}`, X + 10 * dpr, Y + 15 * dpr);
      }
    };

    const draw = () => {
      const p = project();
      const { w, h, scale, px, py } = p;
      const dpr = window.devicePixelRatio || 1;
      const rng = rangeRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // water / coastline
      ctx.fillStyle = COLORS.water;
      ctx.beginPath();
      COASTLINE.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLORS.coast;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      COASTLINE.slice(1, -1).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
      ctx.stroke();
      ctx.fillStyle = "rgba(151, 161, 173, 0.28)";
      ctx.font = `${10 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      ctx.fillText("STRAIT OF GEORGIA", px(-24), py(-8));

      // range rings (centered on the field, which pans with the camera)
      ctx.lineWidth = 1;
      ctx.font = `${9.5 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      for (let r = 5; r <= rng + Math.hypot(camRef.current.x, camRef.current.y); r += 5) {
        ctx.strokeStyle = COLORS.ring;
        ctx.beginPath();
        ctx.arc(px(0), py(0), r * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = COLORS.ringLabel;
        ctx.fillText(`${r}`, px(0) + 3 * dpr, py(r) - 3 * dpr);
      }

      // compass rose fixed to the viewport edge
      const cR = Math.min(w, h) / 2 - 6 * dpr;
      ctx.strokeStyle = COLORS.compass;
      ctx.fillStyle = COLORS.compass;
      ctx.font = `${9.5 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let deg = 0; deg < 360; deg += 10) {
        const rad = ((deg - 90) * Math.PI) / 180;
        const inner = deg % 30 === 0 ? cR - 8 * dpr : cR - 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(rad) * inner, h / 2 + Math.sin(rad) * inner);
        ctx.lineTo(w / 2 + Math.cos(rad) * cR, h / 2 + Math.sin(rad) * cR);
        ctx.stroke();
        if (deg % 30 === 0) {
          const lx = w / 2 + Math.cos(rad) * (cR - 17 * dpr);
          const ly = h / 2 + Math.sin(rad) * (cR - 17 * dpr);
          ctx.fillText(String(deg / 10).padStart(2, "0"), lx, ly);
        }
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // extended centrelines toward the approach side
      ctx.strokeStyle = COLORS.centreline;
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([5 * dpr, 9 * dpr]);
      const back = headingVector((world.flow.arrHeading + 180) % 360);
      for (const key of ["north", "south"] as const) {
        const r = RUNWAYS[key];
        const sx = world.flow.key === "east" ? r.x1 : r.x2;
        const sy = world.flow.key === "east" ? r.y1 : r.y2;
        ctx.beginPath();
        ctx.moveTo(px(sx), py(sy));
        ctx.lineTo(px(sx + back.x * 15), py(sy + back.y * 15));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // runways
      ctx.strokeStyle = COLORS.runway;
      ctx.lineWidth = 3 * dpr;
      for (const key of ["north", "south"] as const) {
        const r = RUNWAYS[key];
        ctx.beginPath();
        ctx.moveTo(px(r.x1), py(r.y1));
        ctx.lineTo(px(r.x2), py(r.y2));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(151, 161, 173, 0.7)";
      ctx.font = `${10 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      ctx.fillText("CYVR", px(0.4), py(-1.0));

      // en-route fixes
      ctx.strokeStyle = COLORS.fix;
      ctx.fillStyle = COLORS.fix;
      for (const fix of MAP_FIXES) {
        const fx = px(fix.x);
        const fy = py(fix.y);
        if (fx < -20 || fx > w + 20 || fy < -20 || fy > h + 20) continue;
        const s = 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(fx, fy - s);
        ctx.lineTo(fx + s, fy + s);
        ctx.lineTo(fx - s, fy + s);
        ctx.closePath();
        ctx.stroke();
        ctx.fillText(fix.name, fx + 7 * dpr, fy + 3 * dpr);
      }

      for (const ac of world.aircraft) drawTarget(p, ac, dpr);
    };

    const tick = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      const dt = Math.min(0.1, (ts - lastTs) / 1000);
      lastTs = ts;
      world.tick(dt);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="radar-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
      <div className="radar-overlay">
        <span className="radar-time">{overlay.time}</span>
        <span>{overlay.flow}</span>
        <span>{overlay.wind}</span>
        <span>{overlay.atis}</span>
      </div>
      <div className="radar-hint">Drag to pan · scroll to zoom · click a target</div>
      <div className="radar-controls">
        <button type="button" aria-label="Zoom in" onClick={() => setRange((r) => Math.max(8, r - 6))}>+</button>
        <span className="radar-range">{range} NM</span>
        <button type="button" aria-label="Zoom out" onClick={() => setRange((r) => Math.min(46, r + 6))}>&minus;</button>
        <button type="button" aria-label="Recenter" title="Recenter on CYVR" onClick={recenter}>&#8982;</button>
      </div>
    </div>
  );
}
