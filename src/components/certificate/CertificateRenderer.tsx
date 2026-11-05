"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { CertificateQrCode } from "@/components/certificate/CertificateQrCode";
import { getAppOrigin, getQrVerificationLink } from "@/lib/appUrl";
import { certificateFontClasses, certificateFontFamily } from "@/lib/certificateFonts";
import {
  certificateAssetUrl,
  formatDesignDate,
  mm,
  pageSizeMm,
  placeholderValues,
  resolvePlaceholders,
  splitBody,
  tidyText,
  type Align,
  type CertificateRenderData,
  type ColorToken,
  type RenderSnapshot,
} from "@/lib/certificateDesign";

export interface CertificateLayout {
  /** True when the content still does not fit inside the border at the smallest allowed font scale. */
  overflow: boolean;
  /** The scale applied to body and name font sizes, from 1 down to 0.7. */
  fontScale: number;
}

const FIT_STEP = 0.05;
const MIN_FONT_SCALE = 0.7;
const CONTENT_PADDING_MM = 5;
const ACCENT_BAR_MM = 6;
const DOUBLE_BORDER_GAP_MM = 1.2;
const SIGNATURE_MAX_HEIGHT_MM = 14;
const MANDATORY_LINE_PT = 7.5;

const flexAlign: Record<Align, CSSProperties["alignItems"]> = { left: "flex-start", center: "center", right: "flex-end" };

/** Body and name sizes follow the auto-fit scale through a CSS variable set on the page element. */
function scaledPt(sizePt: number) {
  return `calc(${sizePt}pt * var(--cert-fit, 1))`;
}

function innerBorderWidthMm(widthMm: number) {
  return Math.max(0.25, widthMm * 0.4);
}

/** How far the border reaches into the page, so the content area starts inside it. */
function borderDepthMm(border: RenderSnapshot["design"]["border"]) {
  if (border.style === "none") return 0;
  if (border.style === "double") return border.widthMm + DOUBLE_BORDER_GAP_MM + innerBorderWidthMm(border.widthMm);
  return border.widthMm;
}

/**
 * The single certificate renderer. Draws the page at its true size (1 mm = 3.7795 px) and never scales itself;
 * the preview, the PDF export and the verification page all use this component. Text is rendered as React text
 * nodes only, and images only come from the API's asset route.
 */
