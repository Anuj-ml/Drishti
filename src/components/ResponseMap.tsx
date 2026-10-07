import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Compass, Focus, Layers3, MapPin, Minus, Plus, RadioTower } from "lucide-react";
import {
  INTERCEPT_OPTIONS,
  MAP,
  MAP_ANCHOR,
  M_PER_UNIT,
  mapPointToGeo,
  uncertaintyConePoints,
  type InterceptPlan,
  type MapPoint,
  type ResponsePatrol,
  type ResponseSubject,
} from "../lib/incident";
import { cn } from "../utils/cn";

type OptionId = "auto" | "gate6" | "emb" | "chk";

type Props = {
  patrol: ResponsePatrol;
  subject: ResponseSubject;
  plan: InterceptPlan | null;
  selectedOption: OptionId;
  onPickOption: (id: OptionId) => void;
};

const toGeo = (point: MapPoint): L.LatLngTuple => mapPointToGeo(point);
const geoPath = (points: MapPoint[]): L.LatLngTuple[] => points.map(toGeo);
const DISPLAY_BOUNDS = L.latLngBounds(toGeo([70, 95]), toGeo([1150, 650]));
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

const fencePoints: MapPoint[] = [
  [40, 322], [170, 305], [292, 337], [402, 322], [570, 285],
  [638, 272], [782, 288], [920, 308], [1044, 336], [1180, 316],
];

function markerIcon(kind: "subject" | "patrol" | "intercept" | "site" | "option", label: string) {
  return L.divIcon({
    className: "rt-icon",
    html: `<span class="rt-marker rt-marker-${kind}"><span class="rt-marker-dot"></span><span class="rt-marker-label">${label}</span></span>`,
    iconSize: [kind === "site" ? 94 : 90, 32],
    iconAnchor: [13, 16],
  });
}

