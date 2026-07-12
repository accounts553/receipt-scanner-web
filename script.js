// ماسح إيصالات الكسارات — AI Agent (نسخة ويب مستقلة)
// يحول كل صفحة/إيصال إلى صف واحد في إكسيل، بعد تحليل ذكي عبر /api/analyze (OpenAI Vision).

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const FIELD_ORDER = [
  'اسم_الجهة', 'نوع_المستند', 'رقم_الايصال', 'التاريخ_والوقت', 'العميل_او_المورد',
  'نوع_المادة', 'المصدر_او_الكسارة', 'الموقع', 'اسم_السائق', 'رقم_السيارة',
  'الوزن_القائم', 'الوزن_الفارغ', 'الوزن_الصافي', 'وحدة_الوزن', 'الكمية', 'الوحدة',
  'سعر_الوحدة', 'الاجمالي', 'اسم_المشغل', 'رقم_امر_الشراء', 'رقم_بونة_الوزن',
  'يوجد_ختم_او_توقيع', 'ملاحظات_مكتوبة_بخط_اليد', 'ملاحظات_التحقق', 'مستوى_الثقة',
];

const FIELD_LABELS = {
  اسم_الجهة: 'اسم الجهة', نوع_المستند: 'نوع المستند', رقم_الايصال: 'رقم الإيصال',
  التاريخ_والوقت: 'التاريخ والوقت', العميل_او_المورد: 'العميل/المورد', نوع_المادة: 'نوع المادة',
  المصدر_او_الكسارة: 'المصدر/الكسارة', الموقع: 'الموقع', اسم_السائق: 'اسم السائق',
  رقم_السيارة: 'رقم السيارة', الوزن_القائم: 'الوزن القائم', الوزن_الفارغ: 'الوزن الفارغ',
  الوزن_الصافي: 'الوزن الصافي', وحدة_الوزن: 'وحدة الوزن', الكمية: 'الكمية', الوحدة: 'الوحدة',
  سعر_الوحدة: 'سعر الوحدة', الاجمالي: 'الإجمالي', اسم_المشغل: 'اسم المشغل',
  رقم_امر_الشراء: 'رقم أمر الشراء', رقم_بونة_الوزن: 'رقم بونة الوزن',
  يوجد_ختم_او_توقيع: 'يوجد ختم/توقيع', ملاحظات_مكتوبة_بخط_اليد: 'ملاحظات بخط اليد',
  ملاحظات_التحقق: 'ملاحظات التحقق', مستوى_الثقة: 'مستوى الثقة',
};

const state = {
  staged: [], // { id, file, name }
  jobs: [],   // { id, name, pageIndex, status, data, error }
};

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

// ---------- بناء رأس الجدول مرة واحدة ----------
function buildHeader() {
  const cols = ['#', 'اسم الملف', 'رقم الصفحة', ...FIELD_ORDER.map((k) => FIELD_LABELS[k]), 'الحالة'];
  headerRow.innerHTML = cols.map((c) => `<th>${c}</th>`).join('');
}
buildHeader();

// ---------- رفع/سحب الملفات ----------
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

function renderStaged() {
  stagedList.innerHTML = state.staged
    .map((s) => `<li data-id="${s.id}"><span>📄 ${s.name}</span><button class="remove-btn" data-id="${s.id}">✕</button></li>`)
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

// ---------- تجهيز الصور: PDF لصفحات + ضغط/تصغير ----------
async function resizeImageFile(file, maxDim = 1600, quality = 0.82) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function pdfToImageDataUrls(file, maxDim = 1600) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const urls = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxDim / Math.max(viewport1.width, viewport1.height));
    const viewport = page.getViewport({ scale: Math.max(scale, 1) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return urls;
}

// ---------- استدعاء الـ AI Agent ----------
async function analyzeImage(dataUrl) {
  const [, mimeType, base64] = dataUrl.match(/^data:(.+);base64,(.*)$/) || [];
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error || 'فشل التحليل');
  }
  return json.data;
}

