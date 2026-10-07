import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Download, Flag, Radio } from "lucide-react";
import { CAMERAS } from "../lib/data";
import { downloadIncidentReportPDF, runDownloadTask } from "../lib/downloads";
import { ago } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Label, Segmented, SevPill } from "./ui";

const SEV_BAR: Record<string, string> = {
  critical: "bg-alert",
  high: "bg-person",
  medium: "bg-warn",
  low: "bg-ink4",
};

export function AlertRail() {
  const { events, act, setView, setOpenEvent, rail, setRail, running, world, reportNotes, say } = useApp();
  const [f, setF] = useState<"all" | "new" | "critical">("all");

  const list = useMemo(() => {
    const e = events.filter(
      (x) => (f === "all" ? true : f === "new" ? x.status === "new" : x.sev === "critical" || x.sev === "high"),
    );
    return e.slice(0, 24);
  }, [events, f]);

  if (!rail) return null;

  return (
    <aside className="slidein sticky top-[52px] hidden h-[calc(100vh-52px)] w-[318px] shrink-0 flex-col border-l border-hairline bg-paper/60 backdrop-blur-xl xl:flex">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio size={12.5} className={cn("text-signal", running && "live-dot")} />
          <span className="font-display text-[13px] font-semibold tracking-tight">Alert stream</span>
        </div>
        <button
          onClick={() => setRail(false)}
          className="rounded-[6px] px-1.5 py-0.5 text-[11px] text-ink3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
        >
          hide
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <Segmented
          value={f}
          onChange={setF}
          options={[
            { value: "all", label: "All" },
            { value: "new", label: "Unacked" },
            { value: "critical", label: "Sev 1–2" },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-[5px]">
          {list.map((e, i) => (
            <article
              key={e.id}
              className={cn(
                "group relative overflow-hidden rounded-[11px] border bg-white p-2.5 pl-3 transition-all duration-200",
                i === 0 && e.status === "new" ? "border-alert/25 shadow-[0_10px_24px_-18px_rgba(217,45,32,.6)]" : "border-hairline",
                "hover:-translate-y-[1px] hover:border-[#d8d5cf] hover:shadow-lift",
              )}
              onClick={() => {
                setView("events");
                setOpenEvent(e.id);
              }}
            >
              <span className={cn("absolute inset-y-0 left-0 w-[3px]", SEV_BAR[e.sev])} />
              <div className="mb-1 flex items-center justify-between gap-2">
                <SevPill sev={e.sev} />
                <span className="tnum font-mono text-[9.5px] text-ink4">{ago(e.t)} ago</span>
              </div>
              <div className="text-[12.5px] font-medium leading-snug tracking-tight text-ink">{e.type}</div>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-ink3">
                <span>{e.cam}</span>
                <span className="text-ink4">·</span>
                <span className="tnum">c {(e.conf * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-[1.45] text-ink2">{e.summary}</p>
              <div className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    act(e.id, "ack");
                  }}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] text-[10.5px] text-ink2 transition-colors hover:border-signal/30 hover:bg-signal-soft hover:text-signal"
                >
                  <Check size={10} /> ack
                </button>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    act(e.id, "dispatched");
                  }}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] text-[10.5px] text-ink2 transition-colors hover:border-person/40 hover:bg-[#fdf0e9] hover:text-person"
                >
                  <Flag size={10} /> dispatch
                </button>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const c = CAMERAS.find((x) => x.code === e.cam) ?? CAMERAS[0];
                    runDownloadTask(
                      () => downloadIncidentReportPDF(e, c, world[c.id] ?? [], reportNotes[e.id] ?? ""),
                      say,
                      `IBVAP-Incident-Report-${e.id}.pdf`,
                    );
                  }}
                  className="flex items-center gap-1 rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] text-[10.5px] text-signal transition-colors hover:border-signal/35 hover:bg-signal-soft"
                  title="Download BSIR Incident Report PDF"
                >
                  <Download size={10} /> PDF
                </button>
                <span className="ml-auto flex items-center gap-0.5 text-[10.5px] text-signal">
                  open <ArrowUpRight size={11} />
                </span>
              </div>
            </article>
          ))}
          {list.length === 0 && (
            <div className="mt-10 px-4 text-center">
              <Label>Queue clear</Label>
              <p className="mt-2 text-[12px] text-ink3">No events match this filter. The rule engine keeps writing here.</p>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setView("events")}
        className="flex items-center justify-between border-t border-hairline px-4 py-3 text-left transition-colors hover:bg-white"
      >
        <span>
          <Label>Full ledger</Label>
          <div className="mt-1 text-[12px] font-medium tracking-tight text-ink">{events.length} events retained · 30-day evidence policy</div>
        </span>
        <ChevronRight size={15} className="text-ink4" />
      </button>
    </aside>
  );
}

export function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="rise flex items-center gap-2 rounded-full border border-white/10 bg-[#1b1e23]/92 px-3.5 py-2 text-[12.5px] text-white shadow-float backdrop-blur-xl">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[#3ddc97]/20">
          <Check size={10} className="text-[#3ddc97]" />
        </span>
        {toast}
      </div>
    </div>
  );
}
