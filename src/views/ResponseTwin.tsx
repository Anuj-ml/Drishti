import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Route, ShieldAlert, Siren, Target } from "lucide-react";
import { ResponseMap } from "../components/ResponseMap";
import {
  INTERCEPT_OPTIONS,
  PATROLS,
  SUBJECT,
  computeIntercept,
  fmtDuration,
} from "../lib/incident";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Btn, Label, Reveal, Segmented, Slider, ViewHead } from "../components/ui";

type OptionId = "auto" | "gate6" | "emb" | "chk";

function TimeBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-white/55">{label}</span>
        <span className="tnum font-mono text-[11px] text-white/85">{fmtDuration(value)}</span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-white/[.09]">
        <div className="h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function ResponseTwin() {
  const app = useApp();
  const [patrolId, setPatrolId] = useState(PATROLS[0].id);
  const [optionId, setOptionId] = useState<OptionId>("auto");
  const [standoff, setStandoff] = useState(60);
  const [speed, setSpeed] = useState(SUBJECT.speedKmh);
  const [taskedAt, setTaskedAt] = useState<string | null>(null);

  const patrol = PATROLS.find((p) => p.id === patrolId) ?? PATROLS[0];
  const option = optionId === "auto" ? null : INTERCEPT_OPTIONS.find((o) => o.id === optionId) ?? null;
  const subject = useMemo(() => ({ ...SUBJECT, speedKmh: speed }), [speed]);

  const plan = useMemo(
    () => computeIntercept(subject, patrol, {
      standoffM: standoff,
      targetPoint: option?.point,
      pointName: option?.name,
      routeName: option ? `${patrol.routeName} / ${option.name}` : patrol.routeName,
    }),
    [subject, patrol, standoff, option],
  );

  const allOptions = useMemo(() => INTERCEPT_OPTIONS.map((candidate) => ({
    ...candidate,
    plan: computeIntercept(subject, patrol, {
      standoffM: standoff,
      targetPoint: candidate.point,
      pointName: candidate.name,
      routeName: `${patrol.routeName} / ${candidate.name}`,
    }),
  })), [subject, patrol, standoff]);

  const bestOption = useMemo(() => [...allOptions]
    .filter((candidate) => candidate.plan?.feasible)
    .sort((a, b) => (b.plan?.marginSec ?? 0) - (a.plan?.marginSec ?? 0))[0] ?? null,
  [allOptions]);

  useEffect(() => { setTaskedAt(null); }, [patrolId, optionId, standoff, speed]);

  const saveTasking = () => {
    if (!plan?.feasible) return;
    const timestamp = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTaskedAt(timestamp);
    app.say(`Local tasking draft saved for ${patrol.callsign} / ${plan.pointName}`);
  };

  return (
    <>
      <ViewHead
        kicker="Operations / response digital twin"
        title="Intercept, planned."
        desc="A geographic planning context for the projected subject path, growing uncertainty and the first point a patrol could reach in time. Scenario positions are illustrative."
        right={
          <>
            <Btn icon={<Route size={13} />} onClick={() => app.setView("incident")}>Back to Incident Graph</Btn>
            <Btn variant="primary" icon={<Siren size={13} />} onClick={saveTasking} className={cn(!plan?.feasible && "pointer-events-none opacity-40")}>
              {taskedAt ? "Tasking draft saved" : "Prepare tasking"}
            </Btn>
          </>
        }
      />

      <Reveal>
        <ResponseMap patrol={patrol} subject={subject} plan={plan} selectedOption={optionId} onPickOption={setOptionId} />
      </Reveal>

      {/* Controls are one interaction band, not a second dashboard. */}
      <Reveal delay={55}>
        <div className="mt-4 grid gap-x-5 gap-y-4 rounded-[14px] border border-hairline bg-surface px-4 py-4 lg:grid-cols-[auto_auto_minmax(120px,1fr)_minmax(120px,1fr)] lg:items-end">
          <div className="min-w-0 overflow-x-auto">
            <Label className="mb-2.5">Responding unit</Label>
            <Segmented
              value={patrolId}
              onChange={setPatrolId}
              options={PATROLS.map((p) => ({ value: p.id, label: p.callsign.replace("Patrol ", "").replace("Post ", "") }))}
            />
          </div>
          <div className="min-w-0 overflow-x-auto">
            <Label className="mb-2.5">Meet point</Label>
            <Segmented
              value={optionId}
              onChange={setOptionId}
              options={[
                { value: "auto", label: "First viable" },
                { value: "gate6", label: "Gate 6" },
                { value: "emb", label: "Canal" },
                { value: "chk", label: "District rd" },
              ]}
            />
          </div>
          <Slider label="Subject speed" value={speed} min={10} max={80} step={1} onChange={setSpeed} fmt={(v) => `${v} km/h`} accent="#d92d20" />
          <Slider label="Safety standoff" value={standoff} min={15} max={250} step={5} onChange={setStandoff} fmt={(v) => `${v} m`} accent="#0e6d61" />
        </div>
      </Reveal>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Reveal delay={85}>
          <div className="min-h-[380px] rounded-[16px] border border-[#303b33] bg-[#1b2420] p-5 text-white sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Target size={14} className="text-[#90d7b8]" /><span className="micro text-white/50">01 / Intercept decision</span></div>
              <span className={cn("micro rounded-full px-2 py-1", plan?.feasible ? "bg-[#2e765b] text-[#d0f2df]" : "bg-[#754039] text-[#ffcbc4]")}>
                {plan?.feasible ? "arrival before subject" : "not reachable"}
              </span>
            </div>

            {plan && (
              <>
                <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <div className={cn("tnum font-display text-[76px] leading-[.9] tracking-[-.085em] sm:text-[88px]", plan.feasible ? "text-[#ddf2df]" : "text-[#ffaaa0]")}>
                      {plan.marginSec >= 0 ? "+" : ""}{Math.round(plan.marginSec)}<span className="ml-1 text-[30px] tracking-[-.04em] text-white/50">s</span>
                    </div>
                    <p className="mt-3 text-[12.5px] text-white/65">
                      {plan.feasible ? "Arrival margin at" : "Patrol arrives too late at"} <span className="font-semibold text-white">{plan.pointName}</span>
                    </p>
                  </div>
                  <div className="ml-auto pb-1 text-right">
                    <div className="font-mono text-[11px] text-white/75">{patrol.callsign}</div>
                    <div className="mt-1 text-[10.5px] text-white/40">{patrol.strength} / {patrol.role}</div>
                  </div>
                </div>

                <div className="mt-7 space-y-4 border-t border-white/10 pt-5">
                  <TimeBar label="Subject arrives" value={plan.etaSubjectSec} max={Math.max(plan.etaSubjectSec, plan.etaPatrolSec) * 1.1} color="#f07467" />
                  <TimeBar label="Patrol arrives (direct-line bound)" value={plan.etaPatrolSec} max={Math.max(plan.etaSubjectSec, plan.etaPatrolSec) * 1.1} color="#6acda7" />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/10 pt-4 sm:grid-cols-4">
                  {[
                    ["Travel to meet", `${Math.round(plan.distanceM)} m`],
                    ["Uncertainty at meet", `${Math.round(plan.uncertaintyAtInterceptM)} m`],
                    ["Safety standoff", `${plan.standoffM} m`],
                    ["Planning score", `${Math.round(plan.probability * 100)}%`],
                  ].map(([label, value]) => (
                    <div key={label}><div className="micro text-white/40">{label}</div><div className="tnum mt-1.5 font-mono text-[12px] font-medium text-white/85">{value}</div></div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={110}>
          <div className="h-full rounded-[16px] border border-hairline bg-surface">
            <div className="border-b border-hairline px-4 py-3.5">
              <Label>02 / Alternate meet points</Label>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-ink2">Select a named location here or directly on the map.</p>
            </div>
            <div className="divide-y divide-hairline px-2">
              {allOptions.map((candidate, index) => {
                const selected = optionId === candidate.id;
                const candidatePlan = candidate.plan;
                return (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() => setOptionId(candidate.id as OptionId)}
                    className={cn("flex w-full items-start gap-3 rounded-[9px] px-2 py-3.5 text-left transition-colors", selected ? "bg-signal-soft/60" : "hover:bg-ink/[.025]")}
                  >
                    <span className={cn("tnum grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[9px]", selected ? "border-signal/30 bg-white text-signal" : "border-hairline text-ink3")}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold tracking-tight text-ink">{candidate.name}</span>
                      <span className="mt-0.5 block text-[10.5px] text-ink3">{candidate.note}</span>
                      <span className="mt-2 block font-mono text-[9.5px] text-ink3">
                        PATROL {candidatePlan ? fmtDuration(candidatePlan.etaPatrolSec) : "--"} / SUBJECT {candidatePlan ? fmtDuration(candidatePlan.etaSubjectSec) : "--"}
                      </span>
                    </span>
                    <span className={cn("tnum shrink-0 font-mono text-[11px] font-semibold", candidatePlan?.feasible ? "text-signal" : "text-alert")}>
                      {candidatePlan?.feasible ? `+${Math.round(candidatePlan.marginSec)}s` : "late"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-hairline px-4 py-3 text-[10.5px] leading-[1.5] text-ink3">
              A route to a choke point is a planning assumption; field travel time must be confirmed before dispatch.
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={135}>
        <div className="mt-5 grid gap-5 border-t border-hairline py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-2"><ShieldAlert size={14} className="text-signal" /><Label>What the planner recommends</Label></div>
            <p className="mt-2.5 text-[13px] leading-[1.6] text-ink2">
              {plan?.feasible
                ? `${patrol.callsign} can reach ${plan.pointName} with an estimated ${Math.round(plan.marginSec)}-second lead. Maintain a ${standoff} m safety standoff and visually confirm the subject before committing the unit.`
                : `This unit cannot reach the selected point in time. Request a second unit or review ${bestOption?.name ?? "the district road junction"} as an alternate intercept.`}
            </p>
            {taskedAt && <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] text-signal"><Check size={12} />Local tasking draft saved at {taskedAt} / no command-channel delivery</p>}
          </div>
          <div>
            <div className="flex items-center gap-2"><Clock3 size={14} className="text-alert" /><Label>What could change the answer</Label></div>
            <p className="mt-2.5 text-[13px] leading-[1.6] text-ink2">
              The positional uncertainty grows from {SUBJECT.uncertaintyM} m at roughly {SUBJECT.growthPerSec} m/s. The green patrol line is a straight-line <em>lower bound</em>, not a navigable road route. Re-check the plan against local roads, gates, terrain and live patrol location.
            </p>
          </div>
        </div>
      </Reveal>
    </>
  );
}