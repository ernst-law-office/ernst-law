module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { consultData: c } = req.body;
  if (!c) return res.status(400).json({ error: 'Missing data' });

  const prompt = `אתה יועץ משפטי מנוסה בתכנון העברה בין-דורית.
נתוני שיחת ייעוץ:
- לקוח: ${c.client_name}
- סוג תיק: ${c.case_type || 'לא צוין'}
- פוטנציאל שכ"ט: ₪${c.fee_potential || 0}
- מורכבות: ${c.complexity_level || 'בינונית'}
- שלב הבא: ${c.next_step || 'לא צוין'}
- רצינות לקוח: ${c.seriousness_level || 'לא צוין'}/5
- הערות: ${c.notes || 'אין'}

ענה בפורמט JSON בלבד:
{
  "summary": "סיכום 2-3 משפטים",
  "recommendation": "המלצה אסטרטגית",
  "next_action": "email",
  "email_draft": "טיוטת מייל פולו-אפ בעברית",
  "call_reminder": "טקסט תזכורת שיחה"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