export function CertificateRenderer({
  snapshot,
  data,
  onLayout,
}: {
  snapshot: RenderSnapshot;
  data: CertificateRenderData;
  onLayout?: (layout: CertificateLayout) => void;
}) {
  const { design } = snapshot;
  const pageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onLayoutRef = useRef(onLayout);
  const lastReportRef = useRef("");

  useLayoutEffect(() => {
    onLayoutRef.current = onLayout;
  });

  // Auto-fit: shrink body and name text in steps until the content fits inside the border, down to 70%.
  // Runs after every render, and again whenever a font or image finishes loading and changes the layout.
  useLayoutEffect(() => {
    const page = pageRef.current;
    const content = contentRef.current;
    if (!page || !content) return;

    const overflows = () => content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1;
    const fit = () => {
      let scale = 1;
      page.style.setProperty("--cert-fit", "1");
      while (overflows() && scale > MIN_FONT_SCALE) {
        scale = Math.max(MIN_FONT_SCALE, Math.round((scale - FIT_STEP) * 100) / 100);
        page.style.setProperty("--cert-fit", String(scale));
      }
      const layout = { overflow: overflows(), fontScale: scale };
      const report = `${layout.overflow}:${layout.fontScale}`;
      if (report !== lastReportRef.current) {
        lastReportRef.current = report;
        onLayoutRef.current?.(layout);
      }
    };

    fit();
    const images = Array.from(page.querySelectorAll("img"));
    images.forEach((image) => image.addEventListener("load", fit));
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      images.forEach((image) => image.removeEventListener("load", fit));
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  });

  const pageMm = pageSizeMm(design.page);
  const colors: Record<ColorToken, string> = {
    primary: design.theme.primaryColor,
    accent: design.theme.accentColor,
    text: design.theme.textColor,
    muted: design.theme.mutedColor,
  };
  const values = placeholderValues(data, snapshot);
  const institutionName = snapshot.institution.name || data.institutionName;
  const logoUrl = certificateAssetUrl(snapshot.institution.logoAssetId);
  const sealUrl = certificateAssetUrl(snapshot.institution.sealAssetId);
  const contentInsetMm = design.border.insetMm + borderDepthMm(design.border) + CONTENT_PADDING_MM;

  const title = tidyText(resolvePlaceholders(design.title.text, values));
  const body = splitBody(design.body.text, values);
  const footer = tidyText(resolvePlaceholders(design.footer.text, values));
  const detailLines = [
    design.fields.showClassification && data.classification ? `Classification: ${data.classification}` : "",
    design.fields.showGraduationDate && data.graduationDate ? `Graduation date: ${formatDesignDate(data.graduationDate, design.fields.dateFormat)}` : "",
    design.fields.showStudentNumber && data.studentNumber ? `Student number: ${data.studentNumber}` : "",
  ].filter(Boolean);

  const headingFamily = certificateFontFamily(design.theme.headingFont);
  const bodyFamily = certificateFontFamily(design.theme.bodyFont);
  const nameFamily = certificateFontFamily(design.theme.nameFont);
  const wrap: CSSProperties = { overflowWrap: "anywhere", margin: 0 };

  return (
    <div
      className={certificateFontClasses}
      ref={pageRef}
      style={{
        position: "relative",
        width: mm(pageMm.width),
        height: mm(pageMm.height),
        overflow: "hidden",
        backgroundColor: design.theme.backgroundColor,
        color: colors.text,
        fontFamily: bodyFamily,
        boxSizing: "border-box",
      }}
    >
      {design.background.accentBar !== "none" && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            backgroundColor: colors.primary,
            ...(design.background.accentBar === "top"
              ? { top: 0, left: 0, right: 0, height: mm(ACCENT_BAR_MM) }
              : { top: 0, bottom: 0, left: 0, width: mm(ACCENT_BAR_MM) }),
          }}
        />
      )}

      <Watermark design={design} logoUrl={logoUrl} sealUrl={sealUrl} />
      <Border color={colors[design.border.color]} design={design} />

      <div
        ref={contentRef}
        style={{
          position: "absolute",
          inset: mm(contentInsetMm),
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 2,
        }}
      >
        <Header colors={colors} design={design} headingFamily={headingFamily} institutionName={institutionName} logoUrl={logoUrl} sealUrl={sealUrl} />

        <div style={{ flex: "1 0 auto", display: "flex", flexDirection: "column", justifyContent: "center", gap: mm(3), padding: `${mm(2)}px 0` }}>
          {title && (
            <h1
              style={{
                ...wrap,
                fontFamily: headingFamily,
                fontSize: `${design.title.sizePt}pt`,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: `${design.title.letterSpacing}pt`,
                textTransform: design.title.uppercase ? "uppercase" : "none",
                textAlign: design.title.align,
                color: colors[design.title.color],
              }}
            >
              {title}
            </h1>
          )}

          <div style={{ textAlign: design.body.align, fontSize: scaledPt(design.body.sizePt), lineHeight: design.body.lineHeight, display: "flex", flexDirection: "column", gap: mm(1.5) }}>
            {body.before && <p style={wrap}>{body.before}</p>}
            {body.name && (
              <p
                style={{
                  ...wrap,
                  fontFamily: nameFamily,
                  fontSize: scaledPt(design.body.nameSizePt),
                  lineHeight: 1.2,
                  color: colors[design.body.nameColor],
                }}
              >
                {body.name}
              </p>
            )}
            {body.after && <p style={wrap}>{body.after}</p>}
          </div>

          {detailLines.length > 0 && (
            <div style={{ textAlign: design.body.align, color: colors.muted, fontSize: scaledPt(Math.max(8, design.body.sizePt * 0.8)), lineHeight: 1.35 }}>
              {detailLines.map((line) => <p key={line} style={wrap}>{line}</p>)}
            </div>
          )}
        </div>

        <Signatories colors={colors} design={design} signatories={snapshot.signatories} />

        <BottomRow
          certificateUid={data.certificateUid}
          colors={colors}
          design={design}
          footer={footer}
        />
      </div>
    </div>
  );
}

type Design = RenderSnapshot["design"];

