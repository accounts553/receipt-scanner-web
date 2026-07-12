// Crusher Receipt Scanner — AI Agent (standalone web version, bilingual EN/AR)
// Converts each page/receipt into one Excel row after intelligent analysis via /api/analyze (OpenAI Vision).
// Hardened for large workloads: incremental PDF page rendering (low memory), limited concurrency,
// automatic retries with backoff, and per-request timeouts so one bad page never blocks the whole batch.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const CONCURRENCY = 3;          // number of receipts analyzed in parallel
const MAX_RETRIES = 3;          // automatic retries per page on failure
const REQUEST_TIMEOUT_MS = 55000; // abort a single analysis call after this long
const MAX_IMAGE_DIM = 1600;     // downscale images to this max dimension before upload (keeps requests small & fast)

const state = {
  lang: localStorage.getItem('receiptScannerLang') || 'en', // default English
  staged: [], // { id, file, name }
  jobs: [],   // { id, name, pageIndex, status, data, error }
};

function t(key, ...args) {
  const val = STRINGS[state.lang][key];
  return typeof val === 'function' ? val(...args) : val;
}

const htmlRoot = document.getElementById('htmlRoot');
const pageTitleEl = document.getElementById('pageTitle');
const langToggle = document.getElementById('langToggle');
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const stagedList = document.getElementById('stagedList');
const startBtn = document.getElementById('startBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const headerRow = document.getElementById('headerRow');
const resultsBody = document.getElementById('resultsBody');
const emptyState = document.getElementById('emptyState');

// ---------- Language handling ----------
function applyLanguage() {
  htmlRoot.lang = state.lang;
  htmlRoot.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  pageTitleEl.textContent = t('pageTitle');
  document.title = t('pageTitle');
  langToggle.textContent = t('langToggleLabel');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  buildHeader();
  renderResults();
}

langToggle.addEventListener('click', () => {
  state.lang = state.lang === 'en' ? 'ar' : 'en';
  localStorage.setItem('receiptScannerLang', state.lang);
  applyLanguage();
});

// ---------- Build table header ----------
function buildHeader() {
  const labels = FIELD_LABELS[state.lang];
  const cols = [t('colIndex'), t('colFileName'), t('colPageNumber'), ...FIELD_ORDER.map((k) => labels[k]), t('colStatus')];
  headerRow.innerHTML = cols.map((c) => `<th>${c}</th>`).join('');
}

// ---------- File upload / drag & drop ----------
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => addFiles(fileInput.files));

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    state.staged.push({ id: crypto.randomUUID(), file, name: file.name });
  });
  renderStaged();
  fileInput.value = '';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function renderStaged() {
  stagedList.innerHTML = state.staged
    .map((s) => `<li data-id="${s.id}"><span>📄 ${escapeHtml(s.name)} <span class="muted-size">(${formatBytes(s.file.size)})</span></span><button class="remove-btn" data-id="${s.id}">✕</button></li>`)
    .join('');
  startBtn.disabled = state.staged.length === 0;
  stagedList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.staged = state.staged.filter((s) => s.id !== btn.dataset.id);
      renderStaged();
    });
  });
}

clearBtn.addEventListener('click', () => {
  state.staged = [];
  state.jobs = [];
  renderStaged();
  renderResults();
});

// ---------- Prepare images: resize/compress before upload ----------
async function resizeImageFile(file, maxDim = MAX_IMAGE_DIM, quality = 0.82) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(reader.error?.message || 'read error'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unsupported or corrupted image file'));
    img.src = src;
  });
}

// Render a single PDF page to a compressed JPEG data URL, on demand (keeps memory low for big PDFs).
async function renderPdfPage(pdf, pageNum, maxDim = MAX_IMAGE_DIM) {
  const page = await pdf.getPage(pageNum);
  const viewport1 = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxDim / Math.max(viewport1.width, viewport1.height));
  const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.85);
  // help the GC release canvas memory promptly for very large / multi-hundred-page PDFs
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// ---------- Call the AI Agent (with timeout + automatic retry) ----------
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function analyzeImageOnce(dataUrl) {
  const [, mimeType, base64] = dataUrl.match(/^data:(.+);base64,(.*)$/) || [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
      signal: controller.signal,
    });
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error(`${t('analysisFailed')} (HTTP ${res.status})`);
    }
    if (!res.ok || json.error) {
      const err = new Error(json.error || t('analysisFailed'));
      err.status = res.status;
      throw err;
    }
    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(t('timeoutError'));
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function analyzeImageWithRetry(dataUrl, onRetry) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await analyzeImageOnce(dataUrl);
    } catch (err) {
      lastErr = err;
      // Don't retry on hard client errors (bad request / missing key config) — only transient issues.
      const nonRetryable = err.status === 400 || err.status === 401;
      if (nonRetryable || attempt === MAX_RETRIES) break;
      onRetry && onRetry(attempt + 1);
      await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s, 4s...
    }
  }
  throw lastErr;
}

function isFlagged(job) {
  if (!job.data) return false;
  if (job.data['ملاحظات_التحقق'] && job.data['ملاحظات_التحقق'].trim()) return true;
  if (job.data['مستوى_الثقة'] === 'منخفضة') return true;
  return false;
}

