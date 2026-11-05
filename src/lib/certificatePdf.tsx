import { createRoot } from "react-dom/client";
import { CertificateRenderer } from "@/components/certificate/CertificateRenderer";
import { certificateFontLoadFamily } from "@/lib/certificateFonts";
import { designFontIds, mm, pageSizeMm, type CertificateRenderData, type RenderSnapshot } from "@/lib/certificateDesign";

const START_PIXEL_RATIO = 3;
const MIN_PIXEL_RATIO = 1.5;
const MAX_PDF_BYTES = 6 * 1024 * 1024;

export function certificatePdfFileName(programName: string, certificateUid: string) {
  const programme = programName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
  return `certificate-${programme}-${certificateUid.slice(0, 8)}.pdf`;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Waits until every font the design uses, and every image on the page, is ready to be drawn. */
async function waitForFontsAndImages(page: HTMLElement, snapshot: RenderSnapshot) {
  const families = designFontIds(snapshot.design).map(certificateFontLoadFamily).filter((family): family is string => Boolean(family));
  await Promise.all(families.flatMap((family) => [document.fonts.load(`400 16px ${family}`), document.fonts.load(`700 16px ${family}`)]));
  await document.fonts.ready;
  await Promise.all(Array.from(page.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)));
  // Let the renderer's auto-fit react to the loaded fonts and images before capturing.
  await nextFrame();
  await nextFrame();
}

function offscreenHost(snapshot: RenderSnapshot) {
  const pageMm = pageSizeMm(snapshot.design.page);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Far outside the viewport rather than display: none, so the browser lays it out and loads its fonts.
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", width: `${mm(pageMm.width)}px`, height: `${mm(pageMm.height)}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  return host;
}

/**
 * Makes every line break explicit. html-to-image redraws the page inside an SVG image, where glyphs come out
 * slightly narrower than in the live layout (font hinting differs at the capture resolution), which could move
 * a borderline line break. Measuring where each line actually breaks and inserting <br> there, with wrapping
 * turned off, keeps the PDF's lines exactly as on screen.
 */
function freezeLineBreaks(root: HTMLElement) {
  const range = document.createRange();
  for (const block of Array.from(root.querySelectorAll<HTMLElement>("h1, p"))) {
    const breaks: { node: Text; offset: number }[] = [];
    let lineTop: number | null = null;
    for (const node of Array.from(block.childNodes)) {
      if (!(node instanceof Text)) continue;
      for (let offset = 0; offset < node.data.length; offset += 1) {
        // Spaces at the end of a line have no reliable position, so only visible characters are measured.
        if (/\s/.test(node.data[offset])) continue;
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        if (lineTop !== null && rect.top > lineTop + rect.height / 2) breaks.push({ node, offset });
        if (lineTop === null || rect.top > lineTop + rect.height / 2) lineTop = rect.top;
      }
    }
    // Split from the end so earlier offsets in the same text node stay valid.
    for (const { node, offset } of breaks.reverse()) {
      const rest = node.splitText(offset);
      rest.parentNode?.insertBefore(document.createElement("br"), rest);
    }
    block.style.whiteSpace = "nowrap";
  }
}

/**
 * Mounts an off-screen, unscaled copy of the one renderer (never the scaled preview) and waits for its fonts
 * and images. It then captures a frozen clone of that page, with its line breaks made explicit, and always
 * cleans everything up afterwards.
 */
async function withOffscreenCertificate<T>(snapshot: RenderSnapshot, data: CertificateRenderData, capture: (page: HTMLElement) => Promise<T>) {
  const host = offscreenHost(snapshot);
  const cloneHost = offscreenHost(snapshot);
  const root = createRoot(host);
  try {
    await new Promise<void>((resolve) => {
      root.render(<CertificateRenderer data={data} onLayout={() => resolve()} snapshot={snapshot} />);
    });
    const page = host.firstElementChild as HTMLElement;
    await waitForFontsAndImages(page, snapshot);

    // A plain DOM clone (not owned by React) carries the same inline styles, including the auto-fit scale.
    const frozen = page.cloneNode(true) as HTMLElement;
    cloneHost.appendChild(frozen);
    await Promise.all(Array.from(frozen.querySelectorAll("img")).map((image) => image.decode().catch(() => undefined)));
    await nextFrame();
    freezeLineBreaks(frozen);
    return await capture(frozen);
  } finally {
    root.unmount();
    host.remove();
    cloneHost.remove();
  }
}

async function pageToPng(page: HTMLElement, snapshot: RenderSnapshot, pixelRatio: number) {
  const { toPng } = await import("html-to-image");
  const pageMm = pageSizeMm(snapshot.design.page);
  return toPng(page, {
    pixelRatio,
    width: mm(pageMm.width),
    height: mm(pageMm.height),
    backgroundColor: snapshot.design.theme.backgroundColor,
  });
}

/** The certificate as a PNG data URL, captured exactly as the PDF captures it. */
export function captureCertificatePng({ snapshot, data, pixelRatio = START_PIXEL_RATIO }: { snapshot: RenderSnapshot; data: CertificateRenderData; pixelRatio?: number }) {
  return withOffscreenCertificate(snapshot, data, (page) => pageToPng(page, snapshot, pixelRatio));
}

/**
 * Renders the certificate to a PDF blob: the captured PNG fills a page of the design's size and orientation.
 * Starts at pixel ratio 3 and lowers it if the file would exceed 6 MB.
 */
export function renderCertificatePdf({ snapshot, data }: { snapshot: RenderSnapshot; data: CertificateRenderData }) {
  return withOffscreenCertificate(snapshot, data, async (page) => {
    const { jsPDF } = await import("jspdf");
    const pageMm = pageSizeMm(snapshot.design.page);
    let pixelRatio = START_PIXEL_RATIO;
    for (;;) {
      const png = await pageToPng(page, snapshot, pixelRatio);
      const doc = new jsPDF({
        orientation: snapshot.design.page.orientation,
        unit: "mm",
        format: snapshot.design.page.size === "LETTER" ? "letter" : "a4",
        compress: true,
      });
      doc.addImage(png, "PNG", 0, 0, pageMm.width, pageMm.height, undefined, "FAST");
      doc.setProperties({ title: `Certificate - ${data.programName}`, author: snapshot.institution.name || data.institutionName });
      const blob = doc.output("blob");
      if (blob.size <= MAX_PDF_BYTES || pixelRatio <= MIN_PIXEL_RATIO) return { blob, pixelRatio };
      pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.5);
    }
  });
}

/** Builds the certificate PDF and downloads it. Returns its size and the pixel ratio used. */
export async function exportCertificatePdf({ snapshot, data, fileName }: { snapshot: RenderSnapshot; data: CertificateRenderData; fileName?: string }) {
  const { blob, pixelRatio } = await renderCertificatePdf({ snapshot, data });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName ?? certificatePdfFileName(data.programName, data.certificateUid);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { sizeBytes: blob.size, pixelRatio };
}