/** An asset image; omitted entirely when the URL is missing or the image fails to load. */
function AssetImg({ src, alt, style }: { src: string | null; alt: string; style: CSSProperties }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      crossOrigin="anonymous"
      onError={(event) => { event.currentTarget.style.display = "none"; }}
      src={src}
      style={{ objectFit: "contain", display: "block", ...style }}
    />
  );
}

function Watermark({ design, logoUrl, sealUrl }: { design: Design; logoUrl: string | null; sealUrl: string | null }) {
  const source = design.background.watermark === "logo" ? logoUrl : design.background.watermark === "seal" ? sealUrl : null;
  if (!source) return null;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 0 }}>
      <AssetImg alt="" src={source} style={{ width: "50%", height: "70%", opacity: design.background.watermarkOpacity }} />
    </div>
  );
}

function Border({ design, color }: { design: Design; color: string }) {
  const { style, widthMm, insetMm } = design.border;
  if (style === "none") return null;
  const layer: CSSProperties = { position: "absolute", inset: mm(insetMm), border: `${mm(widthMm)}px solid ${color}`, zIndex: 1, pointerEvents: "none" };

  if (style === "double") {
    const innerInset = insetMm + widthMm + DOUBLE_BORDER_GAP_MM;
    return (
      <>
        <div aria-hidden="true" style={layer} />
        <div aria-hidden="true" style={{ ...layer, inset: mm(innerInset), border: `${mm(innerBorderWidthMm(widthMm))}px solid ${color}` }} />
      </>
    );
  }

  if (style === "frame") {
    const cornerMm = Math.max(3, widthMm * 3);
    const offset = mm(insetMm + widthMm / 2 - cornerMm / 2);
    const corner = (position: CSSProperties): ReactNode => (
      <div aria-hidden="true" style={{ position: "absolute", width: mm(cornerMm), height: mm(cornerMm), backgroundColor: color, zIndex: 1, ...position }} />
    );
    return (
      <>
        <div aria-hidden="true" style={layer} />
        {corner({ top: offset, left: offset })}
        {corner({ top: offset, right: offset })}
        {corner({ bottom: offset, left: offset })}
        {corner({ bottom: offset, right: offset })}
      </>
    );
  }

  return <div aria-hidden="true" style={layer} />;
}

function Header({ design, colors, headingFamily, institutionName, logoUrl, sealUrl }: {
  design: Design;
  colors: Record<ColorToken, string>;
  headingFamily: string;
  institutionName: string;
  logoUrl: string | null;
  sealUrl: string | null;
}) {
  const { header } = design;
  const logo = header.showLogo ? logoUrl : null;
  const seal = header.showSeal ? sealUrl : null;
  // The seal goes opposite the logo, and on the right when the logo is centred.
  const sealPosition: Align = header.logoPosition === "right" ? "left" : "right";
  const showName = header.showInstitutionName && institutionName;
  if (!logo && !seal && !showName) return null;

  const imageStyle: CSSProperties = { height: mm(header.logoHeightMm), maxWidth: "100%" };
  const cell = (position: Align) => (
    <div style={{ display: "flex", justifyContent: flexAlign[position], alignItems: "center", minWidth: 0 }}>
      {logo && header.logoPosition === position && <AssetImg alt={`${institutionName} logo`} src={logo} style={imageStyle} />}
      {seal && sealPosition === position && <AssetImg alt={`${institutionName} seal`} src={seal} style={imageStyle} />}
    </div>
  );

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: mm(1.5) }}>
      {(logo || seal) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
          {cell("left")}
          {cell("center")}
          {cell("right")}
        </div>
      )}
      {showName && (
        <p
          style={{
            margin: 0,
            overflowWrap: "anywhere",
            textAlign: header.logoPosition,
            fontFamily: headingFamily,
            fontSize: `${header.institutionNameSizePt}pt`,
            fontWeight: 700,
            lineHeight: 1.2,
            color: colors[header.institutionNameColor],
          }}
        >
          {institutionName}
        </p>
      )}
    </div>
  );
}

