import { useMemo, useState } from "react";
import { BadgeCheck, Download, ScanFace, ShieldAlert, UserPlus, Waves } from "lucide-react";
import { CAM_BY_ID, CAMERAS, FACES } from "../lib/data";
import { downloadFrsMatchPDF, runDownloadTask } from "../lib/downloads";
import { hash, rng } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Ring, Segmented, Slider, ViewHead } from "../components/ui";

const GALLERIES = ["Watchlist-Δ", "Staff whitelist", "Convoy drivers", "Unenrolled"] as const;

export function Faces() {
  const { camId, setCamId, world, overlays, minConf, say, night } = useApp();
  const [gallery, setGallery] = useState<(typeof GALLERIES)[number]>("Watchlist-Δ");
  const [thresh, setThresh] = useState(0.82);
  const [liveness, setLiveness] = useState(true);
  const [pick, setPick] = useState(0);

  // Manual face labels only: top-down, low-angle-leg and night feeds carry no
  // faceScore, so no probes are hallucinated where no face is visible.
  const enriched = useMemo(() => world[camId] ?? [], [world, camId]);
  const faceTracks = useMemo(() => enriched.filter((t) => (t.faceScore ?? 0) > 0.3), [enriched]);
  const active = faceTracks[pick % Math.max(1, faceTracks.length)] ?? null;
  const cam = CAM_BY_ID[camId];

  const candidates = useMemo(() => {
    const r = rng(hash((active?.id ?? "probe") + gallery));
    return FACES.map((f) => ({
      ...f,
      score: active ? Math.min(0.99, Math.max(0.18, f.score * (0.72 + r() * 0.5))) : f.score,
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [active, gallery]);

  const fx = { bright: night.bright, contrast: night.contrast, saturate: night.saturate, blur: night.blur, ir: night.ir, grain: night.grain };

  return (
    <>
      <ViewHead
        kicker="Intelligence · FRS"
        title="Face detection & recognition"
        desc="A detector finds faces worth matching — pose, resolution and blur gates run before the embedding model is ever called. No dedicated recognition hardware is required; the same CCTV frames feed the pipeline."
        right={
          <>
            <Segmented
              value={gallery}
              onChange={(v) => setGallery(v)}
              options={GALLERIES.map((g) => ({ value: g, label: g }))}
            />
            <Btn
              icon={<Download size={13} />}
               onClick={() => {
                 const top = candidates[0] ?? FACES[0];
                 runDownloadTask(() => downloadFrsMatchPDF(top, gallery, thresh), say, `IBVAP-FRS-Match-${top.id}.pdf`);
               }}
            >
              FRS Match Dossier (.PDF)
            </Btn>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_384px]">
        <div className="space-y-4">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <CameraFrame
                cam={cam}
                tracks={enriched}
                minConf={minConf}
                overlays={{ ...overlays, boxes: true, faces: true, plates: false, labels: true }}
                fx={fx}
              />
              <div className="on-stage flex flex-wrap items-center gap-3 border-t border-stagehair bg-[#111318]/95 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <ScanFace size={13} className="text-face" />
                  <span className="font-mono text-[10.5px] text-white/70">
                    {faceTracks.length} face-quality {faceTracks.length === 1 ? "probe" : "probes"} in frame
                  </span>
                </div>
                {faceTracks.length > 1 && (
                  <div className="flex items-center gap-1">
                    {faceTracks.map((t, i) => (
                      <button
                        key={t.key}
                        onClick={() => setPick(i)}
                        className={cn(
                          "rounded-[6px] px-1.5 py-[3px] font-mono text-[10px] transition-colors",
                          i === pick ? "bg-white text-ink" : "bg-white/10 text-white/60 hover:bg-white/20"
                        )}
                      >
                        {t.id}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <div className="w-[150px]">
                    <Slider
                      dark
                      accent="#69d6c6"
                      label="Match threshold"
                      value={thresh}
                      min={0.6}
                      max={0.98}
                      step={0.005}
                      onChange={setThresh}
                      fmt={(v) => v.toFixed(3)}
                    />
                  </div>
                  <button
                    onClick={() => setLiveness(!liveness)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-[8px] border px-2 text-[11.5px] transition-colors",
                      liveness ? "border-white/20 bg-white/[0.14] text-white" : "border-white/10 bg-white/[0.04] text-white/45",
                    )}
                  >
                    <Waves size={11.5} /> Liveness
                  </button>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-[236px_minmax(0,1fr)]">
            <Reveal delay={60}>
              <Card hover={false} className="flex h-full items-center gap-4 p-4">
                <Ring pct={active ? (active.faceScore ?? 0.6) : 0} size={66} color="#21b8a2" track="rgba(33,184,162,.14)" label={<span className="text-[13px]">{active ? `${((active.faceScore ?? 0) * 100).toFixed(0)}` : "—"}</span>} />
                <div className="min-w-0">
                  <Label>Probe quality</Label>
                  <div className="mt-1 text-[13px] font-medium tracking-tight text-ink">
                    {active ? `${active.faceScore!.toFixed(2)} · ${active.w.toFixed(0)}×${active.h.toFixed(0)} px crop` : "No eligible face"}
                  </div>
                  <p className="mt-1 text-[11.5px] leading-[1.45] text-ink3">
                    {active
                      ? "Yaw within gate, blur score 0.71, IRF liveness passed."
                      : "Pose gate rejects profiles beyond 55° yaw — raise detector confidence or re-cue PTZ."}
                  </p>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card hover={false} className="p-0">
                <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                  <Label>Top candidates · {gallery}</Label>
                  <span className="micro text-ink3">512-d cosine</span>
                </div>
                <div className="divide-y divide-hairline">
                  {candidates.map((c, i) => {
                    const pass = c.score >= thresh;
                    return (
                      <div key={c.id} className={cn("flex items-center gap-3 px-3.5 py-2.5 transition-colors", pass && "bg-signal-soft/50")}>
                        <span className="tnum w-4 shrink-0 font-mono text-[11px] text-ink4">{i + 1}</span>
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[8px] bg-stage3">
                          <img src={c.img} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: `${28 + i * 9}% 34%` }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12.5px] font-medium tracking-tight text-ink">{c.id}</span>
                            {pass && <BadgeCheck size={12} className="text-signal" />}
                            {c.status.includes("Watch") && <ShieldAlert size={12} className="text-alert" />}
                          </div>
                          <div className="truncate text-[11.5px] text-ink3">{c.label} · {c.obs} sightings</div>
                        </div>
                        <div className="w-[92px] shrink-0">
                          <div className="tnum mb-1 text-right font-mono text-[11px] text-ink">{c.score.toFixed(3)}</div>
                          <Bar pct={c.score * 100} h={4} color={pass ? "#0e6d61" : "#aaaeb4"} />
                        </div>
                        <Btn
                          size="sm"
                          variant={pass ? "primary" : "quiet"}
                           onClick={() => runDownloadTask(
                             () => downloadFrsMatchPDF(c, gallery, thresh),
                             say,
                             `IBVAP-FRS-Match-${c.id}.pdf`,
                           )}
                        >
                          {pass ? "Confirm & PDF" : "Dossier PDF"}
                        </Btn>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-hairline px-3.5 py-2.5">
                  <span className="text-[11.5px] text-ink3">Gallery size 1 482 enrolments · search latency 9 ms</span>
                  <Btn size="sm" icon={<UserPlus size={12} />} onClick={() => say("Probe enrolled as unenrolled-clone · pending BSO verification")}>
                    Enrol probe
                  </Btn>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>

        <Reveal delay={120}>
          <Card hover={false} className="h-full p-0">
            <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
              <Label>Recent matches</Label>
              <span className="micro text-signal">live</span>
            </div>
            <div className="divide-y divide-hairline">
              {FACES.map((f) => (
                <article key={f.id} className="flex gap-3 px-3.5 py-3 transition-colors hover:bg-ink/[0.02]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-stage3">
                    <img src={f.img} alt="" loading="lazy" className="kb h-full w-full object-cover" style={{ objectPosition: "40% 30%" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold tracking-tight text-ink">{f.id}</span>
                      <span className={cn("tnum font-mono text-[11px]", f.score > 0.85 ? "text-signal" : f.score > 0.5 ? "text-warn" : "text-ink4")}>
                        {f.score.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-ink2">{f.label}</div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[9.5px] text-ink3">
                      <span>{f.cam}</span>
                      <span className="text-ink4">·</span>
                      <span>{f.t}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "micro rounded-full px-1.5 py-[3px]",
                          f.status.includes("Watch")
                            ? "bg-alert-soft text-[#a92318]"
                            : f.status.includes("No") || f.status.includes("Quality")
                              ? "bg-ink/[0.05] text-ink3"
                              : "bg-signal-soft text-signal",
                        )}
                      >
                        {f.status}
                      </span>
                      <span className="micro text-ink4">{f.angle}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="border-t border-hairline p-3.5">
              <Label className="mb-2">Re-cue camera</Label>
              <div className="flex flex-wrap gap-1">
                {CAMERAS.filter((c) => c.models.includes("frs")).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCamId(c.id);
                      setPick(0);
                    }}
                    className={cn(
                      "rounded-[7px] border px-2 py-1 font-mono text-[10px] transition-colors",
                      c.id === camId ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink2 hover:border-[#cfccc5]",
                    )}
                  >
                    {c.code.split(" / ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </>
  );
}
