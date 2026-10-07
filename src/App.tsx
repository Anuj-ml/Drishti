import { AlertRail, Toast } from "./components/AlertRail";
import { NAV, SideNav, TopBar } from "./components/Chrome";
import { CommandPalette } from "./components/CommandPalette";
import { IncidentReportModal } from "./components/IncidentReportModal";
import type { FC } from "react";
import { AppProvider, useApp, type ViewId } from "./state/store";
import { cn } from "./utils/cn";
import { Analytics } from "./views/Analytics";
import { AdvancedThreats } from "./views/AdvancedThreats";
import { Events } from "./views/Events";
import { Evidence } from "./views/Evidence";
import { Faces } from "./views/Faces";
import { Fence } from "./views/Fence";
import { IncidentGraph } from "./views/IncidentGraph";
import { Integration } from "./views/Integration";
import { ResponseTwin } from "./views/ResponseTwin";
import { LiveWall } from "./views/LiveWall";
import { NightOps } from "./views/NightOps";
import { Sites } from "./views/Sites";
import { TacticalMap3D } from "./views/TacticalMap3D";
import { Vehicles } from "./views/Vehicles";

const VIEWS: Record<ViewId, FC> = {
  live: LiveWall,
  events: Events,
  faces: Faces,
  vehicles: Vehicles,
  fence: Fence,
  incident: IncidentGraph,
  response: ResponseTwin,
  tactical: TacticalMap3D,
  evidence: Evidence,
  threats: AdvancedThreats,
  night: NightOps,
  analytics: Analytics,
  sites: Sites,
  integration: Integration,
};

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% -8%, rgba(14,109,97,.09), transparent 42%), radial-gradient(circle at 92% 4%, rgba(239,108,51,.075), transparent 38%), radial-gradient(circle at 60% 108%, rgba(20,22,26,.05), transparent 46%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(rgba(20,22,26,.11) 0.6px, transparent 0.6px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,.5), transparent 62%)",
          WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,.5), transparent 62%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/15 to-transparent" />
    </div>
  );
}

function MobileNav() {
  const { view, setView, unread } = useApp();
  const items = NAV.flatMap((g) => g.items);
  return (
    <div className="sticky top-[52px] z-30 -mx-4 border-b border-hairline bg-canvas/85 px-4 py-2 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {items.map((it) => {
          const Ico = it.icon;
          const on = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-medium tracking-tight transition-colors",
                on ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink2",
              )}
            >
              <Ico size={12.5} />
              {it.label}
              {it.id === "events" && unread > 0 && <span className="tnum rounded-full bg-alert px-1 font-mono text-[9px] text-white">{unread}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Shell() {
  const { view } = useApp();
  const View = VIEWS[view];
  return (
    <div className="min-h-screen font-sans text-ink antialiased">
      <Ambient />
      <TopBar />
      <div className="mx-auto flex w-full max-w-[1680px] items-start">
        <SideNav />
        <div className="min-w-0 flex-1">
          <MobileNav />
          <main key={view} className="rise px-4 pb-20 pt-6 sm:px-6 lg:px-8 lg:pt-8">
            <View />
          </main>
          <footer className="border-t border-hairline px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9.2" stroke="#83878e" strokeWidth="1.4" />
                  <path d="M6.4 15.6c2.2-3.1 3.6-4.6 5.6-4.6s3.4 1.5 5.6 4.6" stroke="#83878e" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="12" cy="9.4" r="2.1" fill="#83878e" />
                </svg>
                <span className="text-[11.5px] text-ink3">
                  IBVAP · Intelligent Border Video Analytics Platform — software-defined surveillance over existing CCTV
                </span>
              </div>
              <div className="flex items-center gap-4 font-mono text-[10px] text-ink4">
                <span>model pack v4.2.1</span>
                <span className="hidden sm:inline">demo data · simulated streams</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1fa97a] live-dot" /> classified: restricted
                </span>
              </div>
            </div>
          </footer>
        </div>
        <AlertRail />
      </div>
      <CommandPalette />
      <IncidentReportModal />
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
