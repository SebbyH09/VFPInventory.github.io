/**
 * pdfExtractor.js
 *
 * Converts a PDF buffer (from an email attachment) into raw text.
 * Uses pdf-parse which handles most PDF encodings out of the box.
 */

const pdfParse = require('pdf-parse');

/**
 * Extract all text content from a PDF buffer.
 * @param {Buffer} pdfBuffer - Raw PDF file bytes
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPDF(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('pdfExtractor: Empty PDF buffer.');
  }

  const result = await pdfParse(pdfBuffer);
  return result.text;
}

module.exports = { extractTextFromPDF };
