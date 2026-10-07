import {
  BarChart3,
  BellRing,
  CarFront,
  Command,
  Cpu,
  FileText,
  Gauge,
  Map as MapIcon,
  Moon,
  Network,
  Pause,
  Play,
  ScanFace,
  ScanLine,
  Search,
  Share2,
  ShieldCheck,
  Box,
  Video,
  Waypoints,
} from "lucide-react";
import { CAMERAS } from "../lib/data";
import { fmtClock } from "../lib/sim";
import { useApp, type ViewId } from "../state/store";
import { cn } from "../utils/cn";
import { Label, useNow } from "./ui";

export const NAV: { group: string; items: { id: ViewId; label: string; icon: typeof Video; hint: string }[] }[] = [
  {
    group: "Operations",
    items: [
      { id: "live", label: "Live Wall", icon: Video, hint: "Analytics over live streams" },
      { id: "events", label: "Event Ledger", icon: BellRing, hint: "Alerts, triage, evidence" },
      { id: "response", label: "Response Twin", icon: Waypoints, hint: "Intercept planning & QRT tasking" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { id: "incident", label: "Incident Graph", icon: Share2, hint: "Cross-camera causal chain & custody" },
      { id: "tactical", label: "3D Tactical Map", icon: Box, hint: "Perspective terrain, fence and sensor coverage" },
      { id: "faces", label: "Faces · FRS", icon: ScanFace, hint: "Face detection & recognition" },
      { id: "vehicles", label: "Vehicles · ANPR", icon: CarFront, hint: "Plate recognition ledger" },
      { id: "fence", label: "Virtual Fence", icon: Waypoints, hint: "Tripwires & exclusion polygons" },
      { id: "threats", label: "Advanced Detection", icon: ScanLine, hint: "UAS, terrain change & camera tamper" },
      { id: "night", label: "Night Ops", icon: Moon, hint: "Low-light enhancement pipeline" },
      { id: "analytics", label: "Analytics", icon: BarChart3, hint: "Trends, coverage, model health" },
    ],
  },
  {
    group: "Infrastructure",
    items: [
      { id: "sites", label: "Sites & Cameras", icon: MapIcon, hint: "BOP registry, stream health" },
      { id: "evidence", label: "Evidence Ledger", icon: ShieldCheck, hint: "Signed chain, verification and audit" },
      { id: "integration", label: "Command & Control", icon: Network, hint: "APIs, webhooks, bridges" },
    ],
  },
];

const FLAT = NAV.flatMap((g) => g.items);

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="12" cy="12" r="9.2" stroke="#16171a" strokeWidth="1.45" />
      <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" stroke="#16171a" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M6.4 15.6c2.2-3.1 3.6-4.6 5.6-4.6s3.4 1.5 5.6 4.6" stroke="#0e6d61" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="9.4" r="2.1" fill="#0e6d61" />
    </svg>
  );
}

