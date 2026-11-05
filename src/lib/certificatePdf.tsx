import { createRoot } from "react-dom/client";
import { CertificateRenderer } from "@/components/certificate/CertificateRenderer";
import { certificateFontLoadFamily } from "@/lib/certificateFonts";
import { designFontIds, mm, pageSizeMm, type CertificateRenderData, type RenderSnapshot } from "@/lib/certificateDesign";

const START_PIXEL_RATIO = 3;
const MIN_PIXEL_RATIO = 1.5;
const MAX_PDF_BYTES = 6 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 20_000;
const FONT_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 60_000;

/** The steps of an export, in order. A failure names the step it happened in. */
export type ExportStep = "render" | "fonts" | "images" | "capture" | "pdf" | "download";

const STEP_DESCRIPTIONS: Record<ExportStep, string> = {
  render: "rendering the certificate off-screen",
  fonts: "loading the fonts",
  images: "loading the images",
  capture: "capturing the page as an image",
  pdf: "assembling the PDF",
  download: "saving the file",
};

export class CertificateExportError extends Error {
  readonly step: ExportStep;
  readonly detail: string;

  constructor(step: ExportStep, detail: string, cause?: unknown) {
    super(`Certificate PDF export failed while ${STEP_DESCRIPTIONS[step]}: ${detail}`, { cause });
    this.name = "CertificateExportError";
    this.step = step;
    this.detail = detail;
  }
}

export interface CertificateExportResult {
  sizeBytes: number;
  pixelRatio: number;
  /** Plain names ("logo", "signature of ...") of images that could not be loaded and were left out. */
  missingImages: string[];
  /** A short message for the interface when images were left out, otherwise null. */
  warning: string | null;
}

/** What the interface shows under a failure message: the step in plain words and the underlying error. */
export function exportFailureDetails(error: unknown) {
  if (error instanceof CertificateExportError) return { step: error.step, stepDescription: STEP_DESCRIPTIONS[error.step], detail: error.detail };
  return { step: null, stepDescription: "an unexpected step", detail: describeError(error) };
}

export type ExportFailureDetails = ReturnType<typeof exportFailureDetails>;

/** "The logo could not be loaded and was left out.", or null when nothing is missing. */
export function missingImagesWarning(labels: string[]) {
  if (labels.length === 0) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `The ${list} could not be loaded and ${labels.length === 1 ? "was" : "were"} left out.`;
}

export function certificatePdfFileName(programName: string, certificateUid: string) {
  const programme = programName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
  return `certificate-${programme}-${certificateUid.slice(0, 8)}.pdf`;
}

/** A readable one-line description of anything thrown, including the bare Events that failed images reject with. */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof Event !== "undefined" && error instanceof Event) {
    const target = error.target;
    if (target instanceof HTMLImageElement) return `"${error.type}" event from the ${target.dataset.assetLabel ?? "image"} (${target.currentSrc || target.src || "no source"})`;
    return `"${error.type}" event`;
  }
  return String(error);
}

function imageLabel(image: HTMLImageElement) {
  return image.dataset.assetLabel || image.alt || "image";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Runs one step; anything it throws becomes a CertificateExportError naming that step. */
async function runStep<T>(step: ExportStep, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof CertificateExportError) throw error;
    throw new CertificateExportError(step, describeError(error), error);
  }
}

/** Loads every font the design uses. A font that fails is only logged: the text then uses the fallback font. */
async function loadFonts(snapshot: RenderSnapshot) {
  const families = designFontIds(snapshot.design).map(certificateFontLoadFamily).filter((family): family is string => Boolean(family));
  const results = await Promise.allSettled(families.flatMap((family) => [document.fonts.load(`400 16px ${family}`), document.fonts.load(`700 16px ${family}`)]));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) console.warn("Some certificate fonts could not be loaded; the PDF uses the fallback font for them.", failures.map((failure) => failure.reason));
  await withTimeout(document.fonts.ready, FONT_TIMEOUT_MS, "fonts were still loading").catch((error: unknown) => {
    console.warn("Certificate fonts did not finish loading in time; capturing with the fonts available.", error);
  });
}

/**
 * Waits for each image to load or fail (with a time limit) and returns the ones that did not load. Never throws
 * for a broken image: the export leaves it out instead.
 */
