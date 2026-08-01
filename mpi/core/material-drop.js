export const MATERIAL_EXTENSIONS = new Set([
  '.pdf', '.docx', '.txt', '.md', '.csv', '.tsv', '.json',
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus',
]);

export const PDFJS_VERSION = '3.11.174';
const PDFJS_WORKER = new URL('../assets/vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;

const PDF_DOCUMENT_CACHE = new Map();
const PDF_PAGE_PREVIEW_CACHE = new Map();
const PDF_PAGE_PREVIEW_LIMIT = 18;

function cleanPdfSource(source) {
  if (typeof source !== 'string') return source;
  const url = new URL(source, typeof document !== 'undefined' ? document.baseURI : import.meta.url);
  url.hash = '';
  return url.href;
}

function rememberPdfPreview(key, value) {
  PDF_PAGE_PREVIEW_CACHE.delete(key);
  PDF_PAGE_PREVIEW_CACHE.set(key, value);
  while (PDF_PAGE_PREVIEW_CACHE.size > PDF_PAGE_PREVIEW_LIMIT) {
    const oldest = PDF_PAGE_PREVIEW_CACHE.keys().next().value;
    PDF_PAGE_PREVIEW_CACHE.delete(oldest);
  }
}

function extensionOf(name = '') {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function pdfReader() {
  const reader = globalThis.pdfjsLib;
  if (!reader?.getDocument) {
    throw new Error('El lector PDF integrado no se cargó. Cierra y vuelve a abrir la aplicación MPI 1.20.2.');
  }
  if (typeof document !== 'undefined') {
    reader.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return reader;
}

function pageText(content) {
  const lines = [];
  let current = '';
  for (const item of content?.items || []) {
    const text = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (text) current = `${current}${current ? ' ' : ''}${text}`;
    if (item?.hasEOL && current) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.join('\n').trim();
}

function cleanPdfMetadata(info = {}) {
  const values = {
    title: info.Title,
    author: info.Author,
    subject: info.Subject,
    creator: info.Creator,
    producer: info.Producer,
  };
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, String(value || '').trim().slice(0, key === 'subject' ? 1000 : 500)])
      .filter(([, value]) => value)
  );
}

export async function extractPdfInBrowser(file, onProgress = null) {
  if (!file?.arrayBuffer) throw new Error('El PDF seleccionado no puede leerse en este navegador.');
  const reader = pdfReader();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let document = null;
  try {
    document = await reader.getDocument({ data: bytes }).promise;
    const labels = await document.getPageLabels().catch(() => null);
    const metadata = await document.getMetadata().catch(() => ({ info: {} }));
    const pages = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      onProgress?.(number, document.numPages);
      const page = await document.getPage(number);
      const content = await page.getTextContent({ disableNormalization: false });
      pages.push({
        number,
        label: String(labels?.[number - 1] || number),
        text: pageText(content),
      });
      page.cleanup();
    }
    return {
      format: 'mpi-pdf-browser-analysis/1',
      reader: 'pdf.js',
      readerVersion: PDFJS_VERSION,
      pageCount: document.numPages,
      metadata: cleanPdfMetadata(metadata?.info),
      pages,
    };
  } catch (error) {
    const detail = String(error?.message || error || 'error desconocido').replace(/\s+/g, ' ').trim();
    throw new Error(`No se pudo leer ${file.name || 'el PDF'} con el lector integrado: ${detail}`);
  } finally {
    if (document) await document.destroy().catch(() => {});
  }
}

