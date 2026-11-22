/* All document operations use bundled pdf-lib in this page; no network APIs are used. */
(() => {
  const input = document.querySelector('#pdf-input');
  const dropZone = document.querySelector('#drop-zone');
  const fileList = document.querySelector('#file-list');
  const pagesEl = document.querySelector('#pages');
  const organiseTools = document.querySelector('#organise-tools');
  const editTools = document.querySelector('#edit-tools');
  const stampTools = document.querySelector('#stamp-tools');
  const imageResults = document.querySelector('#image-results');
  const textOutput = document.querySelector('#text-output');
  const compareResults = document.querySelector('#compare-results');
  const pageCount = document.querySelector('#page-count');
  const emptyHint = document.querySelector('#empty-hint');
  const saveButton = document.querySelector('#save-button');
  const status = document.querySelector('#status');
  const selectionCount = document.querySelector('#selection-count');
  const selected = new Set();
  const drawingCanvas = document.querySelector('#draw-canvas');
  const drawingContext = drawingCanvas.getContext('2d');
  const drawingPaths = [];
  let activeDrawingPath = null;
  const splitResults = document.querySelector('#split-results');
  let splitUrls = [];
  let imageUrls = [];
  let outputMetadata = null;
  let stripOutputMetadata = false;
  const localToday = new Date();
  document.querySelector('#stamp-date').value = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;

  let files = [];
  let pages = [];
  let dragIndex = null;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const formatBytes = (bytes) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  function refresh() {
    pageCount.textContent = pages.length ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${files.length} ${files.length === 1 ? 'PDF' : 'PDFs'}` : 'Add PDFs to get started';
    saveButton.disabled = pages.length === 0;
    emptyHint.hidden = pages.length > 0;
    organiseTools.hidden = pages.length === 0;
    editTools.hidden = pages.length === 0;
    stampTools.hidden = pages.length === 0;
    const selectedCount = selected.size;
    selectionCount.textContent = selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} selected` : 'No pages selected';
    for (const id of ['rotate-left', 'rotate-right', 'duplicate-pages', 'delete-pages', 'extract-pages', 'crop-pages']) document.querySelector(`#${id}`).disabled = selectedCount === 0;
    document.querySelector('#select-all').textContent = selectedCount === pages.length ? 'Clear selection' : 'Select all';
    document.querySelector('#edit-selection-count').textContent = selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} selected` : 'Select pages to add marks or images';
    document.querySelector('#stamp-selection-count').textContent = selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} selected` : 'Select pages to stamp';
    document.querySelectorAll('.stamp-action').forEach((button) => { button.disabled = selectedCount === 0; });
    document.querySelector('#pdf-to-images').disabled = pages.length === 0;
    document.querySelector('#pdf-to-text').disabled = pages.length === 0;
    document.querySelector('#compress-pdf').disabled = pages.length === 0;
    document.querySelector('#images-to-pdf').disabled = document.querySelector('#convert-image-input').files.length === 0;
    for (const id of ['add-text', 'add-image', 'apply-mark']) document.querySelector(`#${id}`).disabled = selectedCount === 0;
    document.querySelector('#add-drawing').disabled = selectedCount === 0 || drawingPaths.length === 0;
    document.querySelector('#add-signature').disabled = selectedCount === 0 || drawingPaths.length === 0;
    refreshFormFiles();
    refreshFinishFiles();
    fileList.replaceChildren(...files.map((entry, index) => {
      const row = document.createElement('div'); row.className = 'file-row';
      const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = 'PDF'; icon.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'file-info';
      const name = document.createElement('div'); name.className = 'file-name'; name.textContent = entry.file.name;
      const meta = document.createElement('div'); meta.className = 'file-meta'; meta.textContent = `${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'} · ${formatBytes(entry.file.size)}`;
      const remove = document.createElement('button'); remove.className = 'remove-file'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
      remove.addEventListener('click', () => { files.splice(index, 1); pages = pages.filter((page) => page.fileId !== entry.id); for (const page of selected) if (page.fileId === entry.id) selected.delete(page); clearSplitResults(); refresh(); setStatus('PDF removed.'); });
      info.append(name, meta); row.append(icon, info, remove); return row;
    }));

    pagesEl.replaceChildren(...pages.map((page, index) => {
      const card = document.createElement('article'); card.className = `page-card${selected.has(page) ? ' is-selected' : ''}`; card.draggable = true; card.tabIndex = 0;
      const sourceDescription = page.blank ? 'blank page' : `${page.fileName}, original page ${page.pageIndex + 1}`;
      card.setAttribute('aria-label', `Page ${index + 1}, ${sourceDescription}. Use left and right arrow buttons to reorder.`);
      const checkbox = document.createElement('input'); checkbox.className = 'page-select'; checkbox.type = 'checkbox'; checkbox.checked = selected.has(page); checkbox.setAttribute('aria-label', `Select page ${index + 1}`);
      checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(page); else selected.delete(page); refresh(); });
      const preview = document.createElement('div'); preview.className = 'paper-preview'; preview.setAttribute('aria-hidden', 'true');
      const label = document.createElement('div'); label.className = 'page-label';
      const pageLabel = document.createElement('strong'); pageLabel.textContent = `Page ${index + 1}`;
      const badges = [];
      if (page.rotation) badges.push(`${page.rotation}°`);
      if (page.crop) badges.push('cropped');
      const sourceLabel = document.createElement('span'); sourceLabel.textContent = page.blank ? 'blank page' : `${shortName(page.fileName)}${badges.length ? ` · ${badges.join(' · ')}` : ''}`; sourceLabel.title = page.fileName;
      label.append(pageLabel, sourceLabel);
      const actions = document.createElement('div'); actions.className = 'page-actions';
      const left = actionButton('←', `Move page ${index + 1} left`, index === 0, () => movePage(index, index - 1));
      const right = actionButton('→', `Move page ${index + 1} right`, index === pages.length - 1, () => movePage(index, index + 1));
      actions.append(left, right); card.append(checkbox, preview, label, actions);
      card.addEventListener('dragstart', (event) => { dragIndex = index; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); });
      card.addEventListener('dragend', () => { dragIndex = null; card.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach((node) => node.classList.remove('drop-target')); });
      card.addEventListener('dragover', (event) => { event.preventDefault(); card.classList.add('drop-target'); });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (event) => { event.preventDefault(); card.classList.remove('drop-target'); const from = dragIndex ?? Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) movePage(from, index); });
      card.addEventListener('keydown', (event) => { if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); movePage(index, index - 1); } if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); movePage(index, index + 1); } });
      return card;
    }));
  }

  function actionButton(text, label, disabled, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label); button.disabled = disabled;
    button.addEventListener('click', (event) => { event.stopPropagation(); action(); }); return button;
  }
  function shortName(name) { return name.length > 15 ? `${name.slice(0, 12)}…` : name; }
  function movePage(from, to) {
    if (from < 0 || to < 0 || from >= pages.length || to >= pages.length || from === to) return;
    PDFStudio.moveItem(pages, from, to); clearSplitResults(); refresh(); setStatus(`Page moved to position ${to + 1}.`);
  }

  function clearSplitResults() {
    for (const url of splitUrls) URL.revokeObjectURL(url);
    splitUrls = []; splitResults.replaceChildren();
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls = []; imageResults.replaceChildren(); textOutput.value = ''; document.querySelector('#text-download').hidden = true; compareResults.replaceChildren();
  }
  function refreshFormFiles() {
    const select = document.querySelector('#form-file');
    const current = select.value;
    if (select.options.length === files.length && [...select.options].every((option, index) => option.value === files[index].id)) return;
    select.replaceChildren(...files.map((entry) => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.file.name; return option; }));
    if (files.some((entry) => entry.id === current)) select.value = current;
    document.querySelector('#form-fields').replaceChildren(); document.querySelector('#fill-form').hidden = true;
  }
  function refreshFinishFiles() {
    let changed = false;
    for (const id of ['compare-left', 'compare-right']) {
      const select = document.querySelector(`#${id}`); const current = select.value;
      if (select.options.length === files.length && [...select.options].every((option, index) => option.value === files[index].id)) continue;
      select.replaceChildren(...files.map((entry) => { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.file.name; return option; }));
      if (files.some((entry) => entry.id === current)) select.value = current;
      else if (id === 'compare-right' && files.length > 1) select.value = files[1].id;
      changed = true;
    }
    if (changed) compareResults.replaceChildren();
    document.querySelector('#compare-pdfs').disabled = files.length < 2;
  }
  function downloadBlob(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectedIndices() { return pages.map((page, index) => selected.has(page) ? index : -1).filter((index) => index >= 0); }
  function pagesChanged(message) { clearSplitResults(); refresh(); setStatus(message); }

  function rotateSelected(degrees) {
    for (const page of selected) page.rotation = ((page.rotation || 0) + degrees + 360) % 360;
    pagesChanged(`Rotated ${selected.size} selected ${selected.size === 1 ? 'page' : 'pages'}.`);
  }
  function duplicateSelected() {
    const indices = selectedIndices(); selected.clear();
    for (const index of indices.sort((a, b) => b - a)) selected.add(PDFStudio.duplicateItem(pages, index));
    pagesChanged('Selected pages duplicated.');
  }
  function deleteSelected() {
    const indices = selectedIndices();
    PDFStudio.deleteItems(pages, indices); selected.clear();
    pagesChanged(`${indices.length} ${indices.length === 1 ? 'page' : 'pages'} deleted.`);
  }
  function insertBlank() {
    const indices = selectedIndices(); const after = indices.length ? Math.max(...indices) : pages.length - 1;
    const blank = PDFStudio.insertBlank(pages, after);
    selected.clear(); selected.add(blank); pagesChanged('Blank letter-size page inserted.');
  }
  async function extractSelected() {
    const chosen = pages.filter((page) => selected.has(page));
    if (!chosen.length) return;
    try { downloadBlob(await PDFStudio.mergePages(files, chosen, PDFLib), 'extracted-pages.pdf'); setStatus(`Extracted ${chosen.length} ${chosen.length === 1 ? 'page' : 'pages'}.`); }
    catch (error) { setStatus(`Could not extract pages: ${error.message}`, true); }
  }
  function cropSelected() {
    const margins = Object.fromEntries(['top', 'right', 'bottom', 'left'].map((side) => [side, Number(document.querySelector(`#crop-${side}`).value)]));
    if (Object.values(margins).some((value) => !Number.isFinite(value) || value < 0)) { setStatus('Crop margins must be zero or greater.', true); return; }
    for (const page of selected) page.crop = { ...margins };
    pagesChanged(`Crop set on ${selected.size} selected ${selected.size === 1 ? 'page' : 'pages'}.`);
  }
  async function splitCurrentPages() {
    const values = document.querySelector('#split-breaks').value.split(',').map((value) => value.trim()).filter(Boolean).map(Number);
    if (values.some((value) => !Number.isInteger(value))) { setStatus('Enter split points as whole page numbers separated by commas.', true); return; }
    clearSplitResults();
    try {
      const parts = PDFStudio.splitPages(pages, values);
      const outputs = await Promise.all(parts.map((part) => PDFStudio.mergePages(files, part, PDFLib)));
      outputs.forEach((bytes, index) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); splitUrls.push(url);
        const link = document.createElement('a'); link.className = 'split-link'; link.href = url; link.download = `document-part-${String(index + 1).padStart(2, '0')}.pdf`;
        link.textContent = `Download part ${index + 1} · ${parts[index].length} ${parts[index].length === 1 ? 'page' : 'pages'}`;
        splitResults.append(link);
      });
      setStatus(`Prepared ${parts.length} PDF parts. Choose each part to save it.`);
    } catch (error) { setStatus(`Could not split pages: ${error.message}`, true); }
  }

  function numberValue(id, minimum = -Infinity) {
    const value = Number(document.querySelector(`#${id}`).value);
    if (!Number.isFinite(value) || value < minimum) throw new Error(`Enter a valid ${id.replaceAll('-', ' ')}.`);
    return value;
  }
  function eachSelectedEdit(edit) {
    if (!selected.size) return;
    for (const page of selected) { page.edits ||= []; page.edits.push(edit); }
    clearSplitResults(); refresh();
    setStatus(`Added ${edit.type === 'redact' ? 'redaction' : edit.type === 'sign' ? 'signature' : edit.type} to ${selected.size} selected ${selected.size === 1 ? 'page' : 'pages'}.`);
    if (edit.type === 'redact') setStatus('Redaction applied. Affected pages will be flattened so their text is no longer searchable.');
  }
  function addText() {
    const text = document.querySelector('#edit-text').value.trim();
    if (!text) { setStatus('Type text before adding it to a page.', true); return; }
    try { eachSelectedEdit({ type: 'text', text, x: numberValue('text-x'), y: numberValue('text-y'), size: numberValue('text-size', 4), color: '#000000' }); }
    catch (error) { setStatus(error.message, true); }
  }
  async function addImage() {
    const file = document.querySelector('#edit-image-file').files[0];
    if (!file || !['image/png', 'image/jpeg'].includes(file.type)) { setStatus('Choose a PNG or JPEG image first.', true); return; }
    try {
      eachSelectedEdit({ type: 'image', bytes: new Uint8Array(await file.arrayBuffer()), imageType: file.type, x: numberValue('image-x'), y: numberValue('image-y'), width: numberValue('image-width', 1), height: numberValue('image-height', 1), color: '#000000' });
    } catch (error) { setStatus(error.message, true); }
  }
  function applyMark() {
    const type = document.querySelector('#mark-type').value;
    try {
      eachSelectedEdit({ type, x: numberValue('mark-x'), y: numberValue('mark-y'), width: numberValue('mark-width', 1), height: numberValue('mark-height', 1), strokeWidth: 2, color: type === 'highlight' ? '#f3d858' : document.querySelector('#mark-color').value });
    } catch (error) { setStatus(error.message, true); }
  }
  function canvasPoint(event) {
    const rect = drawingCanvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }
  drawingCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault(); drawingCanvas.setPointerCapture(event.pointerId); activeDrawingPath = [canvasPoint(event)]; drawingPaths.push(activeDrawingPath);
    drawingContext.strokeStyle = document.querySelector('#draw-color').value; drawingContext.lineWidth = numberValue('draw-stroke', 1) * 2; drawingContext.lineCap = 'round'; drawingContext.lineJoin = 'round';
    drawingContext.beginPath(); drawingContext.moveTo(activeDrawingPath[0][0] * drawingCanvas.width, activeDrawingPath[0][1] * drawingCanvas.height);
  });
  drawingCanvas.addEventListener('pointermove', (event) => {
    if (!activeDrawingPath) return;
    const point = canvasPoint(event); activeDrawingPath.push(point);
    drawingContext.lineTo(point[0] * drawingCanvas.width, point[1] * drawingCanvas.height); drawingContext.stroke();
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) drawingCanvas.addEventListener(eventName, () => { activeDrawingPath = null; refresh(); });
  function clearDrawing() { drawingPaths.length = 0; drawingContext.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); refresh(); }
  async function addDrawing(type) {
    if (!drawingPaths.length) { setStatus('Draw a mark in the canvas first.', true); return; }
    try {
      const bounds = { x: numberValue('draw-x'), y: numberValue('draw-y'), width: numberValue('draw-width', 1), height: numberValue('draw-height', 1), color: document.querySelector('#draw-color').value };
      const strokeWidth = numberValue('draw-stroke', 1);
      if (type === 'draw') eachSelectedEdit({ ...bounds, type, paths: drawingPaths.map((path) => path.map((point) => [...point])), strokeWidth });
      else {
        const blob = await new Promise((resolve, reject) => drawingCanvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not read the signature image.')), 'image/png'));
        eachSelectedEdit({ ...bounds, type: 'sign', imageType: 'image/png', bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
    } catch (error) { setStatus(error.message, true); }
  }
  function formControlType(field) {
    if (typeof field.setText === 'function') return 'text';
    if (typeof field.check === 'function' && typeof field.uncheck === 'function') return 'checkbox';
    if (typeof field.select === 'function' && typeof field.getOptions === 'function') return 'choice';
    return 'unsupported';
  }
  function formFieldControl(field) {
    const name = field.getName(); const type = formControlType(field);
    if (type === 'unsupported') throw new Error(`Unsupported form field: ${name}`);
    const row = document.createElement('label'); row.className = 'form-field-row';
    const title = document.createElement('span'); title.textContent = name; row.append(title);
    let control;
    if (type === 'checkbox') { control = document.createElement('input'); control.type = 'checkbox'; control.checked = field.isChecked(); }
    else if (type === 'choice') {
      control = document.createElement('select');
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Choose…'; control.append(blank);
      for (const choice of field.getOptions()) { const option = document.createElement('option'); option.value = choice; option.textContent = choice; control.append(option); }
      const current = field.getSelected(); control.value = Array.isArray(current) ? current[0] || '' : current || '';
    } else { control = document.createElement('input'); control.type = 'text'; control.value = field.getText() || ''; }
    control.dataset.fieldName = name; control.dataset.fieldKind = type; row.append(control); return row;
  }
  async function inspectForm() {
    const record = files.find((entry) => entry.id === document.querySelector('#form-file').value);
    const container = document.querySelector('#form-fields'); container.replaceChildren(); document.querySelector('#fill-form').hidden = true;
    if (!record) { setStatus('Add a PDF before loading form fields.', true); return; }
    try {
      const doc = await PDFLib.PDFDocument.load(record.bytes); const fields = doc.getForm().getFields();
      if (!fields.length) { const empty = document.createElement('p'); empty.textContent = 'No fillable fields found in this PDF.'; container.append(empty); setStatus('No fillable fields found.'); return; }
      for (const field of fields) container.append(formFieldControl(field));
      document.querySelector('#fill-form').hidden = false; setStatus(`Loaded ${fields.length} form ${fields.length === 1 ? 'field' : 'fields'}.`);
    } catch (error) { setStatus(`Could not load form fields: ${error.message}`, true); }
  }
  async function applyForm() {
    const record = files.find((entry) => entry.id === document.querySelector('#form-file').value);
    if (!record) return;
    const values = {};
    for (const input of document.querySelectorAll('#form-fields [data-field-name]')) values[input.dataset.fieldName] = input.dataset.fieldKind === 'checkbox' ? input.checked : input.value;
    try {
      record.bytes = await PDFStudio.fillFormFields(record.bytes, values, PDFLib);
      document.querySelector('#form-fields').replaceChildren(); document.querySelector('#fill-form').hidden = true;
      clearSplitResults(); refresh(); setStatus('Form values applied and flattened into the PDF pages.');
    } catch (error) { setStatus(`Could not apply form values: ${error.message}`, true); }
  }
  function addSelectedStamp(stamp, label) {
    if (!selected.size) return;
    for (const page of selected) { page.edits ||= []; page.edits.push(stamp); }
    clearSplitResults(); refresh(); setStatus(`${label} added to ${selected.size} selected ${selected.size === 1 ? 'page' : 'pages'}.`);
  }
  function addWatermark() {
    const text = document.querySelector('#stamp-watermark-text').value.trim();
    if (!text) { setStatus('Enter watermark text first.', true); return; }
    try {
      addSelectedStamp({ type: 'watermark', text, size: numberValue('stamp-watermark-size', 8), opacity: numberValue('stamp-watermark-opacity', 5) / 100, angle: numberValue('stamp-watermark-angle'), color: document.querySelector('#stamp-watermark-color').value }, 'Watermark');
    } catch (error) { setStatus(error.message, true); }
  }
  function addPageNumbers() {
    const format = document.querySelector('#stamp-page-format').value.trim();
    if (!format) { setStatus('Enter a page number format first.', true); return; }
    try { addSelectedStamp({ type: 'pageNumber', format, start: numberValue('stamp-page-start'), size: numberValue('stamp-page-size', 6), position: document.querySelector('#stamp-page-position').value, color: '#53645a' }, 'Page numbers'); }
    catch (error) { setStatus(error.message, true); }
  }
  function addHeaderFooter() {
    const header = document.querySelector('#stamp-header-text').value.trim();
    const footer = document.querySelector('#stamp-footer-text').value.trim();
    if (!header && !footer) { setStatus('Enter header or footer text first.', true); return; }
    addSelectedStamp({ type: 'headerFooter', header, footer, size: 10, color: '#53645a' }, 'Header/footer');
  }
  function addDateStamp() {
    const date = document.querySelector('#stamp-date').value;
    if (!date) { setStatus('Choose a date first.', true); return; }
    try { addSelectedStamp({ type: 'dateStamp', date, size: numberValue('stamp-date-size', 6), color: document.querySelector('#stamp-date-color').value }, 'Date stamp'); }
    catch (error) { setStatus(error.message, true); }
  }
  async function convertImagesToPdf() {
    const inputElement = document.querySelector('#convert-image-input');
    const picked = [...inputElement.files];
    if (!picked.length) { setStatus('Choose PNG or JPEG images first.', true); return; }
    if (picked.some((file) => !['image/png', 'image/jpeg'].includes(file.type))) { setStatus('Only PNG and JPEG images are supported.', true); return; }
    try {
      setStatus('Building a PDF from the selected images…');
      const images = await Promise.all(picked.map(async (file) => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })));
      const bytes = await PDFStudio.imagesToPdf(images, PDFLib);
      const pdf = await PDFLib.PDFDocument.load(bytes);
      const name = `images-${Date.now()}.pdf`;
      const file = new File([bytes], name, { type: 'application/pdf' });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      files.push({ id, file, bytes, pageCount: pdf.getPageCount() });
      for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex++) pages.push({ id: `page-${id}-${pageIndex}`, fileId: id, fileName: name, pageIndex, rotation: 0, crop: null });
      inputElement.value = ''; clearSplitResults(); refresh();
      setStatus(`Created ${name} and added ${pdf.getPageCount()} ${pdf.getPageCount() === 1 ? 'page' : 'pages'} to the workspace.`);
    } catch (error) { setStatus(`Could not convert the images: ${error.message}`, true); }
  }
  async function convertPdfToImages() {
    if (!pages.length) return;
    clearSplitResults(); setStatus('Rendering each page locally…');
    try {
      const bytes = await PDFStudio.mergePages(files, pages, PDFLib);
      const scale = Number(document.querySelector('#image-resolution').value);
      const images = await PDFStudio.pdfToImages(bytes, scale);
      images.forEach((image, index) => {
        const url = URL.createObjectURL(new Blob([image.pngBytes], { type: 'image/png' })); imageUrls.push(url);
        const link = document.createElement('a'); link.className = 'split-link'; link.href = url; link.download = `page-${String(index + 1).padStart(3, '0')}.png`;
        link.textContent = `Download page ${index + 1} · ${Math.round(image.width)} × ${Math.round(image.height)} pt`;
        imageResults.append(link);
      });
      setStatus(`Prepared ${images.length} PNG page images. Choose each page to save it.`);
    } catch (error) { setStatus(`Could not export page images: ${error.message}`, true); }
  }
  async function convertPdfToText() {
    if (!pages.length) return;
    clearSplitResults(); setStatus('Extracting text from the current page order…');
    try {
      const bytes = await PDFStudio.mergePages(files, pages, PDFLib);
      textOutput.value = await PDFStudio.pdfToText(bytes);
      document.querySelector('#text-download').hidden = false;
      setStatus(`Extracted text from ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.`);
    } catch (error) { setStatus(`Could not extract PDF text: ${error.message}`, true); }
  }
  function downloadExtractedText() {
    const blob = new Blob([textOutput.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'extracted-text.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function buildCurrentPdfBytes() {
    let bytes = await PDFStudio.mergePages(files, pages, PDFLib);
    if (stripOutputMetadata) bytes = await PDFStudio.removeMetadata(bytes, PDFLib);
    else if (outputMetadata) bytes = await PDFStudio.updateMetadata(bytes, outputMetadata, PDFLib);
    return bytes;
  }
  async function compressCurrentPdf() {
    if (!pages.length) return;
    const button = document.querySelector('#compress-pdf'); button.disabled = true;
    const result = document.querySelector('#compress-result'); result.textContent = 'Preparing and compressing the current PDF…';
    try {
      const source = await buildCurrentPdfBytes(); const compressed = await PDFStudio.compressPdf(source, PDFLib);
      const before = source.byteLength; const after = compressed.byteLength; const change = before - after;
      result.textContent = `Before: ${formatBytes(before)} · After: ${formatBytes(after)} · ${change >= 0 ? `${formatBytes(change)} smaller` : `${formatBytes(-change)} larger`}.`;
      downloadBlob(compressed, 'compressed-document.pdf');
      setStatus(`Prepared compressed-document.pdf · ${formatBytes(before)} → ${formatBytes(after)}.`);
    } catch (error) { result.textContent = ''; setStatus(`Could not compress the PDF: ${error.message}`, true); }
    finally { button.disabled = pages.length === 0; }
  }
  function useOutputMetadata() {
    const keywords = document.querySelector('#metadata-keywords').value.split(',').map((word) => word.trim()).filter(Boolean);
    outputMetadata = {
      title: document.querySelector('#metadata-title').value.trim(),
      author: document.querySelector('#metadata-author').value.trim(),
      subject: document.querySelector('#metadata-subject').value.trim(),
      keywords,
    };
    stripOutputMetadata = false;
    document.querySelector('#metadata-status').textContent = 'These details will be applied to the next saved or compressed PDF.';
  }
  function removeOutputMetadata() {
    outputMetadata = null; stripOutputMetadata = true;
    document.querySelector('#metadata-status').textContent = 'Metadata will be removed from the next saved or compressed PDF.';
  }
  function compareColumn(title, text) {
    const column = document.createElement('div'); const heading = document.createElement('h4'); heading.textContent = title;
    const content = document.createElement('pre'); content.textContent = text === null ? '(No page in this PDF)' : text || '(No extractable text)';
    column.append(heading, content); return column;
  }
  async function compareLoadedPdfs() {
    const left = files.find((entry) => entry.id === document.querySelector('#compare-left').value);
    const right = files.find((entry) => entry.id === document.querySelector('#compare-right').value);
    if (!left || !right) { setStatus('Load two PDFs before comparing.', true); return; }
    compareResults.replaceChildren(); setStatus('Comparing extractable text locally…');
    try {
      const comparison = await PDFStudio.comparePdfTexts(left.bytes, right.bytes);
      const summary = document.createElement('p'); summary.className = 'compare-summary';
      const pageChange = comparison.pagesA === comparison.pagesB ? 'same page count' : `${comparison.pagesA} vs ${comparison.pagesB} pages`;
      summary.textContent = `${pageChange} · ${comparison.differences.length} ${comparison.differences.length === 1 ? 'page differs' : 'pages differ'} by extractable text.`;
      compareResults.append(summary);
      if (!comparison.differences.length) { const same = document.createElement('p'); same.className = 'compare-summary'; same.textContent = 'Page text matches in both files.'; compareResults.append(same); }
      for (const diff of comparison.differences) {
        const details = document.createElement('details'); details.className = 'compare-diff';
        const label = document.createElement('summary'); label.textContent = `Page ${diff.page}${diff.leftText === null ? ' · only in PDF B' : diff.rightText === null ? ' · only in PDF A' : ' · text differs'}`;
        const columns = document.createElement('div'); columns.className = 'compare-columns'; columns.append(compareColumn('PDF A', diff.leftText), compareColumn('PDF B', diff.rightText));
        details.append(label, columns); compareResults.append(details);
      }
      setStatus(`Compared ${left.file.name} and ${right.file.name}.`);
    } catch (error) { setStatus(`Could not compare PDFs: ${error.message}`, true); }
  }

  async function addFiles(fileCollection) {
    const candidates = [...fileCollection].filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (!candidates.length) { setStatus('Choose one or more PDF files.', true); return; }
    setStatus('Opening PDFs locally…');
    for (const file of candidates) {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        files.push({ id, file, bytes, pageCount: doc.getPageCount() });
        for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex++) pages.push({ id: `page-${id}-${pageIndex}`, fileId: id, fileName: file.name, pageIndex, rotation: 0, crop: null });
      } catch (error) {
        setStatus(`${file.name} could not be opened${error?.message ? `: ${error.message}` : '.'}`, true);
      }
    }
    clearSplitResults(); refresh();
    if (pages.length) setStatus(`Ready to save ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.`);
  }

  async function saveMergedPdf() {
    if (!pages.length) return;
    saveButton.disabled = true; setStatus('Building your merged PDF…');
    try {
      const bytes = await buildCurrentPdfBytes();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = 'merged-document.pdf'; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus(`Saved merged-document.pdf · ${formatBytes(blob.size)}`);
    } catch (error) {
      setStatus(`Could not save the merged PDF${error?.message ? `: ${error.message}` : '.'}`, true);
    } finally { saveButton.disabled = pages.length === 0; }
  }

  input.addEventListener('change', async (event) => { await addFiles(event.target.files); input.value = ''; });
  dropZone.addEventListener('click', (event) => { if (event.target === dropZone) input.click(); });
  dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  for (const eventName of ['dragenter', 'dragover']) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('drag-over'); });
  for (const eventName of ['dragleave', 'drop']) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  saveButton.addEventListener('click', saveMergedPdf);
  document.querySelector('#select-all').addEventListener('click', () => { if (selected.size === pages.length) selected.clear(); else pages.forEach((page) => selected.add(page)); refresh(); });
  document.querySelector('#rotate-left').addEventListener('click', () => rotateSelected(-90));
  document.querySelector('#rotate-right').addEventListener('click', () => rotateSelected(90));
  document.querySelector('#duplicate-pages').addEventListener('click', duplicateSelected);
  document.querySelector('#delete-pages').addEventListener('click', deleteSelected);
  document.querySelector('#insert-blank').addEventListener('click', insertBlank);
  document.querySelector('#extract-pages').addEventListener('click', extractSelected);
  document.querySelector('#crop-pages').addEventListener('click', cropSelected);
  document.querySelector('#split-pdf').addEventListener('click', splitCurrentPages);
  document.querySelector('#add-text').addEventListener('click', addText);
  document.querySelector('#add-image').addEventListener('click', addImage);
  document.querySelector('#apply-mark').addEventListener('click', applyMark);
  document.querySelector('#clear-drawing').addEventListener('click', clearDrawing);
  document.querySelector('#add-drawing').addEventListener('click', () => addDrawing('draw'));
  document.querySelector('#add-signature').addEventListener('click', () => addDrawing('sign'));
  document.querySelector('#inspect-form').addEventListener('click', inspectForm);
  document.querySelector('#fill-form').addEventListener('click', applyForm);
  document.querySelector('#form-file').addEventListener('change', () => { document.querySelector('#form-fields').replaceChildren(); document.querySelector('#fill-form').hidden = true; });
  document.querySelector('#add-watermark').addEventListener('click', addWatermark);
  document.querySelector('#add-page-numbers').addEventListener('click', addPageNumbers);
  document.querySelector('#add-header-footer').addEventListener('click', addHeaderFooter);
  document.querySelector('#add-date-stamp').addEventListener('click', addDateStamp);
  document.querySelector('#convert-image-input').addEventListener('change', (event) => { document.querySelector('#images-to-pdf').disabled = event.target.files.length === 0; });
  document.querySelector('#images-to-pdf').addEventListener('click', convertImagesToPdf);
  document.querySelector('#pdf-to-images').addEventListener('click', convertPdfToImages);
  document.querySelector('#pdf-to-text').addEventListener('click', convertPdfToText);
  document.querySelector('#text-download').addEventListener('click', downloadExtractedText);
  document.querySelector('#compress-pdf').addEventListener('click', compressCurrentPdf);
  document.querySelector('#apply-metadata').addEventListener('click', useOutputMetadata);
  document.querySelector('#remove-metadata').addEventListener('click', removeOutputMetadata);
  document.querySelector('#compare-pdfs').addEventListener('click', compareLoadedPdfs);
  refresh();
})();