async function settleImages(page: HTMLElement) {
  const images = Array.from(page.querySelectorAll("img"));
  await Promise.all(images.map((image) => withTimeout(image.decode(), IMAGE_TIMEOUT_MS, "image timed out").catch(() => undefined)));
  return images.filter((image) => !image.complete || image.naturalWidth === 0);
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
 * Takes an image that did not load out of the frozen copy, keeping its space so nothing else moves. A failed
 * image is already hidden (display: none) and takes no space, so it is simply removed.
 */
function leaveOutImage(copy: HTMLImageElement, original: HTMLImageElement) {
  const rect = original.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    copy.remove();
    return;
  }
  const spacer = document.createElement("div");
  Object.assign(spacer.style, { width: `${rect.width}px`, height: `${rect.height}px`, flexShrink: "0" });
  copy.replaceWith(spacer);
}

interface PreparedPage {
  page: HTMLElement;
  missingImages: string[];
}

/**
 * Mounts an off-screen, unscaled copy of the one renderer (never the scaled preview), waits for its fonts and
 * images, then captures a frozen clone of that page with its line breaks made explicit and any image that did
 * not load left out. Always cleans everything up afterwards.
 */
async function withOffscreenCertificate<T>(snapshot: RenderSnapshot, data: CertificateRenderData, capture: (prepared: PreparedPage) => Promise<T>) {
  const host = offscreenHost(snapshot);
  const cloneHost = offscreenHost(snapshot);
  let failRender: (error: unknown) => void = () => undefined;
  const root = createRoot(host, { onUncaughtError: (error) => failRender(error) });
  try {
    await runStep("render", () => withTimeout(
      new Promise<void>((resolve, reject) => {
        failRender = reject;
        root.render(<CertificateRenderer data={data} onLayout={() => resolve()} snapshot={snapshot} />);
      }),
      RENDER_TIMEOUT_MS,
      `the certificate did not finish rendering within ${RENDER_TIMEOUT_MS / 1000} seconds`,
    ));
    const page = host.firstElementChild;
    if (!(page instanceof HTMLElement)) throw new CertificateExportError("render", "the renderer produced no page element");

    await runStep("fonts", () => loadFonts(snapshot));
    const failedImages = await runStep("images", async () => {
      const failed = await settleImages(page);
      // Let the renderer's auto-fit react to the loaded fonts and images before copying the page.
      await nextFrame();
      await nextFrame();
      return failed;
    });
    const missingImages = unique(failedImages.map(imageLabel));
    if (missingImages.length > 0) {
      console.warn("Certificate PDF export: these images could not be loaded and were left out:", failedImages.map((image) => `${imageLabel(image)} (${image.currentSrc || image.src})`));
    }

    const frozen = await runStep("capture", async () => {
      // A plain DOM clone (not owned by React) carries the same inline styles, including the auto-fit scale.
      const copy = page.cloneNode(true) as HTMLElement;
      const originals = Array.from(page.querySelectorAll("img"));
      Array.from(copy.querySelectorAll("img")).forEach((image, index) => {
        if (failedImages.includes(originals[index])) leaveOutImage(image, originals[index]);
      });
      cloneHost.appendChild(copy);
      await Promise.all(Array.from(copy.querySelectorAll("img")).map((image) => withTimeout(image.decode(), IMAGE_TIMEOUT_MS, "image timed out").catch(() => undefined)));
      await nextFrame();
      freezeLineBreaks(copy);
      return copy;
    });
    return await capture({ page: frozen, missingImages });
  } finally {
    root.unmount();
    host.remove();
    cloneHost.remove();
  }
}

/**
 * Captures the page as a PNG. If the capture library still fails to embed an image, that image is hidden and
 * reported instead of failing the whole capture (by default it rejects on the first broken image).
 */
