import { useState } from "react";
import { AlertTriangle, Download, Fingerprint, KeyRound, Link2, Lock, PenLine, ShieldCheck } from "lucide-react";
import { exportBundle, idbClear, tamperEntry } from "../lib/ledger";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { triggerDownload } from "../lib/downloads";
import { Btn, Card, Label, Reveal, Stat, ViewHead } from "../components/ui";

export function Evidence() {
  const { ledger, ledgerVerify, refreshLedger, verifyLedgerNow, say, events } = useApp();
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  const signFrame = async () => {
    setBusy(true);
    const { appendEntry } = await import("../lib/ledger");
    await appendEntry("frame", `${events[0]?.id ?? "frame"}|${new Date().toISOString()}`);
    await refreshLedger();
    setBusy(false);
    say("Frame digest signed and appended");
  };

  const exportLedger = async () => {
    const bundle = await exportBundle();
    triggerDownload(
      new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
      `IBVAP-Evidence-Ledger-${new Date().toISOString().slice(0, 10)}.json`,
    );
    say("Ledger and public key exported");
  };

  const verify = async () => {
    await verifyLedgerNow();
    setRan(true);
  };

  const kinds: Record<string, string> = { frame: "frame digest", action: "operator action", evidence: "evidence record" };
  const verified = ledgerVerify?.ok === true;

  return (
    <>
      <ViewHead
        kicker="Infrastructure / integrity"
        title="Evidence ledger"
        desc="Frame digests, evidence records and operator actions appended to a SHA-256 hash chain, each signed with the node key. Verify recomputes the chain and checks every signature."
        right={
          <>
            <Btn icon={<Fingerprint size={13} />} onClick={signFrame} disabled={busy}>
              {busy ? "Signing…" : "Sign frame digest"}
            </Btn>
            <Btn icon={<Download size={13} />} onClick={exportLedger}>
              Export ledger + public key
            </Btn>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-hairline bg-hairline lg:grid-cols-4">
        <div className="bg-surface">
          <Stat k="Chain entries" v={ledger.length} sub={`tip ${ledger.at(-1)?.chainHash.slice(0, 8) ?? "—"}`} />
        </div>
        <div className="bg-surface">
          <Stat k="Node key" v={ledger[0]?.keyId?.slice(0, 8) ?? "—"} sub="ECDSA P-256" />
        </div>
        <div className="bg-surface">
          <Stat
            k="Verification"
            v={ran ? (verified ? "intact" : "broken") : "not run"}
            sub={ran ? `${ledgerVerify?.brokenSignatures.length ?? 0} bad signatures` : "run to check the chain"}
            tone={ran ? (verified ? "signal" : "alert") : "ink"}
          />
        </div>
        <div className="bg-surface">
          <Stat k="Operator actions" v={ledger.filter((e) => e.kind === "action").length} sub="append-only audit trail" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Reveal>
          <Card hover={false} className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-signal" />
                <span className="text-[14px] font-semibold tracking-tight">Hash chain</span>
              </div>
              <div className="flex items-center gap-2">
                {ran && ledgerVerify && (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2 py-[4px] font-mono text-[10px]",
                      verified ? "bg-signal-soft text-signal" : "bg-alert-soft text-alert",
                    )}
                  >
                    {verified ? <ShieldCheck size={11} /> : <AlertTriangle size={11} />}
                    {verified ? "verified" : `broken at ${ledgerVerify.firstBroken}`}
                  </span>
                )}
                <Btn icon={<ShieldCheck size={12} />} onClick={verify}>
                  Verify
                </Btn>
              </div>
            </div>

            <div className="max-h-[520px] divide-y divide-hairline overflow-y-auto">
              {[...ledger].reverse().map((e) => {
                const brokenSig = ledgerVerify?.brokenSignatures.includes(e.seq);
                const brokenChain = ran && ledgerVerify?.firstBroken !== null && e.seq >= (ledgerVerify?.firstBroken ?? 0);
                return (
                  <div key={e.seq} className={cn("px-4 py-3", brokenSig && "bg-alert-soft/50")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/[0.05] font-mono text-[10px] text-ink2">
                          {e.seq}
                        </span>
                        <span className="micro rounded-full bg-ink/[0.04] px-2 py-[3px] text-ink2">{kinds[e.kind] ?? e.kind}</span>
                        <span className="truncate text-[12px] tracking-tight text-ink">{e.payload}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[9.5px] text-ink4">
                        {new Date(e.ts).toLocaleTimeString("en-GB", { hour12: false })}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 pl-8 font-mono text-[9.5px] sm:grid-cols-3">
                      <div>
                        <div className="text-ink4">prev</div>
                        <div className={cn("truncate", brokenChain && e.seq === ledgerVerify?.firstBroken ? "text-alert" : "text-ink3")}>
                          {e.prevHash.slice(0, 20)}…
                        </div>
                      </div>
                      <div>
                        <div className="text-ink4">chain</div>
                        <div className="truncate text-ink2">{e.chainHash.slice(0, 20)}…</div>
                      </div>
                      <div>
                        <div className="text-ink4">signature</div>
                        <div className={cn("truncate", brokenSig ? "text-alert" : "text-ink3")}>{e.sig.slice(0, 20)}…</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {ledger.length === 0 && (
                <div className="px-4 py-14 text-center">
                  <Label>Chain empty</Label>
                  <p className="mt-2 text-[12.5px] text-ink2">
                    Sign a frame digest or perform an operator action — each writes a signed, chained entry.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={80}>
            <Card hover={false} className="p-4">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-signal" />
                <span className="text-[13px] font-semibold tracking-tight">Signing model</span>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ["Algorithm", "ECDSA P-256"],
                  ["Digest", "SHA-256"],
                  ["Chain", "prevHash ‖ frameHash ‖ payload"],
                  ["Key custody", "browser IndexedDB (demo)"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1.5 last:border-0">
                    <span className="shrink-0 text-[11px] text-ink3">{k}</span>
                    <span className="truncate font-mono text-[10px] text-ink">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-[1.5] text-ink3">
                <strong className="text-ink2">Demonstration limit:</strong> a browser cannot protect a private key. Production must sign on an HSM/TPM or on the edge node. The chain mechanism itself is real.
              </p>
            </Card>
          </Reveal>

          <Reveal delay={110}>
            <Card hover={false} className="p-4">
              <div className="flex items-center gap-2">
                <PenLine size={14} className="text-alert" />
                <span className="text-[13px] font-semibold tracking-tight">Tamper demonstration</span>
              </div>
              <p className="mt-2 text-[11px] leading-[1.5] text-ink3">
                Edit an entry's payload, then verify. The chain recomputation fails at that entry and its signature stops matching — that is the detection working.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Btn
                  size="sm"
                  onClick={async () => {
                    const target = ledger.at(-1);
                    if (target) {
                      await tamperEntry(target.seq);
                      await refreshLedger();
                      say(`Entry ${target.seq} edited — verify to detect`);
                    }
                  }}
                >
                  Edit newest
                </Btn>
                <Btn
                  size="sm"
                  onClick={async () => {
                    await idbClear("entries");
                    await refreshLedger();
                    setRan(false);
                    say("Chain reset");
                  }}
                >
                  Reset chain
                </Btn>
              </div>
              <div className="mt-2">
                <Btn size="sm" variant="primary" className="w-full" onClick={verify} icon={<ShieldCheck size={11} />}>
                  Verify integrity now
                </Btn>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={140}>
            <div className="rounded-[13px] border border-signal/25 bg-signal-soft/55 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Lock size={13} className="text-signal" />
                <span className="text-[12.5px] font-semibold tracking-tight">What this is not</span>
              </div>
              <p className="mt-2 text-[11px] leading-[1.55] text-ink2">
                This ledger does not make a video authentic. It proves that a given frame digest and its metadata have not changed since signing. Provenance still requires an authenticated source.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
