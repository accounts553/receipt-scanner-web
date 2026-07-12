// Vercel Serverless Function — يستقبل صورة إيصال (Base64) ويرجع بيانات مستخرجة كـ JSON
// يستخدم مفتاح OpenAI المخزّن كمتغير بيئة على السيرفر (OPENAI_API_KEY) فلا يظهر أبدًا للمستخدم.
// Hardened: request-size guard, upstream timeout, and one automatic retry on transient OpenAI errors
// so large batches of receipts (sent one page at a time by the client) don't fail on a single flaky call.

const PROMPT_TEXT = require('./prompt-text.js');

const UPSTREAM_TIMEOUT_MS = 50000; // stay comfortably under the function's maxDuration
const MAX_BODY_BYTES = 8 * 1024 * 1024; // ~8MB base64 payload safety guard (well under Vercel's hard limit)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAI(apiKey, body, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'لم يتم ضبط مفتاح OpenAI على السيرفر بعد. أضف OPENAI_API_KEY في إعدادات Vercel (Environment Variables) ثم أعد النشر.',
      });
    }

    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'الصورة مفقودة (imageBase64)' });
    }
    if (imageBase64.length > MAX_BODY_BYTES) {
      return res.status(413).json({
        error: 'الصورة كبيرة جدًا بعد الترميز. جرب تقليل الدقة أو تقسيم الملف لصفحات أصغر (الأداة بتعمل ده تلقائيًا عادة).',
      });
    }

    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PROMPT_TEXT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'حلل هذا الإيصال/البونة واستخرج البيانات بالضبط وفق التعليمات، وارجع JSON فقط.' },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    // One automatic retry on transient upstream failures (timeouts, 429, 5xx) so a momentary
    // OpenAI hiccup doesn't fail an entire large batch of receipts.
    let attemptResult;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        attemptResult = await callOpenAI(apiKey, body, UPSTREAM_TIMEOUT_MS);
        if (attemptResult.ok) break;
        const status = attemptResult.status;
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt === 1) break;
        await sleep(1500);
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = new Error('انتهت مهلة الاتصال بـ OpenAI (upstream timeout)');
        }
        if (attempt === 1) break;
        await sleep(1500);
      }
    }

    if (!attemptResult) {
      throw lastError || new Error('فشل الاتصال بـ OpenAI');
    }

    if (!attemptResult.ok) {
      const msg = (attemptResult.json && attemptResult.json.error && attemptResult.json.error.message) || 'فشل الاتصال بـ OpenAI';
      return res.status(502).json({ error: msg });
    }

    const content = attemptResult.json.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'رد فارغ من الذكاء الاصطناعي' });
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      return res.status(502).json({ error: 'فشل تحليل رد الذكاء الاصطناعي (JSON غير صالح)' });
    }

    return res.status(200).json({ data });
  } catch (err) {
    console.error('analyze error', err);
    const msg = (err && err.message) || 'خطأ غير متوقع في السيرفر';
    return res.status(500).json({ error: msg });
  }
};