function pageToPng(page: HTMLElement, snapshot: RenderSnapshot, pixelRatio: number, missingImages: string[]) {
  return runStep("capture", async () => {
    const { toPng } = await import("html-to-image");
    const pageMm = pageSizeMm(snapshot.design.page);
    return withTimeout(
      toPng(page, {
        pixelRatio,
        width: mm(pageMm.width),
        height: mm(pageMm.height),
        backgroundColor: snapshot.design.theme.backgroundColor,
        onImageErrorHandler: (event: Event | string) => {
          const target = typeof event === "string" ? null : event.target;
          if (!(target instanceof HTMLImageElement)) return;
          const label = imageLabel(target);
          if (!missingImages.includes(label)) missingImages.push(label);
          console.warn(`Certificate PDF export: the ${label} could not be embedded and was left out.`);
          target.alt = "";
          target.style.visibility = "hidden";
        },
      }),
      CAPTURE_TIMEOUT_MS,
      `the capture did not finish within ${CAPTURE_TIMEOUT_MS / 1000} seconds at pixel ratio ${pixelRatio}`,
    );
  });
}

/** Captures at the given ratio, retrying once at the lowest ratio if the capture fails (for example when a device cannot allocate a large canvas). */
async function captureWithFallback(page: HTMLElement, snapshot: RenderSnapshot, pixelRatio: number, missingImages: string[]) {
  try {
    return { png: await pageToPng(page, snapshot, pixelRatio, missingImages), pixelRatio };
  } catch (error) {
    if (pixelRatio <= MIN_PIXEL_RATIO) throw error;
    console.warn(`Certificate PDF export: capture failed at pixel ratio ${pixelRatio}, retrying at ${MIN_PIXEL_RATIO}.`, error);
    return { png: await pageToPng(page, snapshot, MIN_PIXEL_RATIO, missingImages), pixelRatio: MIN_PIXEL_RATIO };
  }
}

/** The certificate as a PNG data URL, captured exactly as the PDF captures it. */
export function captureCertificatePng({ snapshot, data, pixelRatio = START_PIXEL_RATIO }: { snapshot: RenderSnapshot; data: CertificateRenderData; pixelRatio?: number }) {
  return withOffscreenCertificate(snapshot, data, ({ page, missingImages }) => pageToPng(page, snapshot, pixelRatio, missingImages));
}

/**
 * Renders the certificate to a PDF blob: the captured PNG fills a page of the design's size and orientation.
 * Starts at pixel ratio 3 and lowers it if the file would exceed 6 MB.
 */
export function renderCertificatePdf({ snapshot, data }: { snapshot: RenderSnapshot; data: CertificateRenderData }) {
  return withOffscreenCertificate(snapshot, data, async ({ page, missingImages }) => {
    const pageMm = pageSizeMm(snapshot.design.page);
    let pixelRatio = START_PIXEL_RATIO;
    for (;;) {
      const captured = await captureWithFallback(page, snapshot, pixelRatio, missingImages);
      pixelRatio = captured.pixelRatio;
      const blob = await runStep("pdf", async () => {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({
          orientation: snapshot.design.page.orientation,
          unit: "mm",
          format: snapshot.design.page.size === "LETTER" ? "letter" : "a4",
          compress: true,
        });
        doc.addImage(captured.png, "PNG", 0, 0, pageMm.width, pageMm.height, undefined, "FAST");
        doc.setProperties({ title: `Certificate - ${data.programName}`, author: snapshot.institution.name || data.institutionName });
        return doc.output("blob");
      });
      if (blob.size <= MAX_PDF_BYTES || pixelRatio <= MIN_PIXEL_RATIO) return { blob, pixelRatio, missingImages };
      pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.5);
    }
  });
}

/**
 * Builds the certificate PDF and downloads it. A missing image never stops the download: it is left out and
 * named in the result's warning. Any real failure is logged with the step it happened in and rethrown as a
 * CertificateExportError.
 */
export async function exportCertificatePdf({ snapshot, data, fileName }: { snapshot: RenderSnapshot; data: CertificateRenderData; fileName?: string }): Promise<CertificateExportResult> {
  try {
    const { blob, pixelRatio, missingImages } = await renderCertificatePdf({ snapshot, data });
    await runStep("download", async () => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName ?? certificatePdfFileName(data.programName, data.certificateUid);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return { sizeBytes: blob.size, pixelRatio, missingImages, warning: missingImagesWarning(missingImages) };
  } catch (error) {
    const exportError = error instanceof CertificateExportError ? error : new CertificateExportError("pdf", describeError(error), error);
    console.error(exportError.message, exportError.cause ?? exportError);
    throw exportError;
  }
}