export async function renderPdfPagePreview(source, pageNumber = 1, options = {}) {
  const reader = pdfReader();
  const page = Math.max(1, Number.parseInt(pageNumber, 10) || 1);
  const maxWidth = Math.max(240, Number(options.maxWidth || 960));
  const maxHeight = Math.max(320, Number(options.maxHeight || 1280));
  const quality = Math.min(0.94, Math.max(0.55, Number(options.quality || 0.82)));
  const cleaned = cleanPdfSource(source);
  const cacheable = typeof cleaned === 'string';
  const cacheKey = cacheable ? `${cleaned}\u001f${page}\u001f${maxWidth}\u001f${maxHeight}` : '';
  if (cacheable && PDF_PAGE_PREVIEW_CACHE.has(cacheKey)) {
    const cached = PDF_PAGE_PREVIEW_CACHE.get(cacheKey);
    rememberPdfPreview(cacheKey, cached);
    return cached;
  }

  let documentPromise;
  if (cacheable) {
    documentPromise = PDF_DOCUMENT_CACHE.get(cleaned);
    if (!documentPromise) {
      documentPromise = reader.getDocument({ url: cleaned }).promise.catch((error) => {
        PDF_DOCUMENT_CACHE.delete(cleaned);
        throw error;
      });
      PDF_DOCUMENT_CACHE.set(cleaned, documentPromise);
    }
  } else {
    const data = cleaned instanceof Uint8Array ? new Uint8Array(cleaned) : cleaned;
    documentPromise = reader.getDocument({ data }).promise;
  }

  let pdf = null;
  let pdfPage = null;
  try {
    pdf = await documentPromise;
    if (page > pdf.numPages) throw new Error(`La página ${page} no existe en este PDF.`);
    pdfPage = await pdf.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / base.width, maxHeight / base.height, 2.4);
    const viewport = pdfPage.getViewport({ scale: Math.max(0.25, scale) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('El navegador no puede crear la previsualización de página.');
    await pdfPage.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
    const result = {
      url: canvas.toDataURL('image/jpeg', quality),
      width: canvas.width,
      height: canvas.height,
      pageNumber: page,
      renderer: 'pdf.js',
      rendererVersion: PDFJS_VERSION,
      representation: 'page-facsimile-preview',
    };
    if (cacheable) rememberPdfPreview(cacheKey, result);
    return result;
  } catch (error) {
    const detail = String(error?.message || error || 'error desconocido').replace(/\s+/g, ' ').trim();
    throw new Error(`No se pudo representar la página ${page}: ${detail}`);
  } finally {
    pdfPage?.cleanup?.();
    if (!cacheable && typeof pdf?.destroy === 'function') await pdf.destroy().catch(() => {});
  }
}

export function isSupportedMaterial(file) {
  return Boolean(file?.name) && MATERIAL_EXTENSIONS.has(extensionOf(file.name));
}

export function materialRecord(file, relativePath = '') {
  const path = String(relativePath || file?.webkitRelativePath || file?.name || '').replace(/^\/+/, '');
  return {
    file,
    path,
    key: [path, file?.size || 0, file?.lastModified || 0].join('\u001f'),
  };
}

export function recordsFromFiles(files) {
  return [...(files || [])].filter(Boolean).map((file) => materialRecord(file));
}

function readEntryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(reader) {
  const entries = [];
  while (true) {
    const page = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!page.length) return entries;
    entries.push(...page);
  }
}

async function walkEntry(entry, parent = '') {
  if (!entry) return [];
  const path = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    return [materialRecord(file, path)];
  }
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry.createReader());
  const nested = await Promise.all(children.map((child) => walkEntry(child, path)));
  return nested.flat();
}

export async function recordsFromDrop(dataTransfer) {
  const items = [...(dataTransfer?.items || [])].filter((item) => item.kind === 'file');
  if (items.length && items.some((item) => typeof item.webkitGetAsEntry === 'function')) {
    try {
      const nested = await Promise.all(items.map(async (item) => {
        const entry = item.webkitGetAsEntry?.();
        if (entry) return walkEntry(entry);
        const file = item.getAsFile?.();
        return file ? [materialRecord(file)] : [];
      }));
      return nested.flat();
    } catch (_) {
      // Algunos navegadores anuncian la API de carpetas pero no permiten leerla.
    }
  }
  return recordsFromFiles(dataTransfer?.files);
}
