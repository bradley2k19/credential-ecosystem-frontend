"use client";

import { useEffect, useRef, useState } from "react";
import { CertificateRenderer, type CertificateLayout } from "@/components/certificate/CertificateRenderer";
import { mm, pageSizeMm, type CertificateRenderData, type RenderSnapshot } from "@/lib/certificateDesign";

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
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const page = pageSizeMm(snapshot.design.page);
  const pageWidth = mm(page.width);
  const pageHeight = mm(page.height);
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / pageWidth) : 0;

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