// ---------- Run analysis (streaming task builder + limited concurrency) ----------
startBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  startBtn.disabled = true;
  clearBtn.disabled = true;
  progressWrap.hidden = false;
  state.jobs = [];
  renderResults();

  // 1) Build the task queue. PDFs are expanded lazily page-by-page so huge files
  //    (hundreds of pages) don't need to be fully rendered into memory up front.
  const tasks = []; // { name, pageIndex, get: () => Promise<dataUrl> } or { error }
  for (const s of state.staged) {
    const isPdf = /\.pdf$/i.test(s.name);
    if (isPdf) {
      try {
        const buf = await s.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          const pageNum = p;
          tasks.push({ name: s.name, pageIndex: pageNum, get: () => renderPdfPage(pdf, pageNum) });
        }
      } catch (err) {
        console.error('PDF open failed', err);
        tasks.push({ name: s.name, pageIndex: 1, error: t('pdfSplitFailed', err.message) });
      }
    } else {
      tasks.push({ name: s.name, pageIndex: 1, get: () => resizeImageFile(s.file) });
    }
  }

  // 2) Create job placeholders up front (keeps table order stable even with concurrency).
  const jobs = tasks.map((task) => ({
    id: crypto.randomUUID(),
    name: task.name,
    pageIndex: task.pageIndex,
    status: task.error ? 'error' : 'queued',
    data: null,
    error: task.error || null,
  }));
  state.jobs = jobs;
  renderResults();

  let completed = 0;
  const total = tasks.length;
  updateProgress(completed, total, t('progressStarting'));

  // 3) Worker pool: process up to CONCURRENCY receipts at a time.
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      const task = tasks[i];
      const job = jobs[i];
      if (task.error) {
        completed++;
        updateProgress(completed, total, t('progressComplete'));
        renderResults();
        continue;
      }
      job.status = 'processing';
      renderResults();
      updateProgress(completed, total, t('progressAnalyzing', task.name, task.pageIndex));
      try {
        const dataUrl = await task.get();
        job.data = await analyzeImageWithRetry(dataUrl, (attempt) => {
          job.status = 'retrying';
          renderResults();
          updateProgress(completed, total, t('progressRetrying', task.name, task.pageIndex, attempt));
        });
        job.status = 'done';
      } catch (err) {
        job.status = 'error';
        job.error = err.message || String(err);
      }
      completed++;
      updateProgress(completed, total, t('progressAnalyzing', task.name, task.pageIndex));
      renderResults();
    }
  }

  const workerCount = Math.max(1, Math.min(CONCURRENCY, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  updateProgress(total, total, t('progressComplete'));
  startBtn.disabled = false;
  clearBtn.disabled = false;
  downloadBtn.disabled = state.jobs.length === 0;
}

function updateProgress(done, total, label) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${label} (${done}/${total})`;
}

// ---------- Render results ----------
function renderResults() {
  emptyState.hidden = state.jobs.length > 0;
  resultsBody.innerHTML = state.jobs
    .map((job, idx) => {
      const flagged = isFlagged(job);
      const cls = job.status === 'error' ? 'errored' : flagged ? 'flagged' : '';
      const data = job.data || {};
      let statusText;
      if (job.status === 'error') statusText = `${t('statusFailed')}: ${escapeHtml(job.error || '')}`;
      else if (job.status === 'done') statusText = t('statusDone');
      else if (job.status === 'retrying') statusText = t('statusRetrying');
      else if (job.status === 'processing') statusText = t('statusProcessing');
      else statusText = t('statusQueued');
      const cells = [
        idx + 1,
        escapeHtml(job.name),
        job.pageIndex,
        ...FIELD_ORDER.map((k) => escapeHtml(translateValue(state.lang, data[k]) || '')),
        statusText,
      ];
      return `<tr class="${cls}">${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Excel export ----------
downloadBtn.addEventListener('click', exportExcel);

async function exportExcel() {
  const workbook = new ExcelJS.Workbook();
  const rtl = state.lang === 'ar';
  const sheet = workbook.addWorksheet(t('excelSheetName'), { views: [{ rightToLeft: rtl }] });
  const labels = FIELD_LABELS[state.lang];

  const headers = [t('colIndex'), t('colFileName'), t('colPageNumber'), ...FIELD_ORDER.map((k) => labels[k]), t('colStatus')];
  const headerRowXlsx = sheet.addRow(headers);
  headerRowXlsx.font = { bold: true };
  headerRowXlsx.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF424F57' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  let flaggedCount = 0;
  state.jobs.forEach((job, idx) => {
    const flagged = isFlagged(job);
    if (flagged || job.status === 'error') flaggedCount += 1;
    const data = job.data || {};
    const statusText = job.status === 'error'
      ? `${t('statusFailed')}: ${job.error || ''}`
      : job.status === 'done' ? t('statusDone') : job.status;
    const row = sheet.addRow([
      idx + 1,
      job.name,
      job.pageIndex,
      ...FIELD_ORDER.map((k) => translateValue(state.lang, data[k]) || ''),
      statusText,
    ]);
    row.eachCell((cell) => {
      cell.alignment = { horizontal: rtl ? 'right' : 'left', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    if (flagged || job.status === 'error') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: job.status === 'error' ? 'FFFDE2E1' : 'FFFFF2CC' } };
      });
    }
  });

  const summaryRow = sheet.addRow(['', t('excelTotalReceipts', state.jobs.length), '', ...FIELD_ORDER.map(() => ''), t('excelNeedsReview', flaggedCount)]);
  summaryRow.font = { bold: true, italic: true };

  sheet.columns.forEach((col, i) => { col.width = i === 0 ? 6 : i === 1 ? 22 : i === 2 ? 10 : 18; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipts_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Init ----------
applyLanguage();
