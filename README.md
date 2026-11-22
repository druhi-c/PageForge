# PageForge

PageForge is a local, offline-first PDF workspace for organising, editing, and stamping PDFs.

## Run it

On Windows, double-click `start-pdf-studio.cmd`, then open `http://127.0.0.1:4173/` in a modern browser. Node.js is required to run the small static server. It listens only on loopback, accepts no uploads, and serves the app and bundled libraries from this folder. No account or internet connection is needed; selected PDFs are read and processed in the browser.

## Current features

- Open multiple PDF files from your device.
- Combine their pages into one output PDF.
- Reorder pages by dragging them or using the arrow controls (Alt + Left/Right also moves the focused page).
- Rotate, delete, duplicate, and extract selected pages.
- Insert a blank letter-size page at the end or after the selected page.
- Crop selected pages by entering top, right, bottom, and left margins in points.
- Split the current page sequence at one or more page numbers and download each part separately.
- Add text and PNG/JPEG images to selected pages.
- Highlight, draw, add rectangle/ellipse/line shapes, whiteout, and redact selected areas.
- Rasterize each redacted page so its text is no longer selectable or searchable. Other pages remain normal PDFs.
- Draw and place a signature mark. This is a visual signature, not a certificate-backed digital signature.
- Fill text, checkbox, and choice fields in existing PDF forms; filled values are flattened into page content.
- Add text watermarks with adjustable opacity and angle.
- Add page numbers with a format such as `Page {page} of {total}` and choose bottom-center or top-right placement.
- Add header and footer text, plus a date stamp, to selected pages.
- Convert local PNG/JPEG images into a PDF that joins the current page workspace.
- Export each page of the current PDF as a PNG at a chosen resolution.
- Extract current PDF text into a readable panel and downloadable `.txt` file.
- Compress the current output and report its before/after file sizes.
- Set title, author, subject, and keywords on the next saved output, or remove the output's document metadata.
- Compare two loaded PDFs by page count and extractable text, with side-by-side changed-page details. Scanned pages without text are not OCR-compared.
- Save the merged PDF to your device.

Organise, Edit, Stamp, Convert, and Finish are implemented.

The app bundles pdf-lib and PDF.js locally. Their licenses are in `vendor/PDF-LIB-LICENSE.md` and `vendor/PDFJS-LICENSE`.
