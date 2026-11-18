"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ScaledCertificate } from "@/components/certificate/ScaledCertificate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { VerificationRender } from "@/lib/api";
import { certificateFontLoadFamily } from "@/lib/certificateFonts";
import { designFontIds, normalizeDesign, pageSizeMm, type CertificateRenderData } from "@/lib/certificateDesign";

const READY_TIMEOUT_MS = 8000;

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Whether the certificate inside `container` is ready to be seen: its page is drawn and its fonts and images
 * have finished loading (or failed: a missing image is simply left out). Gives up waiting after a few seconds.
 */
function useCertificateReady(container: RefObject<HTMLDivElement | null>, render: VerificationRender) {
  const [readyFor, setReadyFor] = useState<VerificationRender | null>(null);
  useEffect(() => {
    let cancelled = false;
    const settle = async () => {
      // ScaledCertificate measures its width before it draws the page.
      for (let frame = 0; frame < 120 && !container.current?.querySelector("[data-certificate-page]"); frame += 1) await nextFrame();
      const families = designFontIds(normalizeDesign(render.snapshot?.design)).map(certificateFontLoadFamily).filter((family): family is string => Boolean(family));
      const images = Array.from(container.current?.querySelectorAll("img") ?? []);
      await Promise.race([
        Promise.all([
          ...families.flatMap((family) => [document.fonts.load(`400 16px ${family}`), document.fonts.load(`700 16px ${family}`)].map((load) => load.catch(() => undefined))),
          ...images.map((image) => image.decode().catch(() => undefined)),
        ]).then(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
      ]);
      await nextFrame();
      if (!cancelled) setReadyFor(render);
    };
    void settle();
    return () => { cancelled = true; };
  }, [container, render]);
  return readyFor === render;
}

/** The "REVOKED" stamp: an overlay on top of the drawn certificate, not part of the renderer. */
function RevokedStamp() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden" style={{ containerType: "inline-size" }}>
      <span
        className="-rotate-[24deg] rounded-xl border-[0.6cqw] border-red-600/45 px-[3cqw] py-[0.5cqw] font-black uppercase tracking-[0.12em] text-red-600/35"
        data-revoked-stamp=""
        style={{ fontSize: "clamp(1.75rem, 13cqw, 9rem)", lineHeight: 1 }}
      >
        Revoked
      </span>
    </div>
  );
}

/** One drawing of the certificate (with the stamp when revoked), behind a skeleton until it is ready. */
function CertificateView({ render, revoked }: { render: VerificationRender; revoked: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ready = useCertificateReady(containerRef, render);
  const page = pageSizeMm(normalizeDesign(render.snapshot?.design).page);

  return (
    <div className="relative">
      <div aria-hidden={!ready} className={ready ? "" : "invisible"} ref={containerRef}>
        <div className="relative">
          <ScaledCertificate data={render.data as CertificateRenderData} snapshot={render.snapshot} />
          {revoked && <RevokedStamp />}
        </div>
      </div>
      {!ready && (
        <div
          aria-label="Loading the certificate"
          className="absolute inset-x-0 top-0 animate-pulse rounded-sm bg-slate-200 motion-reduce:animate-none"
          data-certificate-skeleton=""
          role="status"
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        />
      )}
    </div>
  );
}

/** The enlarged view: a modal at up to actual size, scrollable, closed by its button, Escape or a tap outside. */
function EnlargedCertificate({ render, revoked, institutionName, onClose }: { render: VerificationRender; revoked: boolean; institutionName: string; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [actualSize, setActualSize] = useState(false);
  const page = pageSizeMm(normalizeDesign(render.snapshot?.design).page);
  // 1 mm = 3.7795 px: the certificate's true width, the most the shared renderer is ever drawn at.
  const actualWidthPx = Math.round(page.width * 3.7795);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="m-auto h-[94dvh] max-h-none w-[min(96vw,1240px)] max-w-none overflow-hidden rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/70"
      // A click on the dialog itself (not its contents) is a tap outside the certificate.
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950" id={titleId}>Certificate as issued by {institutionName}</h2>
          <div className="flex items-center gap-2">
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setActualSize(!actualSize)} type="button">
              {actualSize ? "Fit to screen" : "Actual size"}
            </button>
            <button aria-label="Close" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" onClick={() => dialogRef.current?.close()} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
        {/* Scrolls in both directions at actual size; pinch-zoom stays available on touch screens. A tap on the
            grey area around the certificate is also a tap outside it (on a phone the dialog fills the screen). */}
        <div
          className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100 p-4 [touch-action:pan-x_pan-y_pinch-zoom]"
          data-enlarged-scroller=""
          onClick={(event) => {
            const scroller = event.currentTarget;
            if (event.target !== scroller) return;
            // The scroll bars belong to the scroller too; using them must not close the dialog.
            const box = scroller.getBoundingClientRect();
            if (event.clientX - box.left > scroller.clientWidth || event.clientY - box.top > scroller.clientHeight) return;
            dialogRef.current?.close();
          }}
        >
          <div className={actualSize ? "" : "mx-auto"} style={actualSize ? { width: actualWidthPx } : { maxWidth: `calc((94dvh - 7rem) * ${page.width / page.height})` }}>
            <CertificateView render={render} revoked={revoked} />
          </div>
        </div>
      </div>
    </dialog>
  );
}

function CertificateFigure({ render, revoked }: { render: VerificationRender; revoked: boolean }) {
  const [enlarged, setEnlarged] = useState(false);
  const institutionName = render.snapshot?.institution?.name || render.data.institutionName;

  return (
    <>
      {/* aria-live="off": the result is a live region, and the whole certificate should not be read out when it appears. */}
      <figure aria-live="off" className="mt-6 border-t border-current/20 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <figcaption className="text-sm font-semibold">
            Certificate as issued by {institutionName}
            {revoked && <span className="sr-only"> (revoked)</span>}
          </figcaption>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-current/30 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
            onClick={() => setEnlarged(true)}
            type="button"
          >
            <Maximize2 aria-hidden="true" className="size-4" />
            Enlarge
          </button>
        </div>
        <div className="rounded-md bg-white p-2 shadow-sm ring-1 ring-slate-200 sm:p-3">
          <CertificateView render={render} revoked={revoked} />
        </div>
      </figure>
      {enlarged && <EnlargedCertificate institutionName={institutionName} onClose={() => setEnlarged(false)} render={render} revoked={revoked} />}
    </>
  );
}

/**
 * The certificate on a verification result, drawn by the shared renderer from the snapshot frozen at issuance.
 * Only valid and revoked results have it. There is deliberately no download, print or copy action here.
 * Anything that goes wrong while drawing it (including a malformed `render`) shows a short note instead; the
 * verification result around it is never affected.
 */
export function VerifiedCertificate({ render, revoked }: { render: VerificationRender; revoked: boolean }) {
  return (
    <ErrorBoundary
      fallback={() => (
        <p className="mt-5 rounded-md border border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-700" data-certificate-unavailable="">
          The certificate image could not be shown. The verification result above is not affected.
        </p>
      )}
      name="verified certificate"
      resetKeys={[render]}
    >
      <CertificateFigure render={render} revoked={revoked} />
    </ErrorBoundary>
  );
}
