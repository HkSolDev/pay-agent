import { PDFParse } from "pdf-parse";

export const MAX_PDF_TEXT_CHARACTERS = 100_000;

/**
 * Extracts plain text from a PDF's raw bytes. Returns null rather than
 * throwing on anything unreadable — a corrupted or password-protected PDF
 * attachment must never take down ingestion for the rest of that email
 * (or the poll batch); it just means that attachment contributes no text.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: bytes });
    const result = await parser.getText();
    const text = result.text?.trim();
    return text ? text.slice(0, MAX_PDF_TEXT_CHARACTERS) : null;
  } catch {
    return null;
  } finally {
    // pdf-parse retains parser resources until destroy() is called. Cleanup
    // failure must not turn a successfully extracted invoice into an error.
    await parser?.destroy().catch(() => undefined);
  }
}
