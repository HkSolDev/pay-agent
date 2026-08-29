import { describe, expect, it, vi } from "vitest";
import { PDFParse } from "pdf-parse";
import { extractPdfText } from "./pdf-extract.js";

// A hand-built, byte-accurate minimal single-page PDF — no external fixture
// file and no PDF-generation library needed. Verified once against a real
// PDF reader before this test was written.
function buildMinimalPdf(text: string): Uint8Array {
  const lines = text.split("\n");
  const contentOps = ["BT", "/F1 12 Tf", "14 TL", "50 750 Td"];
  lines.forEach((line, i) => {
    if (i > 0) contentOps.push("T*");
    const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    contentOps.push(`(${escaped}) Tj`);
  });
  contentOps.push("ET");
  const content = contentOps.join("\n");

  const objects: Record<number, string> = {
    1: `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    2: `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    3: `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,
    4: `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    5: `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  };

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += objects[i];
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("extractPdfText", () => {
  it("extracts text from a real, valid PDF", async () => {
    const pdf = buildMinimalPdf("TAX INVOICE\nInvoice No: INV-9001\nTOTAL AMOUNT DUE:\nRs 15000.00");
    const destroy = vi.spyOn(PDFParse.prototype, "destroy");
    try {
      const text = await extractPdfText(pdf);
      expect(text).toContain("TAX INVOICE");
      expect(text).toContain("Invoice No: INV-9001");
      expect(text).toContain("TOTAL AMOUNT DUE:");
      expect(text).toContain("Rs 15000.00");
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      destroy.mockRestore();
    }
  });

  it("returns null for bytes that aren't a valid PDF, instead of throwing", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(extractPdfText(garbage)).resolves.toBeNull();
  });

  it("returns null for an empty buffer", async () => {
    await expect(extractPdfText(new Uint8Array())).resolves.toBeNull();
  });
});
