// Bilingual (English / Arabic) strings for the Crusher Receipt Scanner UI.
// Internal data field keys stay in Arabic (matching the AI extraction schema) —
// only *display labels* and static UI text are translated here.

const STRINGS = {
  en: {
    pageTitle: 'Crusher Receipt Scanner — AI Agent | Sina Investment Group',
    brandSub: 'Crusher Receipt Scanner — AI Agent',
    badge: 'Intelligent analysis, not just OCR',
    langToggleLabel: 'العربية',
    step1Title: '1) Upload receipts',
    step1Hint: 'Images (JPG/PNG) or multi-page PDFs — each page/receipt becomes one row in the Excel file.',
    dropzoneText: 'Click here or drag and drop files',
    startBtn: 'Start Analysis',
    clearBtn: 'Clear All',
    step2Title: '2) Results',
    downloadBtn: '⬇️ Download Excel File',
    emptyState: 'No results yet — upload receipts and start the analysis.',
    footnote: 'This tool analyzes images using an AI model (not plain OCR) — it understands varying field names ' +
      'from each crusher, verifies that net weight = gross − tare, and flags any receipt in doubt in yellow. ' +
      'Images are uploaded for analysis only and are not stored permanently.',
    colIndex: '#',
    colFileName: 'File Name',
    colPageNumber: 'Page #',
    colStatus: 'Status',
    statusDone: 'Done',
    statusProcessing: 'Processing...',
    statusFailed: 'Failed',
    progressAnalyzing: (name, page) => `Analyzing: ${name} (page ${page})`,
    progressComplete: 'Analysis complete ✅',
    analysisFailed: 'Analysis failed',
    pdfSplitFailed: (msg) => `Failed to split PDF: ${msg}`,
    imageReadFailed: (msg) => `Failed to read image: ${msg}`,
    excelSheetName: 'Receipts',
    excelTotalReceipts: (n) => `Total receipts: ${n}`,
    excelNeedsReview: (n) => `Needs review: ${n}`,
  },
  ar: {
    pageTitle: 'ماسح إيصالات الكسارات — AI Agent | Sina Investment Group',
    brandSub: 'ماسح إيصالات الكسارات — AI Agent',
    badge: 'تحليل ذكي وليس OCR فقط',
    langToggleLabel: 'English',
    step1Title: '1) ارفع الإيصالات',
    step1Hint: 'صور بأي صيغة (JPG, PNG, WEBP, HEIC...) أو ملفات PDF متعددة الصفحات مهما كان حجمها — كل صفحة/إيصال هتتحول لصف واحد في الإكسيل. الملفات الكبيرة (مئات الصفحات) بتتعالج تلقائيًا على دفعات متوازية.',
    dropzoneText: 'اضغط هنا أو اسحب الملفات وأفلتها',
    startBtn: 'ابدأ التحليل',
    clearBtn: 'مسح الكل',
    step2Title: '2) النتائج',
    downloadBtn: '⬇️ تحميل ملف إكسيل',
    emptyState: 'لسه مفيش نتائج — ارفع إيصالات وابدأ التحليل.',
    footnote: 'الأداة بتحلل الصور عن طريق نموذج ذكاء اصطناعي (وليس قراءة حروف عادية OCR) — بتفهم الحقول المختلفة من ' +
      'كل كسارة، وتتحقق حسابيًا إن الوزن الصافي = القائم − الفارغ، وتعلّم أي إيصال فيه شك باللون الأصفر. ' +
      'الصور بترفع للتحليل فقط ولا يتم تخزينها بشكل دائم.',
    colIndex: '#',
    colFileName: 'اسم الملف',
    colPageNumber: 'رقم الصفحة',
    colStatus: 'الحالة',
    statusDone: 'تم',
    statusProcessing: 'جاري...',
    statusRetrying: 'إعادة محاولة...',
    statusQueued: 'في الانتظار',
    statusFailed: 'فشل',
    progressStarting: 'جاري البدء...',
    progressAnalyzing: (name, page) => `جاري تحليل: ${name} (صفحة ${page})`,
    progressRetrying: (name, page, attempt) => `إعادة محاولة: ${name} (صفحة ${page}) — المحاولة ${attempt}`,
    progressComplete: 'اكتمل التحليل ✅',
    analysisFailed: 'فشل التحليل',
    timeoutError: 'انتهت مهلة الطلب — السيرفر استغرق وقتًا طويلاً للرد. هيتم إعادة المحاولة تلقائيًا.',
    pdfSplitFailed: (msg) => `فشل فتح ملف PDF: ${msg}`,
    imageReadFailed: (msg) => `فشل قراءة الصورة: ${msg}`,
    excelSheetName: 'الإيصالات',
    excelTotalReceipts: (n) => `إجمالي الإيصالات: ${n}`,
    excelNeedsReview: (n) => `تحتاج مراجعة: ${n}`,
  },
};

