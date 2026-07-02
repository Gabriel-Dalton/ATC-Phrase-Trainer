import { useEffect, useRef, useState } from "react";
import { MAP_FIXES } from "../engine/data";
import { RUNWAYS, headingVector, world } from "../engine/world";
import type { Aircraft } from "../engine/types";

// Canvas radar display. The world simulation ticks here (single rAF loop
// drives both physics and paint), everything else only reads world state.

const COLORS = {
  bg: "#0b0e13",
  water: "#0d131c",
  coast: "#1d2836",
  ring: "rgba(220, 227, 234, 0.06)",
  ringLabel: "rgba(151, 161, 173, 0.5)",
  compass: "rgba(151, 161, 173, 0.35)",
  runway: "#7d8895",
  centreline: "rgba(76, 144, 240, 0.28)",
  fix: "rgba(151, 161, 173, 0.55)",
  ai: "#93a1b0",
  aiTrail: "rgba(147, 161, 176, 0.28)",
  player: "#6aa5f5",
  playerTrail: "rgba(106, 165, 245, 0.35)",
  selected: "#e8edf3",
};

// Stylized Strait of Georgia shoreline, in nm around CYVR (decorative).
const COASTLINE: [number, number][] = [
  [-30, 30], [-9, 30], [-11, 22], [-7, 16], [-10, 10], [-5, 4],
  [-7, -2], [-3, -8], [-6, -14], [-2, -20], [-5, -26], [-3, -30], [-30, -30],
];

interface Props {
  overlay: { time: string; flow: string; wind: string; atis: string };
}

export function RadarScope({ overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(26); // nm half-width
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const hoverRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

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
      return {
        w, h, scale,
        px: (x: number) => w / 2 + x * scale,
        py: (y: number) => h / 2 - y * scale,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;
      const { px, py } = project();
      let best: string | null = null;
      let bestDist = 14 * dpr;
      for (const ac of world.aircraft) {
        const d = Math.hypot(px(ac.x) - mx, py(ac.y) - my);
        if (d < bestDist) {
          bestDist = d;
          best = ac.callsign;
        }
      }
      hoverRef.current = best;
      canvas.style.cursor = best ? "pointer" : "default";
    };
    const onClick = () => {
      setSelected(hoverRef.current);
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onClick);

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
        ctx.rotate(((ac.hdg - 0) * Math.PI) / 180);
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
      const range = rangeRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // water / coastline
      ctx.fillStyle = COLORS.water;
      ctx.beginPath();
      COASTLINE.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      });
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLORS.coast;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      COASTLINE.slice(1, -1).forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      });
      ctx.stroke();
      ctx.fillStyle = "rgba(151, 161, 173, 0.28)";
      ctx.font = `${10 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      ctx.fillText("STRAIT OF GEORGIA", px(-24), py(-8));

      // range rings
      ctx.lineWidth = 1;
      ctx.font = `${9.5 * dpr}px 'Inter Variable', system-ui, sans-serif`;
      for (let r = 5; r <= range; r += 5) {
        ctx.strokeStyle = COLORS.ring;
        ctx.beginPath();
        ctx.arc(px(0), py(0), r * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = COLORS.ringLabel;
        ctx.fillText(`${r}`, px(0) + 3 * dpr, py(r) - 3 * dpr);
      }

      // compass ticks every 10°, labels every 30°
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

      // fixes
      ctx.strokeStyle = COLORS.fix;
      ctx.fillStyle = COLORS.fix;
      for (const fix of MAP_FIXES) {
        if (Math.abs(fix.x) > range || Math.abs(fix.y) > range) continue;
        const fx = px(fix.x);
        const fy = py(fix.y);
        const s = 4 * dpr;
        ctx.beginPath();
        ctx.moveTo(fx, fy - s);
        ctx.lineTo(fx + s, fy + s);
        ctx.lineTo(fx - s, fy + s);
        ctx.closePath();
        ctx.stroke();
        ctx.fillText(fix.name, fx + 7 * dpr, fy + 3 * dpr);
      }

      // aircraft
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
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("click", onClick);
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
      <div className="radar-controls">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setRange((r) => Math.max(10, r - 8))}
        >
          +
        </button>
        <span>{range} NM</span>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setRange((r) => Math.min(42, r + 8))}
        >
          −
        </button>
      </div>
    </div>
  );
}