export function SideNav() {
  const { view, setView, unread, metrics, tier } = useApp();
  const live = CAMERAS.filter((c) => c.status !== "offline").length;
  return (
    <nav className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-[232px] shrink-0 flex-col border-r border-hairline bg-paper/70 backdrop-blur-xl lg:flex">
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {NAV.map((g) => (
          <div key={g.group} className="mb-6">
            <Label className="mb-2 px-2">{g.group}</Label>
            <div className="space-y-[3px]">
              {g.items.map((it) => {
                const on = view === it.id;
                const Ico = it.icon;
                return (
                  <button
                    key={it.id}
                    onClick={() => setView(it.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-[9px] px-2 py-[7px] text-left transition-all duration-200",
                      on
                        ? "bg-white text-ink shadow-[0_1px_2px_rgba(20,22,26,.07),0_8px_18px_-14px_rgba(20,22,26,.35)] ring-1 ring-black/[0.035]"
                        : "text-ink2 hover:bg-ink/[0.035] hover:text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute -left-[7px] w-[3px] rounded-full bg-signal transition-all duration-300",
                        on ? "h-5 opacity-100" : "h-0 opacity-0",
                      )}
                    />
                    <Ico
                      size={15.5}
                      strokeWidth={1.7}
                      className={cn("shrink-0 transition-colors", on ? "text-signal" : "text-ink4 group-hover:text-ink2")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium tracking-tight">{it.label}</span>
                    </span>
                    {it.id === "events" && unread > 0 && (
                      <span className="tnum rounded-full bg-alert px-1.5 py-[1px] font-mono text-[9.5px] font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-hairline p-3">
        <div className="rounded-[11px] border border-hairline bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <Label>Inference tier</Label>
            <span className="flex items-center gap-1 font-mono text-[10px] text-signal">
              <Cpu size={11} /> {tier}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="tnum font-display text-[17px] font-semibold leading-none tracking-tight">{metrics.lat}</div>
              <div className="mt-1 text-ink3">alert ms</div>
            </div>
            <div>
              <div className="tnum font-display text-[17px] font-semibold leading-none tracking-tight">{live}</div>
              <div className="mt-1 text-ink3">of {CAMERAS.length} feeds</div>
            </div>
          </div>
          <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-ink/[0.07]">
            <div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${metrics.gpu}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-ink3">
            <span>GPU {metrics.gpu}%</span>
            <span>{metrics.vram} GB</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 px-1">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-[#3b4048] to-[#1b1e23] font-mono text-[9px] font-semibold text-white">
            RR
          </span>
          <span className="text-[11.5px] text-ink2">Lt. R. Rao · Ops-3</span>
        </div>
      </div>
    </nav>
  );
}

export function TopBar() {
  const { running, setRunning, unread, rail, setRail, setPalette, metrics, view, events, setDossierEventId } = useApp();
  const now = useNow();
  const title = FLAT.find((f) => f.id === view);
  return (
    <header className="sticky top-0 z-40 h-[52px] border-b border-hairline bg-canvas/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-full w-full max-w-[1680px] items-center gap-3 px-4">
        <div className="flex items-center gap-2.5">
          <Mark />
          <div className="leading-none">
            <div className="font-display text-[15px] font-bold tracking-[-0.02em]">IBVAP</div>
            <div className="mt-[3px] hidden text-[10px] text-ink3 xl:block">Intelligent Border Video Analytics Platform</div>
          </div>
        </div>

        <div className="ml-3 hidden items-center gap-2 md:flex">
          <span className="text-ink4">/</span>
          <span className="text-[12.5px] font-medium tracking-tight text-ink2">{title?.label}</span>
        </div>

        <button
          onClick={() => setPalette(true)}
          className="group ml-auto flex h-[30px] w-full max-w-[290px] items-center gap-2 rounded-[9px] border border-hairline bg-white/70 px-2.5 text-left transition-all hover:border-[#d2cfc8] hover:bg-white focus:ring-2 focus:ring-signal/25"
        >
          <Search size={13} className="text-ink4 group-hover:text-ink3" />
          <span className="flex-1 truncate text-[12px] text-ink4">Events, plates, faces, cameras…</span>
          <span className="flex items-center gap-[2px] rounded-[5px] bg-ink/[0.06] px-1.5 py-[2px] font-mono text-[9.5px] text-ink3">
            <Command size={8.5} /> K
          </span>
        </button>

        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="flex items-center gap-1.5 rounded-full border border-hairline bg-white px-2 py-[3px]">
            <span className={cn("h-[6px] w-[6px] rounded-full", running ? "bg-[#1fa97a] live-dot" : "bg-ink4")} />
            <span className="micro text-ink2">{running ? "ingest" : "paused"}</span>
          </span>
          <span className="tnum flex items-center gap-1.5 rounded-full border border-hairline bg-white px-2 py-[3px] font-mono text-[10px] text-ink2">
            <Gauge size={10} className="text-ink4" />
            {metrics.lat}ms
          </span>
          <span className="tnum hidden font-mono text-[10.5px] text-ink3 lg:block">{fmtClock(now)} IST</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDossierEventId(events[0]?.id ?? "latest")}
            title="Open & Download Border Surveillance Incident Report (BSIR)"
            className="hidden h-[30px] items-center gap-1.5 rounded-[9px] border border-signal/30 bg-signal-soft px-2.5 text-[11.5px] font-semibold tracking-tight text-signal transition-all hover:bg-signal hover:text-white active:scale-95 sm:inline-flex"
          >
            <FileText size={12.5} />
            <span>Incident Report</span>
          </button>
          <button
            onClick={() => setRunning(!running)}
            title="Pause / resume analysis (Space)"
            className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-hairline bg-white text-ink2 transition-all hover:text-ink active:scale-95"
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            onClick={() => setRail(!rail)}
            title="Alert stream"
            className={cn(
              "relative grid h-[30px] w-[30px] place-items-center rounded-[9px] border transition-all active:scale-95",
              rail ? "border-signal/25 bg-signal-soft text-signal" : "border-hairline bg-white text-ink2 hover:text-ink",
            )}
          >
            <BellRing size={13.5} />
            {unread > 0 && (
              <span className="tnum absolute -right-1 -top-1 rounded-full bg-alert px-[4px] font-mono text-[8.5px] font-semibold leading-[13px] text-white shadow-[0_1px_3px_rgba(217,45,32,.5)]">
                {unread}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
