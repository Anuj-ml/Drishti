import { createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  GenericReportDocument,
  IncidentReportDocument,
  REPORT_HEIGHT,
  REPORT_WIDTH,
  type GenericReportSpec,
  type IncidentReportData,
} from "../components/ReportDocument";

async function rasterizeReport(element: ReactElement, title: string, visibleRoot?: HTMLElement): Promise<Uint8Array> {
  let host: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let captureRoot: HTMLElement;

  if (visibleRoot) {
    captureRoot = visibleRoot;
  } else {
    host = document.createElement("div");
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${REPORT_WIDTH}px;pointer-events:none;z-index:-1`;
    document.body.appendChild(host);
    root = createRoot(host);
    flushSync(() => root!.render(element));
    captureRoot = host;
  }

  try {
    await document.fonts.ready;
    const pages = [...captureRoot.querySelectorAll<HTMLElement>("[data-report-page]")];
    if (pages.length !== 4) throw new Error(`Expected four report pages, found ${pages.length}`);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.setProperties({
      title,
      subject: "IBVAP four-page operational report / training demonstration",
      author: "IBVAP",
      creator: "IBVAP unified report renderer",
    });

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (page.offsetWidth !== REPORT_WIDTH || page.offsetHeight !== REPORT_HEIGHT) {
        throw new Error(`Report page ${i + 1} has the wrong A4 dimensions`);
      }
      const image = await toJpeg(page, {
        quality: 0.94,
        pixelRatio: 2,
        width: REPORT_WIDTH,
        height: REPORT_HEIGHT,
        backgroundColor: i === 0 || i === 3 ? "#181a1a" : i === 2 ? "#eff1ed" : "#f8f9f6",
        fontEmbedCSS: "",
        skipAutoScale: true,
      });
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(image, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }

    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    root?.unmount();
    host?.remove();
  }
}

export function renderIncidentPDF(data: IncidentReportData, visibleRoot?: HTMLElement) {
  return rasterizeReport(createElement(IncidentReportDocument, { data }), `IBVAP Incident Report ${data.event.id}`, visibleRoot);
}

export function renderGenericPDF(spec: GenericReportSpec) {
  return rasterizeReport(createElement(GenericReportDocument, { spec }), `IBVAP ${spec.category} ${spec.id}`);
}

export function renderIncidentHTML(data: IncidentReportData) {
  const markup = renderToStaticMarkup(createElement(IncidentReportDocument, { data }));
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>IBVAP Incident Report ${data.event.id}</title><style>body{margin:0;padding:24px;background:#e4e8e2;display:flex;justify-content:center}@media print{body{display:block!important;padding:0!important;background:#fff!important}.ir-print-pages{display:block!important;width:210mm!important}.ir-page{break-after:page;page-break-after:always!important;margin:0!important}.ir-page:last-child{break-after:auto!important;page-break-after:auto!important}}</style></head><body>${markup}</body></html>`;
}