// Internal field key -> display label, per language.
const FIELD_ORDER = [
  'اسم_الجهة', 'نوع_المستند', 'رقم_الايصال', 'التاريخ_والوقت', 'العميل_او_المورد',
  'نوع_المادة', 'المصدر_او_الكسارة', 'الموقع', 'اسم_السائق', 'رقم_السيارة',
  'الوزن_القائم', 'الوزن_الفارغ', 'الوزن_الصافي', 'وحدة_الوزن', 'الكمية', 'الوحدة',
  'سعر_الوحدة', 'الاجمالي', 'اسم_المشغل', 'رقم_امر_الشراء', 'رقم_بونة_الوزن',
  'يوجد_ختم_او_توقيع', 'ملاحظات_مكتوبة_بخط_اليد', 'ملاحظات_التحقق', 'مستوى_الثقة',
];

const FIELD_LABELS = {
  en: {
    اسم_الجهة: 'Company Name', نوع_المستند: 'Document Type', رقم_الايصال: 'Receipt No.',
    التاريخ_والوقت: 'Date & Time', العميل_او_المورد: 'Customer/Supplier', نوع_المادة: 'Material Type',
    المصدر_او_الكسارة: 'Source/Crusher', الموقع: 'Location', اسم_السائق: 'Driver Name',
    رقم_السيارة: 'Vehicle No.', الوزن_القائم: 'Gross Weight', الوزن_الفارغ: 'Tare Weight',
    الوزن_الصافي: 'Net Weight', وحدة_الوزن: 'Weight Unit', الكمية: 'Quantity', الوحدة: 'Unit',
    سعر_الوحدة: 'Unit Price', الاجمالي: 'Total', اسم_المشغل: 'Operator Name',
    رقم_امر_الشراء: 'PO Number', رقم_بونة_الوزن: 'Weighbridge Slip No.',
    يوجد_ختم_او_توقيع: 'Stamp/Signature Present', ملاحظات_مكتوبة_بخط_اليد: 'Handwritten Notes',
    ملاحظات_التحقق: 'Verification Notes', مستوى_الثقة: 'Confidence Level',
  },
  ar: {
    اسم_الجهة: 'اسم الجهة', نوع_المستند: 'نوع المستند', رقم_الايصال: 'رقم الإيصال',
    التاريخ_والوقت: 'التاريخ والوقت', العميل_او_المورد: 'العميل/المورد', نوع_المادة: 'نوع المادة',
    المصدر_او_الكسارة: 'المصدر/الكسارة', الموقع: 'الموقع', اسم_السائق: 'اسم السائق',
    رقم_السيارة: 'رقم السيارة', الوزن_القائم: 'الوزن القائم', الوزن_الفارغ: 'الوزن الفارغ',
    الوزن_الصافي: 'الوزن الصافي', وحدة_الوزن: 'وحدة الوزن', الكمية: 'الكمية', الوحدة: 'الوحدة',
    سعر_الوحدة: 'سعر الوحدة', الاجمالي: 'الإجمالي', اسم_المشغل: 'اسم المشغل',
    رقم_امر_الشراء: 'رقم أمر الشراء', رقم_بونة_الوزن: 'رقم بونة الوزن',
    يوجد_ختم_او_توقيع: 'يوجد ختم/توقيع', ملاحظات_مكتوبة_بخط_اليد: 'ملاحظات بخط اليد',
    ملاحظات_التحقق: 'ملاحظات التحقق', مستوى_الثقة: 'مستوى الثقة',
  },
};

// "لا"/"منخفضة" style values that the AI returns are always in Arabic (per prompt.txt).
// Translate the handful of known enum values for nicer English display.
const VALUE_TRANSLATIONS = {
  en: {
    'نعم': 'Yes', 'لا': 'No',
    'مرتفعة': 'High', 'متوسطة': 'Medium', 'منخفضة': 'Low',
  },
};

function translateValue(lang, raw) {
  if (!raw) return raw;
  if (lang === 'en' && VALUE_TRANSLATIONS.en[raw]) return VALUE_TRANSLATIONS.en[raw];
  return raw;
}
