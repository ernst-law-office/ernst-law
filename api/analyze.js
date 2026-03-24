module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { consultData: c } = req.body;
  if (!c) return res.status(400).json({ error: 'Missing data' });

  const prompt = `אתה יועץ משפטי. ענה בJSON בלבד, ללא טקסט לפני או אחרי.
נתוני שיחה: לקוח: ${c.client_name}, סוג: ${c.case_type||'לא צוין'}, שכ"ט: ${c.fee_potential||0}, הערות: ${c.notes||'אין'}.
החזר בדיוק:
{"summary":"סיכום קצר","recommendation":"המלצה","next_action":"email","email_draft":"טיוטת מייל","call_reminder":"תזכורת"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await r.json();
    
    if (!r.ok) {
      console.error('API error:', data);
      return res.status(500).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.[0]?.text || '';
    console.log('Raw response:', text);
    
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response', raw: text });
    
    const result = JSON.parse(match[0]);
    return res.status(200).json(result);
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