function isFlagged(job) {
  if (!job.data) return false;
  if (job.data['ملاحظات_التحقق'] && job.data['ملاحظات_التحقق'].trim()) return true;
  if (job.data['مستوى_الثقة'] === 'منخفضة') return true;
  return false;
}

// ---------- تشغيل التحليل ----------
startBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  startBtn.disabled = true;
  clearBtn.disabled = true;
  progressWrap.hidden = false;
  state.jobs = [];
  renderResults();

  // 1) بناء قائمة المهام (تقسيم أي PDF لصفحات)
  const tasks = [];
  for (const s of state.staged) {
    const isPdf = /\.pdf$/i.test(s.name);
    if (isPdf) {
      try {
        const urls = await pdfToImageDataUrls(s.file);
        urls.forEach((url, idx) => tasks.push({ name: s.name, pageIndex: idx + 1, dataUrl: url }));
      } catch (err) {
        console.error('PDF split failed', err);
        tasks.push({ name: s.name, pageIndex: 1, error: 'فشل تقسيم ملف PDF: ' + err.message });
      }
    } else {
      try {
        const url = await resizeImageFile(s.file);
        tasks.push({ name: s.name, pageIndex: 1, dataUrl: url });
      } catch (err) {
        tasks.push({ name: s.name, pageIndex: 1, error: 'فشل قراءة الصورة: ' + err.message });
      }
    }
  }

  // 2) تحليل كل مهمة بالتتابع (عشان استقرار الاستدعاء ووضوح التقدم)
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const job = { id: crypto.randomUUID(), name: t.name, pageIndex: t.pageIndex, status: 'processing', data: null, error: null };
    state.jobs.push(job);
    renderResults();
    updateProgress(i, tasks.length, `جاري تحليل: ${t.name} (صفحة ${t.pageIndex})`);

    if (t.error) {
      job.status = 'error';
      job.error = t.error;
    } else {
      try {
        job.data = await analyzeImage(t.dataUrl);
        job.status = 'done';
      } catch (err) {
        job.status = 'error';
        job.error = err.message;
      }
    }
    renderResults();
  }

  updateProgress(tasks.length, tasks.length, 'اكتمل التحليل ✅');
  startBtn.disabled = false;
  clearBtn.disabled = false;
  downloadBtn.disabled = state.jobs.length === 0;
}

function updateProgress(done, total, label) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${label} (${done}/${total})`;
}

// ---------- عرض النتائج ----------
function renderResults() {
  emptyState.hidden = state.jobs.length > 0;
  resultsBody.innerHTML = state.jobs
    .map((job, idx) => {
      const flagged = isFlagged(job);
      const cls = job.status === 'error' ? 'errored' : flagged ? 'flagged' : '';
      const data = job.data || {};
      const cells = [
        idx + 1,
        escapeHtml(job.name),
        job.pageIndex,
        ...FIELD_ORDER.map((k) => escapeHtml(data[k] || '')),
        job.status === 'error' ? `فشل: ${escapeHtml(job.error || '')}` : job.status === 'done' ? 'تم' : 'جاري...',
      ];
      return `<tr class="${cls}">${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- تصدير إكسيل ----------
downloadBtn.addEventListener('click', exportExcel);

async function exportExcel() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الإيصالات', { views: [{ rightToLeft: true }] });

  const headers = ['#', 'اسم الملف', 'رقم الصفحة', ...FIELD_ORDER.map((k) => FIELD_LABELS[k]), 'الحالة'];
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
    const row = sheet.addRow([
      idx + 1,
      job.name,
      job.pageIndex,
      ...FIELD_ORDER.map((k) => data[k] || ''),
      job.status === 'error' ? `فشل: ${job.error || ''}` : job.status === 'done' ? 'تم' : job.status,
    ]);
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    if (flagged || job.status === 'error') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: job.status === 'error' ? 'FFFDE2E1' : 'FFFFF2CC' } };
      });
    }
  });

  const summaryRow = sheet.addRow(['', `إجمالي الإيصالات: ${state.jobs.length}`, '', ...FIELD_ORDER.map(() => ''), `تحتاج مراجعة: ${flaggedCount}`]);
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
