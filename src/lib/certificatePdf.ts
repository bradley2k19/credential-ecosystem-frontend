import type { StudentCertificate, StudentProfile } from "@/lib/api";
import { getAppOrigin } from "@/lib/appUrl";
import { formatCertificateDate } from "@/lib/verification";

const PAGE_CENTER = 105;
const TEXT_WIDTH = 160;

export function certificatePdfFileName(certificate: Pick<StudentCertificate, "programName" | "certificateUid">) {
  const programme = certificate.programName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "certificate";
  return `certificate-${programme}-${certificate.certificateUid.slice(0, 8)}.pdf`;
}

/** Builds a one-page A4 PDF in the browser and downloads it. The certificate hash is deliberately left out. */
export async function downloadCertificatePdf({
  certificate,
  profile,
  qrDataUrl,
}: {
  certificate: StudentCertificate;
  profile: Pick<StudentProfile, "fullName" | "studentNumber">;
  qrDataUrl: string;
}) {
  // Loaded on demand so the PDF library is only downloaded when a student actually asks for a PDF.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 36;

  // Writes centred, wrapped text and moves the cursor down past it.
  function write(text: string, size: number, style: "normal" | "bold", color: [number, number, number], gapAfter: number, font = "helvetica") {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, TEXT_WIDTH) as string[];
    doc.text(lines, PAGE_CENTER, y, { align: "center" });
    y += lines.length * size * 0.42 + gapAfter;
  }

  const dark: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [71, 85, 105];
  const teal: [number, number, number] = [15, 118, 110];

  doc.setDrawColor(...teal);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, 186, 273);

  write(certificate.institutionName, 20, "bold", dark, 10);
  write(certificate.certificateType, 26, "bold", teal, 8);
  write("awarded to", 11, "normal", muted, 4);
  write(profile.fullName, 20, "bold", dark, 2);
  write(`Student number: ${profile.studentNumber}`, 11, "normal", muted, 10);

  const details: [string, string][] = [["Programme", certificate.programName]];
  if (certificate.classification) details.push(["Classification", certificate.classification]);
  details.push(["Issue date", formatCertificateDate(certificate.issueDate)]);
  if (certificate.graduationDate) details.push(["Graduation date", formatCertificateDate(certificate.graduationDate)]);
  for (const [label, value] of details) write(`${label}: ${value}`, 12, "normal", dark, 3);

  y += 6;
  const qrSize = 58;
  doc.addImage(qrDataUrl, "PNG", PAGE_CENTER - qrSize / 2, y, qrSize, qrSize);
  y += qrSize + 8;

  write("Certificate ID", 10, "normal", muted, 2);
  write(certificate.certificateUid, 12, "bold", dark, 9, "courier");
  write(`Verify the authenticity of this certificate by scanning the QR code or visiting ${getAppOrigin()}/verify`, 10, "normal", muted, 0);

  doc.save(certificatePdfFileName(certificate));
}
