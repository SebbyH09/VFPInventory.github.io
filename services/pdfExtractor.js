/**
 * pdfExtractor.js
 *
 * Converts a PDF buffer (from an email attachment or an upload) into raw text.
 *
 * pdf-parse v2 changed its API: instead of a single callable
 * `pdfParse(buffer)` it now exports a `PDFParse` class whose `getText()`
 * returns `{ text }`. This wrapper keeps the rest of the app on the old simple
 * `extractTextFromPDF(buffer) -> string` contract.
 */

const { PDFParse } = require('pdf-parse');

/**
 * Extract all text content from a PDF buffer.
 * @param {Buffer} pdfBuffer - Raw PDF file bytes
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPDF(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('pdfExtractor: Empty PDF buffer.');
  }

  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    // Release the worker/document so we don't leak between uploads.
    await parser.destroy();
  }
}

module.exports = { extractTextFromPDF };