function Signatories({ design, colors, signatories }: { design: Design; colors: Record<ColorToken, string>; signatories: RenderSnapshot["signatories"] }) {
  const shown = signatories.slice(0, 3);
  if (shown.length === 0) return null;
  // Reserve the signature height for everyone when anyone has one, so the lines stay level.
  const anySignature = shown.some((signatory) => certificateAssetUrl(signatory.signatureAssetId));

  return (
    <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-evenly", gap: mm(8), marginTop: mm(2) }}>
      {shown.map((signatory, index) => {
        const signatureUrl = certificateAssetUrl(signatory.signatureAssetId);
        return (
          <div key={`${signatory.name}-${index}`} style={{ flex: "0 1 30%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            {anySignature && (
              <div style={{ height: mm(SIGNATURE_MAX_HEIGHT_MM), width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <AssetImg alt={`Signature of ${signatory.name}`} src={signatureUrl} style={{ maxHeight: mm(SIGNATURE_MAX_HEIGHT_MM), maxWidth: "100%" }} />
              </div>
            )}
            <div
              style={{
                width: "100%",
                marginTop: mm(1),
                paddingTop: mm(1.5),
                borderTop: design.signatories.lineStyle === "line" ? `${mm(0.3)}px solid ${colors.text}` : "none",
              }}
            >
              <p style={{ margin: 0, overflowWrap: "anywhere", fontWeight: 700, fontSize: "10.5pt", lineHeight: 1.3 }}>{signatory.name}</p>
              {design.signatories.showTitles && signatory.title && (
                <p style={{ margin: 0, overflowWrap: "anywhere", color: colors.muted, fontSize: "9pt", lineHeight: 1.3 }}>{signatory.title}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BottomRow({ design, colors, footer, certificateUid }: { design: Design; colors: Record<ColorToken, string>; footer: string; certificateUid: string }) {
  const position = design.verification.qrPosition === "bottom-left" ? "left" : design.verification.qrPosition === "bottom-right" ? "right" : "center";
  const footerText = footer && (
    <p style={{ margin: 0, overflowWrap: "anywhere", fontSize: `${design.footer.sizePt}pt`, lineHeight: 1.4, textAlign: design.footer.align, color: colors.text }}>{footer}</p>
  );

  // Mandatory and not configurable: no template can remove the certificate ID or the verification address.
  const mandatoryLines = (
    <div style={{ textAlign: position, color: colors.muted, fontSize: `${MANDATORY_LINE_PT}pt`, lineHeight: 1.35, minWidth: 0 }}>
      <p style={{ margin: 0, overflowWrap: "anywhere" }}>Certificate ID: {certificateUid}</p>
      <p style={{ margin: 0, overflowWrap: "anywhere" }}>Verify at {getAppOrigin()}/verify</p>
    </div>
  );
  // Drawn above every other element and always black on white, so it stays scannable.
  const qr = (
    <div style={{ position: "relative", zIndex: 10, flexShrink: 0 }}>
      <CertificateQrCode sizePx={mm(design.verification.qrSizeMm)} value={getQrVerificationLink(certificateUid)} />
    </div>
  );

  if (position === "center") {
    // No side column is left with the QR code in the centre, so the footer sits above it and the lines below.
    return (
      <div style={{ flexShrink: 0, marginTop: mm(3), display: "flex", flexDirection: "column", alignItems: "center", gap: mm(1.5) }}>
        {footerText && <div style={{ alignSelf: "stretch" }}>{footerText}</div>}
        {qr}
        {mandatoryLines}
      </div>
    );
  }

  // In a corner, the lines sit beside the QR code (on its inner side) and the footer fills the rest of the row.
  const qrBlock = (
    <div style={{ display: "flex", flexDirection: position === "left" ? "row" : "row-reverse", alignItems: "flex-end", gap: mm(2.5), minWidth: 0 }}>
      {qr}
      {mandatoryLines}
    </div>
  );
  return (
    <div
      style={{
        flexShrink: 0,
        marginTop: mm(3),
        display: "grid",
        gridTemplateColumns: position === "left" ? "auto 1fr" : "1fr auto",
        alignItems: "end",
        columnGap: mm(6),
      }}
    >
      {position === "left" ? <>{qrBlock}<div style={{ minWidth: 0 }}>{footerText}</div></> : <><div style={{ minWidth: 0 }}>{footerText}</div>{qrBlock}</>}
    </div>
  );
}
