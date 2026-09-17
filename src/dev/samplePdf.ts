/**
 * A small, valid PDF, assembled at runtime for the preview harness.
 *
 * Built by hand rather than checked in as a binary so the harness stays a
 * single readable fixture set, and so the page count can be varied. It uses
 * Helvetica without embedding it, which is the case that leans on the standard
 * font data staged in `public/pdfjs` — exactly what a preview needs to prove.
 *
 * Development only; nothing imports it from a production path.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** Escapes the characters that would otherwise end a PDF string literal. */
function literal(text: string): string {
  return text.replace(/([\\()])/g, '\\$1');
}

function contentStream(page: number, pages: number): string {
  const lines = [
    'BT /F1 28 Tf 60 760 Td (Angebot 2026-0417) Tj ET',
    `BT /F1 12 Tf 60 730 Td (${literal(`Seite ${page} von ${pages}`)}) Tj ET`,
    'BT /F1 11 Tf 60 690 Td (Position 1  Austausch Netzteil               149,00 EUR) Tj ET',
    'BT /F1 11 Tf 60 670 Td (Position 2  Arbeitszeit vor Ort, 2 Stunden   190,00 EUR) Tj ET',
    'BT /F1 11 Tf 60 650 Td (Position 3  Anfahrt Pauschale                 45,00 EUR) Tj ET',
    '0.5 w 60 630 m 460 630 l S',
    'BT /F1 12 Tf 60 605 Td (Summe netto                              384,00 EUR) Tj ET',
    // A filled rule per page, so a wrong page is obvious at a glance while
    // scrolling rather than only readable up close.
    `0.85 0.85 0.85 rg 60 ${560 - page * 14} 400 8 re f`,
  ];
  return lines.join('\n');
}

export function makeSamplePdf(pages = 4): Uint8Array {
  // Object 1 is the catalogue, 2 the page tree, 3 the font; each page then
  // takes a pair — the page itself, then its content stream.
  const pageIds = Array.from({ length: pages }, (_, i) => 4 + i * 2);

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  for (let i = 0; i < pages; i++) {
    const stream = contentStream(i + 1, pages);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let file = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  // Every cross-reference row is exactly 20 bytes, padding included.
  const startxref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    file += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  // The content is ASCII throughout, so string length and byte offset agree —
  // which is what makes the offsets above correct.
  return new TextEncoder().encode(file);
}
