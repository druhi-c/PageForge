/* Shared, deterministic PDF operations used by the UI and smoke checks. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PDFStudio = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  // Keep an explicit base URL for dynamic imports. When this classic script is
  // loaded from a file:// page, import() otherwise treats its referrer as
  // about:blank in Edge and cannot resolve a relative module specifier.
  const workflowScriptUrl = typeof document === 'object' ? document.currentScript?.src : '';

  function moveItem(items, from, to) {
    if (!Array.isArray(items) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    return items;
  }

  function duplicateItem(items, index) {
    if (!Array.isArray(items) || index < 0 || index >= items.length) return null;
    const original = items[index];
    const duplicate = { ...original, id: `page-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    if (original.crop) duplicate.crop = { ...original.crop };
    items.splice(index + 1, 0, duplicate);
    return duplicate;
  }

  function deleteItems(items, indices) {
    const uniqueDescending = [...new Set(indices)].filter((index) => Number.isInteger(index) && index >= 0 && index < items.length).sort((a, b) => b - a);
    for (const index of uniqueDescending) items.splice(index, 1);
    return items;
  }

  function insertBlank(items, index, width = 612, height = 792) {
    const blank = { id: `blank-${Date.now()}-${Math.random().toString(36).slice(2)}`, blank: true, fileId: null, fileName: 'Blank page', pageIndex: null, width, height, rotation: 0, crop: null, edits: [] };
    const insertionIndex = Math.max(0, Math.min(items.length, index + 1));
    items.splice(insertionIndex, 0, blank);
    return blank;
  }

  function splitPages(pages, breakAfter) {
    const boundaries = [...new Set(breakAfter)].filter((n) => Number.isInteger(n) && n > 0 && n < pages.length).sort((a, b) => a - b);
    if (!boundaries.length) throw new Error(`Enter a split point between page 1 and page ${Math.max(1, pages.length - 1)}.`);
    const parts = [];
    let start = 0;
    for (const boundary of boundaries) { parts.push(pages.slice(start, boundary)); start = boundary; }
    parts.push(pages.slice(start));
    return parts;
  }

  function colorFromHex(hex, pdfLib) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex || '#000000');
    if (!match) throw new Error('Choose a valid six-digit color.');
    const value = match[1];
    return pdfLib.rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
  }

  async function applyEdits(page, edits, pdfLib, doc, defaultFont, embedded, pageNumber, totalPages) {
    for (const edit of edits || []) {
      const color = colorFromHex(edit.color || '#000000', pdfLib);
      if (edit.type === 'text') {
        page.drawText(edit.text, { x: edit.x, y: edit.y, size: edit.size, font: defaultFont, color });
      } else if (edit.type === 'image' || edit.type === 'sign') {
        const key = edit.bytes;
        let image = embedded.get(key);
        if (!image) {
          image = edit.imageType === 'image/jpeg' ? await doc.embedJpg(edit.bytes) : await doc.embedPng(edit.bytes);
          embedded.set(key, image);
        }
        page.drawImage(image, { x: edit.x, y: edit.y, width: edit.width, height: edit.height });
      } else if (edit.type === 'highlight') {
        page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, color, opacity: 0.3 });
      } else if (edit.type === 'whiteout' || edit.type === 'redact') {
        page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, color: edit.type === 'redact' ? pdfLib.rgb(0, 0, 0) : pdfLib.rgb(1, 1, 1) });
      } else if (edit.type === 'rectangle') {
        page.drawRectangle({ x: edit.x, y: edit.y, width: edit.width, height: edit.height, borderColor: color, borderWidth: edit.strokeWidth || 2 });
      } else if (edit.type === 'ellipse') {
        page.drawEllipse({ x: edit.x + edit.width / 2, y: edit.y + edit.height / 2, xScale: edit.width / 2, yScale: edit.height / 2, borderColor: color, borderWidth: edit.strokeWidth || 2 });
      } else if (edit.type === 'line') {
        page.drawLine({ start: { x: edit.x, y: edit.y }, end: { x: edit.x + edit.width, y: edit.y + edit.height }, color, thickness: edit.strokeWidth || 2 });
      } else if (edit.type === 'draw') {
        for (const path of edit.paths || []) for (let i = 1; i < path.length; i++) page.drawLine({ start: { x: edit.x + path[i - 1][0] * edit.width, y: edit.y + (1 - path[i - 1][1]) * edit.height }, end: { x: edit.x + path[i][0] * edit.width, y: edit.y + (1 - path[i][1]) * edit.height }, color, thickness: edit.strokeWidth || 2, lineCap: pdfLib.LineCapStyle.Round });
      } else if (edit.type === 'watermark') {
        const textWidth = defaultFont.widthOfTextAtSize(edit.text, edit.size);
        page.drawText(edit.text, { x: (page.getWidth() - textWidth) / 2, y: (page.getHeight() - edit.size) / 2, size: edit.size, font: defaultFont, color, opacity: edit.opacity, rotate: pdfLib.degrees(edit.angle || 0) });
      } else if (edit.type === 'pageNumber') {
        const text = edit.format.replaceAll('{page}', String(pageNumber + edit.start - 1)).replaceAll('{total}', String(totalPages));
        const textWidth = defaultFont.widthOfTextAtSize(text, edit.size);
        const x = edit.position === 'top-right' ? page.getWidth() - textWidth - 36 : (page.getWidth() - textWidth) / 2;
        const y = edit.position === 'top-right' ? page.getHeight() - edit.size - 28 : 20;
        page.drawText(text, { x, y, size: edit.size, font: defaultFont, color });
      } else if (edit.type === 'headerFooter') {
        if (edit.header) page.drawText(edit.header, { x: 36, y: page.getHeight() - edit.size - 24, size: edit.size, font: defaultFont, color });
        if (edit.footer) page.drawText(edit.footer, { x: 36, y: 18, size: edit.size, font: defaultFont, color });
      } else if (edit.type === 'dateStamp') {
        const textWidth = defaultFont.widthOfTextAtSize(edit.date, edit.size);
        page.drawText(edit.date, { x: page.getWidth() - textWidth - 36, y: 18, size: edit.size, font: defaultFont, color });
      }
    }
  }

  async function rasterizeRedactedPages(bytes, redactedIndices, pdfLib, renderPage) {
    const indices = new Set(redactedIndices);
    const source = await pdfLib.PDFDocument.load(bytes);
    const result = await pdfLib.PDFDocument.create();
    let reader;
    if (!renderPage) {
      const pdfjs = await loadPdfJs();
      reader = await pdfJsDocument(pdfjs, bytes).promise;
      renderPage = async (index) => canvasPng(await reader.getPage(index + 1), 2);
    }
    try {
      for (let index = 0; index < source.getPageCount(); index++) {
        if (indices.has(index)) {
          const rendered = await renderPage(index);
          const image = await result.embedPng(rendered.pngBytes);
          const page = result.addPage([rendered.width, rendered.height]);
          page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
        } else {
          const [page] = await result.copyPages(source, [index]); result.addPage(page);
        }
      }
      return result.save();
    } finally { if (reader) await reader.destroy(); }
  }

  async function fillFormFields(bytes, values, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(bytes);
    const form = doc.getForm();
    const fields = new Map(form.getFields().map((field) => [field.getName(), field]));
    for (const [name, value] of Object.entries(values)) {
      const field = fields.get(name);
      if (!field) throw new Error(`Form field not found: ${name}`);
      if (typeof field.setText === 'function') field.setText(String(value));
      else if (typeof field.check === 'function' && typeof field.uncheck === 'function') value ? field.check() : field.uncheck();
      else if (typeof field.select === 'function') { if (value) field.select(String(value)); }
      else throw new Error(`This form field type is not supported: ${field.constructor.name}`);
    }
    form.updateFieldAppearances();
    form.flatten();
    return doc.save();
  }

  async function loadPdfJs() {
    const baseUrl = workflowScriptUrl || document.baseURI;
    const folder = new URL('./vendor/pdfjs/', baseUrl);
    const pdfjsUrl = new URL('pdf.min.mjs', folder);
    const pdfjs = await import(pdfjsUrl.href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', folder).href;
    return pdfjs;
  }

  function pdfJsDocument(pdfjs, bytes) {
    const folder = new URL('./vendor/pdfjs/', document.baseURI);
    return pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, cMapUrl: new URL('cmaps/', folder).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', folder).href });
  }

  async function canvasPng(page, scale) {
    const base = page.getViewport({ scale: 1 });
    const safeScale = Math.min(scale, 3600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: safeScale });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: context, viewport, background: 'white' }).promise;
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The page could not be rendered as an image.')), 'image/png'));
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    canvas.width = 0; canvas.height = 0;
    return { pngBytes, width: base.width, height: base.height };
  }

  async function pdfToImages(bytes, scale = 1.5, pdfjsApi) {
    const pdfjs = pdfjsApi || await loadPdfJs();
    const reader = await pdfJsDocument(pdfjs, bytes).promise; const images = [];
    try {
      for (let index = 1; index <= reader.numPages; index++) images.push(await canvasPng(await reader.getPage(index), scale));
      return images;
    } finally { await reader.destroy(); }
  }

  async function pdfToTextPages(bytes, pdfjsApi) {
    const pdfjs = pdfjsApi || await loadPdfJs();
    const reader = await pdfJsDocument(pdfjs, bytes).promise; const pageTexts = [];
    try {
      for (let index = 1; index <= reader.numPages; index++) {
        const content = await (await reader.getPage(index)).getTextContent({ includeMarkedContent: false });
        const text = content.items.map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('').replace(/[ \t]+\n/g, '\n').trim();
        pageTexts.push(text);
      }
      return pageTexts;
    } finally { await reader.destroy(); }
  }

  async function pdfToText(bytes, pdfjsApi) {
    const pages = await pdfToTextPages(bytes, pdfjsApi);
    return pages.map((text, index) => `--- Page ${index + 1} ---${text ? `\n${text}` : ''}`).join('\n\n');
  }

  async function comparePdfTexts(bytesA, bytesB, pdfjsApi) {
    const [pagesA, pagesB] = await Promise.all([pdfToTextPages(bytesA, pdfjsApi), pdfToTextPages(bytesB, pdfjsApi)]);
    const differences = [];
    for (let index = 0; index < Math.max(pagesA.length, pagesB.length); index++) {
      const leftText = pagesA[index] ?? null; const rightText = pagesB[index] ?? null;
      if (leftText !== rightText) differences.push({ page: index + 1, leftText, rightText });
    }
    return { pagesA: pagesA.length, pagesB: pagesB.length, differences };
  }

  async function imagesToPdf(images, pdfLib) {
    if (!images.length) throw new Error('Choose one or more PNG or JPEG images.');
    const doc = await pdfLib.PDFDocument.create();
    for (const imageFile of images) {
      const type = imageFile.type || imageFile.mimeType;
      const image = type === 'image/png' ? await doc.embedPng(imageFile.bytes) : type === 'image/jpeg' ? await doc.embedJpg(imageFile.bytes) : null;
      if (!image) throw new Error(`Unsupported image type: ${type || 'unknown'}`);
      const landscape = image.width > image.height;
      const pageWidth = landscape ? 842 : 595; const pageHeight = landscape ? 595 : 842; const margin = 24;
      const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
      const width = image.width * scale; const height = image.height * scale;
      const page = doc.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    }
    return doc.save();
  }

  async function updateMetadata(bytes, values, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(bytes);
    if (values.title) doc.setTitle(values.title);
    if (values.author) doc.setAuthor(values.author);
    if (values.subject) doc.setSubject(values.subject);
    if (values.keywords?.length) doc.setKeywords(values.keywords);
    return doc.save({ useObjectStreams: true });
  }

  async function removeMetadata(bytes, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(bytes);
    const infoReference = doc.context.trailerInfo.Info;
    if (infoReference) {
      const info = doc.context.lookup(infoReference);
      if (info?.keys && info?.delete) for (const key of info.keys()) info.delete(key);
      delete doc.context.trailerInfo.Info;
    }
    doc.catalog.delete(pdfLib.PDFName.of('Metadata'));
    return doc.save({ useObjectStreams: true });
  }

  async function compressPdf(bytes, pdfLib) {
    const doc = await pdfLib.PDFDocument.load(bytes);
    return doc.save({ useObjectStreams: true, objectsPerTick: 50 });
  }

  async function mergePages(files, pages, pdfLib, renderRedactedPage) {
    const output = await pdfLib.PDFDocument.create();
    const defaultFont = await output.embedFont(pdfLib.StandardFonts.Helvetica);
    const embeddedImages = new Map();
    const sources = new Map();
    for (const file of files) sources.set(file.id, await pdfLib.PDFDocument.load(file.bytes));
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      let copied;
      if (page.blank) {
        copied = output.addPage([page.width || 612, page.height || 792]);
      } else {
        const source = sources.get(page.fileId);
        if (!source || !Number.isInteger(page.pageIndex) || page.pageIndex < 0 || page.pageIndex >= source.getPageCount()) {
          throw new Error('A selected page is no longer available.');
        }
        [copied] = await output.copyPages(source, [page.pageIndex]);
        output.addPage(copied);
      }
      const currentAngle = copied.getRotation().angle;
      copied.setRotation(pdfLib.degrees((currentAngle + (page.rotation || 0) + 360) % 360));
      if (page.crop) {
        const box = copied.getCropBox();
        const { top = 0, right = 0, bottom = 0, left = 0 } = page.crop;
        if ([top, right, bottom, left].some((value) => !Number.isFinite(value) || value < 0) || left + right >= box.width || top + bottom >= box.height) {
          throw new Error(`Crop margins leave no printable area on ${page.fileName || 'a blank page'}.`);
        }
        copied.setCropBox(box.x + left, box.y + bottom, box.width - left - right, box.height - top - bottom);
      }
      await applyEdits(copied, page.edits, pdfLib, output, defaultFont, embeddedImages, pageIndex + 1, pages.length);
    }
    const bytes = await output.save();
    const redactedIndices = pages.map((page, index) => page.edits?.some((edit) => edit.type === 'redact') ? index : -1).filter((index) => index >= 0);
    return redactedIndices.length ? rasterizeRedactedPages(bytes, redactedIndices, pdfLib, renderRedactedPage) : bytes;
  }

  return { moveItem, duplicateItem, deleteItems, insertBlank, splitPages, mergePages, fillFormFields, rasterizeRedactedPages, pdfToImages, pdfToText, pdfToTextPages, comparePdfTexts, imagesToPdf, updateMetadata, removeMetadata, compressPdf };
});
