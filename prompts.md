# PDF Studio prompts

## Prompt 1 - Merge, reorder, and save

Build the first PDF Studio increment as an offline app that runs locally in a browser. Keep all selected PDF data on this device and make no network requests. Implement only the first usable workflow: select one or more PDFs, combine their pages, reorder pages, and save a merged PDF. Show page order clearly, let the user reorder pages with drag and drop plus accessible move controls, and preserve page content and orientation. Use harmless sample PDFs for validation. Keep this project ready for one additional tool group per later prompt; do not claim tools that are not implemented and tested.

## Prompt 2 - Organise PDF pages

Continue the offline PDF Studio project. Add the remaining Organise tools to the existing merge/reorder/save flow: split the current ordered pages into parts, rotate pages, delete pages, duplicate pages, extract selected pages, insert a blank page, and crop selected pages. Keep all processing on-device, make the page order and selected pages clear, and keep the operations available with keyboard-accessible controls. Validate the new operations using harmless generated PDFs, including page order, page count, rotation, crop box, and blank page size. Update the README to describe what is implemented; do not claim unbuilt groups or features.

## Prompt 3 - Edit PDF pages and forms

Continue PDF Studio and add the Edit group: add text and images, highlight, draw, add rectangle/ellipse/line shapes, whiteout, redact, add a drawn signature, and fill existing form fields. Keep editing local. Use clear page coordinates and selection controls. Redaction must remove underlying page text from the output so covered text is not searchable; rasterize redacted pages and retain non-redacted pages as normal PDF pages. Explain that signatures are visual marks, not certificate-backed signatures, and that form fields are flattened after filling. Use a loopback-only local launcher for bundled PDF rendering if needed. Validate harmless sample PDFs, including that redacted text is absent from extraction/search and form values appear in the saved file. Update the README accurately.

## Prompt 4 - Stamp PDF pages

Continue PDF Studio and add the Stamp group: apply a text watermark, page numbers, header/footer text, and a date stamp to selected pages in the current order. Allow the watermark opacity and angle, page number format and placement, and simple header/footer text. Keep coordinates and styling consistent across pages and preserve all existing edits. Validate generated PDFs by extracting text and checking stamps on the intended pages. Update the README accurately and keep all processing local.

## Prompt 5 - Convert PDFs and images

Continue PDF Studio and add the Convert group: convert local PNG/JPEG images to a PDF, export the current ordered PDF pages as individual PNG images, and extract text from the current PDF into a downloadable text file. Keep conversion on-device using the bundled libraries, preserve page order, provide clear per-page image download links, and allow the generated image PDF to join the current workspace. Validate page counts, extracted text, image dimensions, and offline references. Update the README accurately.

## Prompt 6 - Finish PDFs

Continue PDF Studio and add the Finish group: compress the current output and show its file size before and after; edit common PDF metadata fields or remove metadata; and compare two loaded PDFs page by page. Compare extractable text and page counts, show clear side-by-side differences, and state that scanned pages without OCR cannot be text-compared. Keep processing local, preserve the current workspace, and validate compression sizes, metadata removal/editing, and compare results with harmless generated PDFs. Update the README accurately.
