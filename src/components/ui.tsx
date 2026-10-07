import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

/* ── surfaces ─────────────────────────────────────── */
export function Card({
  children,
  className,
  hover = true,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: "div" | "section";
}) {
  return (
    <As
      className={cn(
        "relative overflow-hidden rounded-[15px] border border-hairline bg-surface",
        hover &&
          "transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-[2px] hover:border-[#d6d3cc] hover:shadow-lift",
        className,
      )}
    >
      {children}
    </As>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("micro text-ink3", className)}>{children}</div>;
}

export function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="micro rounded-full bg-ink/[0.05] px-2 py-[5px] text-ink3">{n}</span>
      <span className="text-[12px] font-medium tracking-tight text-ink3">{children}</span>
    </div>
  );
}

/* ── buttons ──────────────────────────────────────── */
export function Btn({
  children,
  onClick,
  variant = "quiet",
  size = "md",
  className,
  icon,
  active,
  title,
  disabled,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "quiet" | "ghost" | "danger" | "stage";
  size?: "sm" | "md";
  className?: string;
  icon?: ReactNode;
  active?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  const base =
    "group relative inline-flex select-none items-center justify-center gap-2 rounded-[9px] font-medium tracking-tight transition-all duration-200 active:scale-[.975]";
  const v = {
    primary: "bg-signal text-white shadow-[0_1px_0_rgba(255,255,255,.2)_inset,0_6px_16px_-8px_rgba(14,109,97,.75)] hover:bg-[#0b5f55]",
    quiet: "bg-white text-ink border border-hairline hover:border-[#d3d0c9] hover:bg-paper shadow-[0_1px_2px_rgba(20,22,26,.05)]",
    ghost: "text-ink2 hover:bg-ink/[0.045] hover:text-ink",
    danger: "bg-alert/10 text-alert border border-alert/20 hover:bg-alert/15",
    stage: cn(
      "border text-[12px] backdrop-blur-md transition-colors",
      active
        ? "border-white/25 bg-white/[0.16] text-white"
        : "border-white/10 bg-white/[0.06] text-white/60 hover:bg-white/[0.11] hover:text-white/90",
    ),
  }[variant];
  const s = size === "sm" ? "h-[26px] px-2.5 text-[11.5px]" : "h-8 px-3 text-[12.5px]";
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, v, s, disabled && "pointer-events-none opacity-45", className)}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── segmented control ────────────────────────────── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  dark,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ x: 0, w: 0 });
  const id = useId();
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-v="${value}"]`);
    if (el && ref.current) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, options.length, id]);
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex shrink-0 items-center gap-0.5 rounded-[10px] p-[3px]",
        dark ? "bg-white/[0.07] ring-1 ring-white/10" : "bg-ink/[0.05] ring-1 ring-black/[0.02]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] bottom-[3px] rounded-[7px] transition-all duration-[380ms] ease-[cubic-bezier(.32,.72,0,1)]",
          dark ? "bg-white/16 shadow-[0_1px_6px_rgba(0,0,0,.4)]" : "bg-white shadow-[0_1px_2px_rgba(20,22,26,.13)] ring-1 ring-black/[0.03]",
        )}
        style={{ left: box.x, width: box.w }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          data-v={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 flex h-[24px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium tracking-tight transition-colors",
            dark ? (value === o.value ? "text-white" : "text-white/50 hover:text-white/80") : value === o.value ? "text-ink" : "text-ink3 hover:text-ink2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── slider ───────────────────────────────────────── */
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  fmt,
  dark,
  accent = "#0e6d61",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  dark?: boolean;
  accent?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className={cn("micro", dark ? "text-white/45" : "text-ink3")}>{label}</span>
        <span className={cn("tnum font-mono text-[11px]", dark ? "text-white/85" : "text-ink")}>
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{ ["--rng-pct" as string]: `${pct}%`, ["--rng-accent" as string]: accent }}
      />
    </label>
  );
}

/* ── switch ───────────────────────────────────────── */
export function Switch({ on, onChange, tone = "signal" }: { on: boolean; onChange: (v: boolean) => void; tone?: "signal" | "alert" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300 ease-[cubic-bezier(.32,.72,0,1)]",
        on ? (tone === "alert" ? "bg-alert" : "bg-signal") : "bg-ink/[0.14]",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.28)] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)]",
          on ? "left-[18px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

/* ── pills ────────────────────────────────────────── */
const SEV: Record<string, string> = {
  critical: "bg-alert-soft text-[#a92318] ring-alert/20",
  high: "bg-[#fdf1e4] text-[#9a4a12] ring-[#e8a86f]/35",
  medium: "bg-[#fbf5df] text-[#7d6410] ring-[#d6bf62]/40",
  low: "bg-ink/[0.05] text-ink2 ring-black/[0.05]",
};
export function SevPill({ sev, children }: { sev: Severity; children?: ReactNode }) {
  return (
    <span className={cn("micro inline-flex items-center gap-1.5 rounded-full px-2 py-[5px] ring-1 ring-inset", SEV[sev])}>
      <span className={cn("h-[5px] w-[5px] rounded-full", sev === "critical" ? "bg-alert live-dot" : "bg-current opacity-60")} />
      {children ?? sev}
    </span>
  );
}
type Severity = "critical" | "high" | "medium" | "low";

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-alert-soft text-[#a92318]",
    ack: "bg-[#eef4fb] text-[#2b5c92]",
    dispatched: "bg-[#e9f6f3] text-signal",
    closed: "bg-ink/[0.05] text-ink3",
    "false-positive": "bg-ink/[0.05] text-ink4 line-through decoration-ink4/50",
  };
  return (
    <span className={cn("micro rounded-full px-2 py-[5px]", map[status] ?? map.closed)}>{status.replace("-", " ")}</span>
  );
}

/* ── data viz atoms ───────────────────────────────── */
export function Spark({ data, fill = false, color = "#16171a", h = 26, w = 90 }: { data: number[]; fill?: boolean; color?: string; h?: number; w?: number }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / Math.max(1, max - min)) * (h - 4)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      {fill && <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={color} opacity={0.08} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={1.9} fill={color} />
    </svg>
  );
}

export function Ring({ pct, size = 44, color = "#0e6d61", track = "rgba(20,22,26,.09)", label }: { pct: number; size?: number; color?: string; track?: string; label?: ReactNode }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={3.5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <span className="absolute text-[10.5px] font-semibold tnum tracking-tight" style={{ color }}>
        {label ?? `${Math.round(pct * 100)}`}
      </span>
    </div>
  );
}

export function Bar({ pct, color = "#0e6d61", h = 5, dark }: { pct: number; color?: string; h?: number; dark?: boolean }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full", dark ? "bg-white/12" : "bg-ink/[0.07]")} style={{ height: h }}>
      <div
        className="h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)]"
        style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: color }}
      />
    </div>
  );
}

export function Stat({
  k,
  v,
  sub,
  spark,
  tone = "ink",
  color = "#16171a",
}: {
  k: string;
  v: ReactNode;
  sub?: ReactNode;
  spark?: number[];
  tone?: "ink" | "signal" | "alert";
  color?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 px-4 py-3.5">
      <Label>{k}</Label>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "font-display text-[26px] leading-none font-semibold tracking-[-0.045em] tnum",
              tone === "signal" && "text-signal",
              tone === "alert" && "text-alert",
            )}
          >
            {v}
          </div>
          {sub && <div className="mt-1.5 truncate text-[11.5px] text-ink3">{sub}</div>}
        </div>
        {spark && <Spark data={spark} color={color} fill />}
      </div>
    </div>
  );
}

/* ── scroll reveal ────────────────────────────────── */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          el.classList.add("in");
          io.unobserve(el);
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── view header ──────────────────────────────────── */
export function ViewHead({
  title,
  kicker,
  desc,
  right,
}: {
  title: string;
  kicker: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-[62ch]">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-[6px] w-[6px] rounded-full bg-signal" />
          <span className="micro text-ink3">{kicker}</span>
        </div>
        <h1 className="text-[34px] leading-[1.03] font-semibold text-ink sm:text-[40px]">{title}</h1>
        {desc && <p className="mt-3 text-[14px] leading-[1.55] text-ink2">{desc}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const i = window.setInterval(() => setN(new Date()), ms);
    return () => window.clearInterval(i);
  }, [ms]);
  return n;
}
