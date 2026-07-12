// Vercel Serverless Function — يستقبل صورة إيصال (Base64) ويرجع بيانات مستخرجة كـ JSON
// يستخدم مفتاح OpenAI المخزّن كمتغير بيئة على السيرفر (OPENAI_API_KEY) فلا يظهر أبدًا للمستخدم.

const PROMPT_TEXT = require('./prompt-text.js');

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

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = await openaiRes.json();

    if (!openaiRes.ok) {
      const msg = (json && json.error && json.error.message) || 'فشل الاتصال بـ OpenAI';
      return res.status(502).json({ error: msg });
    }

    const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
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
    return res.status(500).json({ error: (err && err.message) || 'خطأ غير متوقع في السيرفر' });
  }
};
