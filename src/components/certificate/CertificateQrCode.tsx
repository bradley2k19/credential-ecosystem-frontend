import QRCode from "qrcode";
import { useMemo } from "react";

const QUIET_ZONE_MODULES = 4;

/**
 * A QR code drawn as inline SVG rectangles from the qrcode package's module matrix. Always black on white,
 * whatever the certificate theme, with a 4-module white quiet zone, so it stays scannable on screen and in PDFs.
 */
export function CertificateQrCode({ value, sizePx }: { value: string; sizePx: number }) {
  const { total, runs } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    // One rectangle per horizontal run of dark modules keeps the SVG small.
    const darkRuns: { x: number; y: number; width: number }[] = [];
    for (let row = 0; row < count; row += 1) {
      let start = -1;
      for (let col = 0; col <= count; col += 1) {
        const dark = col < count && qr.modules.get(row, col) === 1;
        if (dark && start === -1) start = col;
        if (!dark && start !== -1) {
          darkRuns.push({ x: start + QUIET_ZONE_MODULES, y: row + QUIET_ZONE_MODULES, width: col - start });
          start = -1;
        }
      }
    }
    return { total: count + QUIET_ZONE_MODULES * 2, runs: darkRuns };
  }, [value]);

  return (
    <svg
      aria-label="QR code linking to this certificate's verification page"
      height={sizePx}
      role="img"
      shapeRendering="crispEdges"
      style={{ display: "block" }}
      viewBox={`0 0 ${total} ${total}`}
      width={sizePx}
    >
      <rect fill="#FFFFFF" height={total} width={total} x={0} y={0} />
      {runs.map((run) => <rect fill="#000000" height={1} key={`${run.x}-${run.y}`} width={run.width} x={run.x} y={run.y} />)}
    </svg>
  );
}
