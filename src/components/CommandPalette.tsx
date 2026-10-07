import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Play, Search, ShieldCheck, Waypoints } from "lucide-react";
import { CAMERAS } from "../lib/data";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { NAV } from "./Chrome";
import { Label } from "./ui";

type Row = { id: string; label: string; sub: string; group: string; run: () => void; cam?: string };

export function CommandPalette() {
  const { palette, setPalette, setView, setCamId, camId, setRunning, running, say, setRail, saveZone, zones, events, setDossierEventId } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of NAV)
      for (const it of g.items)
        out.push({
          id: `v-${it.id}`,
          label: it.label,
          sub: it.hint,
          group: "Views",
          run: () => setView(it.id),
        });
    for (const c of CAMERAS)
      out.push({
        id: `c-${c.id}`,
        label: c.code,
        sub: `${c.name} · ${c.site}`,
        group: "Cameras",
        cam: c.id,
        run: () => {
          setCamId(c.id);
          setView("live");
        },
      });
    out.push({
      id: "a-bsir",
      label: "Open & Download Incident Report (BSIR Dossier)",
      sub: `Official PDF / ZIP / HTML report for ${events[0]?.id ?? "latest incident"}`,
      group: "Actions",
      run: () => setDossierEventId(events[0]?.id ?? "latest"),
    });
    out.push({
      id: "a-pause",
      label: running ? "Pause live analysis" : "Resume live analysis",
      sub: "Shortcut: Space",
      group: "Actions",
      run: () => {
        setRunning(!running);
        say(running ? "Ingest paused — frame buffers retained" : "Ingest resumed at 46 fps/stream");
      },
    });
    out.push({
      id: "a-rail",
      label: "Toggle alert stream",
      sub: "Right rail · unacked events",
      group: "Actions",
      run: () => setRail(true),
    });
    out.push({
      id: "a-zones",
      label: "Arm all virtual fences",
      sub: `${zones.length} zones · rule engine IBV-Fence`,
      group: "Actions",
      run: () => {
        zones.forEach((z) => !z.enabled && saveZone({ ...z, enabled: true }));
        say(`All ${zones.length} virtual fences armed`);
      },
    });
    return out.filter(
      (r) =>
        !q.trim() ||
        r.label.toLowerCase().includes(q.toLowerCase()) ||
        r.sub.toLowerCase().includes(q.toLowerCase()) ||
        r.group.toLowerCase().includes(q.toLowerCase()),
    );
  }, [q, running, setCamId, setRail, setRunning, setView, say, saveZone, zones]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    if (!palette) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel, palette]);

  if (!palette) return null;
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center bg-[#101114]/28 px-4 pt-[12vh] backdrop-blur-[3px]"
      onClick={() => setPalette(false)}
    >
      <div
        className="rise h-fit w-full max-w-[600px] overflow-hidden rounded-[16px] border border-white/40 bg-surface/95 shadow-float backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4">
          <Search size={15} className="text-ink4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, rows.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                rows[sel]?.run();
                setPalette(false);
              }
            }}
            placeholder="Jump to view, camera or run an action…"
            className="h-12 flex-1 bg-transparent text-[14px] tracking-tight text-ink outline-none placeholder:text-ink4"
          />
          <span className="micro rounded-full bg-ink/[0.05] px-2 py-1 text-ink3">esc</span>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <Label className="px-2 py-1.5">{g}</Label>
              {rows
                .filter((r) => r.group === g)
                .map((r) => {
                  const i = rows.indexOf(r);
                  return (
                    <button
                      key={r.id}
                      data-i={i}
                      onMouseEnter={() => setSel(i)}
                      onClick={() => {
                        r.run();
                        setPalette(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[9px] px-2 py-2 text-left transition-colors",
                        sel === i ? "bg-ink text-white" : "hover:bg-ink/[0.04]",
                      )}
                    >
                      {r.cam ? (
                        <span
                          className={cn(
                            "micro grid h-6 shrink-0 place-items-center rounded-[7px] px-2",
                            sel === i ? "bg-white/12 text-white/80" : "bg-ink/[0.04] text-ink3",
                          )}
                        >
                          {r.cam === camId ? "live" : "feed"}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-[7px]",
                            sel === i ? "bg-white/12 text-white" : "bg-ink/[0.05] text-ink3",
                          )}
                        >
                          {g === "Actions" ? <Play size={11} /> : g === "Views" ? <ShieldCheck size={12} /> : <Waypoints size={12} />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium tracking-tight">{r.label}</span>
                        <span className={cn("block truncate text-[11.5px]", sel === i ? "text-white/60" : "text-ink3")}>{r.sub}</span>
                      </span>
                      {sel === i && <CornerDownLeft size={13} className="shrink-0 text-white/60" />}
                    </button>
                  );
                })}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-3 py-10 text-center">
              <Label>No matches</Label>
              <p className="mt-2 text-[12.5px] text-ink3">Try “ANPR”, “fence”, “BOP-07” or “pause”.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