export function ResponseMap({ patrol, subject, plan, selectedOption, onPickOption }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [tileState, setTileState] = useState<"loading" | "ready" | "error">("loading");
  const [coverage, setCoverage] = useState(true);
  const [boundary, setBoundary] = useState(true);
  const [uncertainty, setUncertainty] = useState(true);

  const cone = useMemo(() => {
    const speedMps = Math.max(1, subject.speedKmh / 3.6);
    return uncertaintyConePoints(
      subject.projectedPath,
      subject.uncertaintyM / M_PER_UNIT,
      subject.growthPerSec / speedMps,
    );
  }, [subject]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: MAP_ANCHOR,
      zoom: 15,
      minZoom: 12,
      maxZoom: 19,
      zoomControl: false,
      scrollWheelZoom: false,
      preferCanvas: false,
      fadeAnimation: true,
      attributionControl: true,
    });
    mapRef.current = map;

    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: ATTRIBUTION,
      updateWhenIdle: true,
      keepBuffer: 2,
    });
    tileRef.current = tiles;
    tiles.on("tileload", () => setTileState("ready"));
    tiles.on("tileerror", () => setTileState((current) => current === "ready" ? current : "error"));
    tiles.addTo(map);

    const overlay = L.layerGroup().addTo(map);
    overlayRef.current = overlay;
    L.control.scale({ metric: true, imperial: false, maxWidth: 96, position: "bottomleft" }).addTo(map);
    map.fitBounds(DISPLAY_BOUNDS, { padding: [45, 42], maxZoom: 16, animate: false });
    setReady(true);

    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(el);
    const id = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    return () => {
      cancelAnimationFrame(id);
      resize.disconnect();
      overlayRef.current = null;
      tileRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const group = overlayRef.current;
    if (!ready || !group) return;
    group.clearLayers();
    const add = <T extends L.Layer>(layer: T) => { group.addLayer(layer); return layer; };

    if (coverage) {
      MAP.cameras.forEach((camera) => {
        const radius = 145;
        const half = (camera.fov / 2) * (Math.PI / 180);
        const angle = camera.angle * (Math.PI / 180);
        const fan: MapPoint[] = [
          camera.pos,
          ...Array.from({ length: 9 }, (_, i) => {
            const a = angle - half + (i / 8) * half * 2;
            return [camera.pos[0] + Math.cos(a) * radius, camera.pos[1] + Math.sin(a) * radius] as MapPoint;
          }),
        ];
        add(L.polygon(geoPath(fan), {
          color: "#3f74bf", weight: 1, opacity: .54, fillColor: "#4d8dff", fillOpacity: .075,
          interactive: false,
        }));
        add(L.circleMarker(toGeo(camera.pos), {
          radius: 5, color: "#ffffff", weight: 2, fillColor: "#4d8dff", fillOpacity: 1,
        }).bindTooltip(camera.code, { direction: "top", offset: [0, -8], className: "rt-tooltip" }));
      });
    }

    if (boundary) {
      add(L.polyline(geoPath(fencePoints), {
        color: "#cc9c30", weight: 2, opacity: .8, dashArray: "5 7", interactive: false,
      }));
      const dropZone = MAP.sites.find((site) => site.id === "dz04");
      if (dropZone) {
        add(L.circle(toGeo(dropZone.pos), {
          radius: 34, color: "#caa043", weight: 1.4, dashArray: "4 4",
          fillColor: "#e6c25e", fillOpacity: .13,
        }).bindTooltip("DZ-04 / simulated drop area", { className: "rt-tooltip" }));
      }
    }

    if (uncertainty && cone.length > 2) {
      add(L.polygon(geoPath(cone), {
        color: "#d92d20", weight: 1, opacity: .38, dashArray: "4 6",
        fillColor: "#d92d20", fillOpacity: .10, interactive: false,
      }));
      add(L.circle(toGeo(subject.position), {
        radius: subject.uncertaintyM, color: "#d92d20", weight: 1, opacity: .44,
        fillColor: "#d92d20", fillOpacity: .045, interactive: false,
      }));
    }

    add(L.polyline(geoPath(subject.trackHistory), {
      color: "#d92d20", weight: 5, opacity: .9, lineCap: "round", interactive: false,
    }));
    subject.trackHistory.slice(1, -1).forEach((point, index) => {
      add(L.circleMarker(toGeo(point), {
        radius: 2.3 + index * .38, color: "#fff", weight: 1,
        fillColor: "#d92d20", fillOpacity: .45 + index * .09, interactive: false,
      }));
    });
    add(L.polyline(geoPath(subject.projectedPath), {
      color: "#ce352a", weight: 2.8, opacity: .84, dashArray: "7 7",
      className: "rt-map-flow", interactive: false,
    }));

    MAP.sites.filter((site) => site.id === "bop11" || site.id === "bop07" || site.id === "chk12")
      .forEach((site) => add(L.marker(toGeo(site.pos), {
        icon: markerIcon("site", site.name), interactive: false, zIndexOffset: 200,
      })));

    INTERCEPT_OPTIONS.forEach((candidate) => {
      if (plan && Math.hypot(candidate.point[0] - plan.point[0], candidate.point[1] - plan.point[1]) < 22) return;
      const isSelected = selectedOption === candidate.id;
      add(L.marker(toGeo(candidate.point), {
        icon: markerIcon("option", isSelected ? "SELECTED" : "+"),
        zIndexOffset: 410,
      }).on("click", () => onPickOption(candidate.id as OptionId))
        .bindTooltip(`Set intercept: ${candidate.name}`, { direction: "top", className: "rt-tooltip", offset: [0, -14] }));
    });

    if (plan) {
      add(L.polyline([toGeo(patrol.position), toGeo(plan.point)], {
        color: "#0e6d61", weight: 3, opacity: .88, dashArray: "8 7",
        className: "rt-map-flow", interactive: false,
      }));
      add(L.circle(toGeo(plan.point), {
        radius: plan.standoffM, color: plan.feasible ? "#0e6d61" : "#d92d20",
        weight: 1.6, dashArray: "4 6", opacity: .78,
        fillColor: plan.feasible ? "#0e6d61" : "#d92d20", fillOpacity: .07,
        interactive: false,
      }));
      add(L.marker(toGeo(plan.point), {
        icon: markerIcon("intercept", "INTERCEPT"), zIndexOffset: 850,
      }).bindTooltip(`${plan.pointName} / ${plan.feasible ? "feasible" : "not feasible"}`, {
        direction: "top", className: "rt-tooltip", offset: [0, -14],
      }));
    }

    add(L.marker(toGeo(patrol.position), {
      icon: markerIcon("patrol", patrol.id), zIndexOffset: 800,
    }).bindTooltip(`${patrol.callsign} / ${patrol.role}`, {
      direction: "top", className: "rt-tooltip", offset: [0, -14],
    }));
    add(L.marker(toGeo(subject.position), {
      icon: markerIcon("subject", subject.id), zIndexOffset: 900,
    }).bindTooltip(`${subject.label} / ${subject.heading}`, {
      direction: "top", className: "rt-tooltip", offset: [0, -14],
    }));

    return () => { group.clearLayers(); };
  }, [ready, coverage, boundary, uncertainty, cone, patrol, plan, subject, selectedOption, onPickOption]);

  const resetView = () => mapRef.current?.fitBounds(DISPLAY_BOUNDS, {
    padding: [45, 42], maxZoom: 16, animate: true,
  });

  return (
    <div className="overflow-hidden rounded-[17px] border border-[#d5dcd1] bg-[#dfe7dd] shadow-[0_18px_44px_-28px_rgba(28,52,37,.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e6dd] bg-[#fafbf8] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#e8f1ec] text-signal">
            <Compass size={18} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-[14px] font-semibold tracking-tight text-ink">Sector response map</span>
              <span className="hidden h-[5px] w-[5px] rounded-full bg-signal sm:block" />
              <span className="hidden font-mono text-[9px] text-ink3 sm:block">OSM / FIELD CONTEXT</span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-ink3">Real basemap. Scenario positions and tracks are illustrative, not surveyed.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-2 hidden items-center gap-1 font-mono text-[9px] text-ink4 lg:inline-flex">
            <MapPin size={10} /> {MAP_ANCHOR[0].toFixed(4)}N / {MAP_ANCHOR[1].toFixed(4)}E
          </span>
          {[
            { key: "uncertainty", label: "Projection", active: uncertainty, set: setUncertainty, color: "#d92d20" },
            { key: "coverage", label: "Cameras", active: coverage, set: setCoverage, color: "#4d8dff" },
            { key: "boundary", label: "Boundary", active: boundary, set: setBoundary, color: "#caa043" },
          ].map((layer) => (
            <button
              type="button"
              key={layer.key}
              aria-pressed={layer.active}
              onClick={() => layer.set(!layer.active)}
              className={cn(
                "flex h-[27px] items-center gap-1.5 rounded-[7px] border px-2 text-[10.5px] font-medium transition-colors",
                layer.active ? "border-[#cad7cd] bg-[#edf4ef] text-ink" : "border-transparent text-ink3 hover:bg-ink/[.04]",
              )}
            >
              <span className="h-[5px] w-[5px] rounded-full" style={{ background: layer.active ? layer.color : "#b9c0b9" }} />
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rt-map relative h-[480px] w-full bg-[#d8e2d7] sm:h-[535px]">
        <div ref={containerRef} className="absolute inset-0" aria-label="Interactive OpenStreetMap basemap with illustrative response scenario overlays" />

        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex items-start justify-between gap-3">
          <span className="rt-map-hud inline-flex items-center gap-2 rounded-[8px] border border-white/35 bg-[#14261f]/90 px-2.5 py-2 font-mono text-[9px] text-white/80 shadow-[0_5px_18px_rgba(0,0,0,.16)] backdrop-blur-lg">
            <span className="h-[5px] w-[5px] rounded-full bg-[#7fe3bd] live-dot" />
            PLANNING VIEW / {plan?.feasible ? "INTERCEPT SOLVED" : "ASSESSING ROUTE"}
          </span>
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-[9px] border border-[#d6ded5] bg-white/95 shadow-[0_5px_18px_rgba(0,0,0,.12)] backdrop-blur-lg">
            <button onClick={() => mapRef.current?.zoomIn()} title="Zoom in" aria-label="Zoom in" className="grid h-8 w-8 place-items-center text-ink2 transition-colors hover:bg-paper"><Plus size={13} /></button>
            <button onClick={() => mapRef.current?.zoomOut()} title="Zoom out" aria-label="Zoom out" className="grid h-8 w-8 place-items-center border-t border-hairline text-ink2 transition-colors hover:bg-paper"><Minus size={13} /></button>
            <button onClick={resetView} title="Fit scenario" aria-label="Fit scenario" className="grid h-8 w-8 place-items-center border-t border-hairline text-signal transition-colors hover:bg-signal-soft"><Focus size={13} /></button>
          </div>
        </div>

        {tileState === "error" && (
          <div className="pointer-events-none absolute left-4 top-[62px] z-[500] max-w-[260px] rounded-[8px] border border-amber-200/60 bg-white/95 p-2.5 text-[11px] text-ink2 shadow-lift">
            Basemap tiles unavailable. Scenario layers remain interactive; reconnect to load geography.
          </div>
        )}
        <div className="pointer-events-none absolute bottom-10 left-4 z-[500] hidden rounded-[7px] bg-[#14261f]/85 px-2.5 py-1.5 font-mono text-[9px] text-white/65 backdrop-blur-sm sm:block">
          <Layers3 size={11} className="mr-1.5 inline-block text-[#8bcdaf]" />
          DOTTED PATH = PROJECTED / NOT CONFIRMED
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d6dfd3] bg-[#fafbf8] px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {[
            ["#d92d20", "Observed track"],
            ["#ce352a", "Projected path"],
            ["#0e6d61", "Patrol lower bound"],
            ["#caa043", "Illustrative boundary"],
          ].map(([color, label]) => <span key={label} className="flex items-center gap-1.5 text-[9.5px] text-ink3"><span className="h-[3px] w-3 rounded-full" style={{ background: color }} />{label}</span>)}
        </div>
        <span className="flex items-center gap-1 font-mono text-[9px] text-ink4">
          <RadioTower size={10} /> External tiles for demo only / deploy offline maps on site
        </span>
      </div>
    </div>
  );
}