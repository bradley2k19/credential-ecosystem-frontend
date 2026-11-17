"use client";

import { useEffect, useRef, useState } from "react";
import { CertificateRenderer, type CertificateLayout } from "@/components/certificate/CertificateRenderer";
import { mm, normalizeDesign, pageSizeMm, type CertificateRenderData, type RenderSnapshot } from "@/lib/certificateDesign";

/** Width changes smaller than this (in px) are ignored, so a scrollbar or sub-pixel rounding cannot start a resize loop. */
const MIN_WIDTH_CHANGE_PX = 1;

/**
 * Shows the certificate renderer scaled down (never up) to the width of its container. The renderer itself
 * stays at true size; only a CSS transform scales it, and the wrapper takes the scaled size so the page flows.
 */
export function ScaledCertificate({
  snapshot,
  data,
  onLayout,
  className = "",
}: {
  snapshot: RenderSnapshot;
  data: CertificateRenderData;
  onLayout?: (layout: CertificateLayout) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    let lastWidth = 0;
    // Width changes are applied on the next animation frame and only when they are real, so the preview can
    // never feed back into its own size (scale changes, height changes, a scrollbar appears, width changes...).
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (Math.abs(width - lastWidth) < MIN_WIDTH_CHANGE_PX) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setContainerWidth(width));
    });
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const page = pageSizeMm(normalizeDesign(snapshot?.design).page);
  const pageWidth = mm(page.width);
  const pageHeight = mm(page.height);
  const scale = containerWidth > 0 ? Math.min(1, Math.round((containerWidth / pageWidth) * 1000) / 1000) : 0;

  return (
    <div className={`w-full ${className}`} ref={containerRef}>
      {scale > 0 ? (
        <div className="relative mx-auto overflow-hidden shadow-[0_1px_3px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200" style={{ width: pageWidth * scale, height: pageHeight * scale }}>
          <div style={{ width: pageWidth, height: pageHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <CertificateRenderer data={data} onLayout={onLayout} snapshot={snapshot} />
          </div>
        </div>
      ) : (
        // Holds the space at the page's aspect ratio until the container has been measured.
        <div aria-hidden="true" style={{ aspectRatio: `${page.width} / ${page.height}` }} />
      )}
    </div>
  );
}
