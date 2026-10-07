import { useState } from "react";
import { Check, Copy, Download, Loader2, Network, PlayCircle, ShieldCheck, Webhook } from "lucide-react";
import { ENDPOINTS } from "../lib/data";
import { downloadJSONFile } from "../lib/downloads";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Bar, Btn, Card, Label, Reveal, Ring, Stat, ViewHead } from "../components/ui";

function Code({ file, lines }: { file: string; lines: [string, string][] }) {
  const { say } = useApp();
  const [ok, setOk] = useState(false);
  return (
    <div className="grain relative overflow-hidden rounded-[13px] border border-[#24272e] bg-stage">
      <div className="flex items-center justify-between border-b border-stagehair px-3 py-2">
        <span className="font-mono text-[10px] text-white/45">{file}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(lines.map((l) => l[1]).join("\n"));
            setOk(true);
            say(`${file} copied to clipboard`);
            window.setTimeout(() => setOk(false), 1600);
          }}
          className="flex items-center gap-1 rounded-[6px] px-1.5 py-[3px] font-mono text-[9.5px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          {ok ? <Check size={10} className="text-[#3ddc97]" /> : <Copy size={10} />} {ok ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[10.5px] leading-[1.65]">
        {lines.map(([tok, raw], i) => (
          <div key={i} className="flex gap-3">
            <span className="w-4 shrink-0 select-none text-right text-white/20">{i + 1}</span>
            <span
              className={cn(
                "whitespace-pre",
                tok === "k" && "text-[#7fd6c8]",
                tok === "s" && "text-white/80",
                tok === "n" && "text-[#f0b866]",
                tok === "c" && "text-white/35",
                tok === "p" && "text-white/60",
              )}
            >
              {raw}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function Integration() {
  const { say, events } = useApp();
  const [test, setTest] = useState<Record<string, "idle" | "run" | "done">>({});
  const latest = events[0];

  const payloadLines: [string, string][] = [
    ["c", "// signed with HMAC-SHA256 · retried 3× with exponential backoff"],
    ["p", "{"],
    ["k", `  "event_id": "${latest?.id ?? "E-84214"}",`],
    ["k", `  "type": "${latest?.type ?? "Fence crossing"}",`],
    ["k", `  "severity": "${latest?.sev ?? "critical"}",`],
    ["k", `  "site": "${latest?.site ?? "BOP-07"}",`],
    ["k", `  "camera": "${latest?.cam ?? "BOP-07 / CAM-01"}",`],
    ["k", `  "zone": "${latest?.zone ?? "VF-02"}",`],
    ["n", `  "confidence": ${latest?.conf ?? 0.94},`],
    ["k", `  "track_id": "${latest?.track ?? "#T-1142"}",`],
    ["n", `  "plate": ${/^[A-Z]{2}\d{2}/.test(latest?.subject ?? "") ? `"${latest?.subject}"` : "null"},`],
    ["p", `  "evidence": { "clip": "s3://ibvap-evidence/${latest?.id ?? "E-84214"}.mp4", "still": "…jpg" },`],
    ["p", `  "geo": { "lat": 31.76981, "lon": 74.90122, "bearing_deg": 186 }`],
    ["p", "}"],
  ];

  const curlLines: [string, string][] = [
    ["p", "curl -sX POST https://c2.ibvap.internal/api/v1/cameras \\"],
    ["p", '  -H "Authorization: Bearer $IBVAP_TOKEN" \\'],
    ["p", "  -H 'Content-Type: application/json' \\"],
    ["p", "  -d '{"],
    ["k", '    "rtsp": "rtsp://10.24.7.19:554/Streaming/Channels/101",'],
    ["k", '    "site": "BOP-07",'],
    ["n", '    "presets": [12, 13, 14],'],
    ["p", '    "analytics": ["detect-s", "fence", "anpr"]'],
    ["p", "  }'"],
    ["c", '# → { "camera_id": "c13", "status": "ingesting", "fps": 25 }'],
  ];

  const fire = (name: string, path: string) => {
    setTest((t) => ({ ...t, [name]: "run" }));
    window.setTimeout(() => {
      setTest((t) => ({ ...t, [name]: "done" }));
      say(`Test event delivered to ${path} · 200 OK in ${18 + Math.floor(Math.random() * 40)} ms`);
    }, 900);
  };

  return (
    <>
      <ViewHead
        kicker="Infrastructure · interoperability"
        title="Command & Control integration"
        desc="IBVAP is a producer of structured events, not another console to watch. Everything an existing C2 or VMS needs — alert payloads, evidence URIs, stream registration — is exposed over documented interfaces."
        right={
          <>
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadJSONFile("IBVAP-C2-Integration-Spec.json", {
                  platform: "IBVAP v4.2.1",
                  endpoints: ENDPOINTS,
                  sample_webhook_payload: {
                    event_id: latest?.id ?? "E-84214",
                    type: latest?.type ?? "Fence crossing",
                    severity: latest?.sev ?? "critical",
                    site: latest?.site ?? "BOP-07",
                    camera: latest?.cam ?? "BOP-07 / CAM-01",
                    confidence: latest?.conf ?? 0.94,
                  },
                });
                say("Downloaded C2 Integration Specification (.json)");
              }}
            >
              Export C2 Spec (.JSON)
            </Btn>
            <Btn icon={<Webhook size={13} />} onClick={() => say("Webhook handshake re-negotiated · HMAC secret rotated")}>
              Rotate secret
            </Btn>
            <Btn variant="primary" icon={<PlayCircle size={13} />} onClick={() => fire("all", "/api/v1/webhooks/alerts")}>
              Send test event
            </Btn>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-4">
          <Reveal>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Network size={13} className="text-signal" />
                  <Label>Connected interfaces</Label>
                </div>
                <span className="micro text-ink3">6 interfaces · 1 needs attention</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-hairline bg-paper/50">
                      {["Interface", "Protocol", "Endpoint", "p95 latency", "Throughput", "Test"].map((h) => (
                        <th key={h} className="px-3.5 py-2">
                          <Label>{h}</Label>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map((e) => (
                      <tr key={e.name} className="group border-b border-hairline/60 transition-colors last:border-0 hover:bg-ink/[0.018]">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-1.5 w-1.5 rounded-full", e.status === "connected" ? "bg-signal" : "bg-warn live-dot")} />
                            <span className="text-[12.5px] font-medium tracking-tight text-ink">{e.name}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-[10.5px] text-ink3">{e.proto}</td>
                        <td className="px-3.5 py-2.5 font-mono text-[10.5px] text-ink2">{e.path}</td>
                        <td className="tnum px-3.5 py-2.5 font-mono text-[11px]">
                          <span className={e.latency < 60 ? "text-signal" : "text-warn"}>{e.latency} ms</span>
                        </td>
                        <td className="tnum px-3.5 py-2.5 font-mono text-[11px] text-ink2">{e.rate}</td>
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            onClick={() => fire(e.name, e.path)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[7px] border px-2 py-1 font-mono text-[9.5px] transition-all active:scale-95",
                              test[e.name] === "done"
                                ? "border-signal/30 bg-signal-soft text-signal"
                                : "border-hairline bg-white text-ink3 opacity-0 group-hover:opacity-100 hover:text-ink",
                            )}
                          >
                            {test[e.name] === "run" ? <Loader2 size={10} className="animate-spin" /> : test[e.name] === "done" ? <Check size={10} /> : <PlayCircle size={10} />}
                            {test[e.name] === "done" ? "delivered" : "test"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Reveal>

          <div className="grid gap-4 lg:grid-cols-2">
            <Reveal delay={60}>
              <div>
                <Label className="mb-2">Alert payload · what your C2 receives</Label>
                <Code file="POST /webhooks/alerts" lines={payloadLines} />
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div>
                <Label className="mb-2">Bring a camera in · under a minute</Label>
                <Code file="curl · register stream" lines={curlLines} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["RTSP / ONVIF Profile S", "GB/T 28181", "Kafka · protobuf", "MQTT topic tree", "REST + gRPC", "S3 evidence vault"].map((p) => (
                    <span key={p} className="rounded-[8px] border border-hairline bg-surface px-2.5 py-1.5 font-mono text-[10px] text-ink2">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <Card hover={false} className="p-3.5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Label>Why software-defined · 67-stream sector build-out</Label>
                <span className="micro text-ink3">indicative, per the cost premise</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { t: "Smart-camera replacement", v: 6.9, c: "#d92d20", d: "₹ 6.9 lakh / channel — new optics, cabling, power and an 18-month procurement cycle" },
                  { t: "IBVAP on existing CCTV", v: 1.5, c: "#0e6d61", d: "₹ 1.5 lakh / channel equivalent — edge box, licences and calibration survey only" },
                ].map((x) => (
                  <div key={x.t} className="rounded-[11px] border border-hairline bg-paper/50 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] font-medium tracking-tight text-ink">{x.t}</span>
                      <span className="tnum font-display text-[19px] font-semibold tracking-[-0.04em]" style={{ color: x.c }}>
                        ₹ {(x.v * 67) / 100 > 0 ? ((x.v * 67) / 100).toFixed(2) : "0"} cr
                      </span>
                    </div>
                    <div className="mt-2">
                      <Bar pct={(x.v / 6.9) * 100} h={7} color={x.c} />
                    </div>
                    <p className="mt-2 text-[11px] leading-[1.5] text-ink3">{x.d}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[11px] border border-hairline bg-hairline sm:grid-cols-4">
                {[
                  ["Capex avoided", "₹ 3.6 cr"],
                  ["Optics re-used", "100 %"],
                  ["Time to first alert", "< 48 h"],
                  ["Added power / channel", "+38 W"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface px-3 py-2.5">
                    <Label>{k}</Label>
                    <div className="mt-1 font-display text-[15px] font-semibold tracking-tight text-ink">{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={60}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5">
                <Label>Bridge health</Label>
              </div>
              <div className="space-y-3 p-3.5">
                {[
                  ["Handshake success", 0.996, "%"],
                  ["Payload schema compliance", 1, "%"],
                  ["Queue drain rate", 0.91, "%"],
                  ["Evidence URI resolvable", 0.988, "%"],
                ].map(([k, v, u]) => (
                  <div key={k as string}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11.5px] tracking-tight text-ink2">{k as string}</span>
                      <span className="tnum font-mono text-[10.5px] text-ink">
                        {((v as number) * 100).toFixed(1)}
                        {u as string}
                      </span>
                    </div>
                    <Bar pct={(v as number) * 100} h={4} color={(v as number) > 0.95 ? "#0e6d61" : "#b7791f"} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-hairline bg-hairline">
                <div className="bg-surface">
                  <Stat k="Events pushed" v={(events.length * 27).toLocaleString("en-IN")} sub="rolling 24 h" />
                </div>
                <div className="bg-surface">
                  <Stat k="Retry failures" v="1" sub="watchlist sync · 310 ms" color="#b7791f" />
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={90}>
            <Card hover={false} className="p-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-signal" />
                <span className="text-[13px] font-semibold tracking-tight">Deployment posture</span>
              </div>
              <div className="mt-3 space-y-2.5">
                {[
                  ["Air-gap friendly", "offline signed model packs", 1],
                  ["Data residency", "no frame leaves the sector", 1],
                  ["Boot attestation", "TPM-signed edge chain", 0.8],
                  ["Audit trail", "append-only operator log", 1],
                ].map(([k, d, v], i) => (
                  <div key={k as string} className="flex items-center gap-2.5">
                    <Ring
                      pct={v as number}
                      size={28}
                      color={(v as number) > 0.9 ? "#0e6d61" : "#b7791f"}
                      label={i === 2 ? <span className="text-[8px]">80</span> : <Check size={10} />}
                    />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium tracking-tight text-ink">{k as string}</div>
                      <div className="truncate text-[10.5px] text-ink3">{d as string}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] leading-[1.5] text-ink3">
                Outbound payloads carry sealed evidence URIs, never raw pixels — the existing VMS stays the system of record for video.
              </p>
            </Card>
          </Reveal>
        </div>
      </div>
    </>
  );
}
