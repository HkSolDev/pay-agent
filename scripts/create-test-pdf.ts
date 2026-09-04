import { writeFileSync } from "node:fs";

function createPdf(filename: string, lines: string[]) {
  let content = "BT\n/F1 12 Tf\n50 780 Td\n16 TL\n";
  for (const line of lines) {
    const safeLine = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    content += `(${safeLine}) '\n`;
  }
  content += "ET\n";

  const streamBytes = Buffer.from(content, "latin1");
  const streamLen = streamBytes.length;

  const objs: Buffer[] = [
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n", "latin1"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n", "latin1"),
    Buffer.from("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n", "latin1"),
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${streamLen} >>\nstream\n`, "latin1"),
      streamBytes,
      Buffer.from("endstream\nendobj\n", "latin1"),
    ]),
    Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  ];

  const header = Buffer.from("%PDF-1.4\n", "latin1");
  let currentOffset = header.length;
  const xrefOffsets: number[] = [0];

  for (const obj of objs) {
    xrefOffsets.push(currentOffset);
    currentOffset += obj.length;
  }

  const xrefPos = currentOffset;
  let xrefTable = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const offset of xrefOffsets.slice(1)) {
    xrefTable += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  const finalPdf = Buffer.concat([
    header,
    ...objs,
    Buffer.from(xrefTable, "latin1"),
    Buffer.from(trailer, "latin1"),
  ]);

  writeFileSync(filename, finalPdf);
}

const invoiceLines = [
  "TAX INVOICE",
  "==================================================",
  "",
  "Invoice Number: INV-2026-PDF-01",
  "Invoice Date: 31 August 2026",
  "Due Date: 15 September 2026",
  "",
  "Vendor: Test Auto-Pay Vendor",
  "Billed To: Owner / Perflo AP",
  "",
  "Description of Services:",
  "1. Backend Integration Consulting",
  "2. Security & Payment Gateway Testing",
  "",
  "--------------------------------------------------",
  "Total Amount Due: INR 500.00",
  "--------------------------------------------------",
  "",
  "Payment Details:",
  "Payment Rail: UPI",
  "UPI ID: autopaytest@okaxis",
  "",
  "==================================================",
  "Thank you for your business!"
];

createPdf("sample-invoice-inv-2026-pdf.pdf", invoiceLines);
console.log("PDF created successfully at sample-invoice-inv-2026-pdf.pdf");
