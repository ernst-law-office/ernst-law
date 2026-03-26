module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Edit mode
  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
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
          max_tokens: 1500,
          messages: [{ role: 'user', content: `ערוך את הטקסט הבא בהתאם להוראה. לקוח: ${clientName}
טקסט נוכחי:
${currentText}
הוראה: ${instruction}
החזר JSON בלבד: {"edited_text": "הטקסט המעודכן"}` }],
        }),
      });
      const data = await r.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON' });
      return res.status(200).json(JSON.parse(match[0]));
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const { consultData: c, phase } = req.body;
  if (!c) return res.status(400).json({ error: 'Missing data' });

  const baseInfo = `לקוח: ${c.client_name}
סוג תיק: ${c.case_type || 'תכנון בין-דורי'}
תאריך: ${c.date || 'לא צוין'}
פוטנציאל שכ"ט: ${c.fee_potential || 0} שקל
מורכבות: ${c.complexity_level || 'בינונית'}
הערות: ${c.notes || 'אין'}
${c.transcript ? 'סיכום שיחה:\n' + c.transcript : ''}`;

  const systemPrompt = `אתה סוכן AI המסייע לעורך דין איתמר ארנסט בניתוח שיחות ייעוץ בנושא תכנון העברה בין-דורית. אין להוסיף מידע שלא נאמר. אם חסר מידע — ציין זאת. הכל בעברית.`;

  try {
    // PHASE 1: Quick analysis — scores, emails, classification
    if (!phase || phase === 1) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `${baseInfo}

החזר JSON בלבד:
{
  "summary": "סיכום 2-3 משפטים",
  "recommendation": "המלצה אסטרטגית",
  "next_action": "email",
  "complexity_level": "נמוכה/בינונית/גבוהה/גבוהה מאוד",
  "fee_potential_suggestion": 0,
  "seriousness_level": "1-5",
  "closing_probability": "0-100",
  "suggested_followup_days": "7 או 14 או 21",
  "case_classification": "סיווג: סוג משפחה, נכסים, מורכבות משפטית ומיסויית, כלים רלוונטיים",
  "client_summary": "סיכום ידידותי ללקוח: תודה, עיקרי הדברים, מטרות, נושאים לבחינה",
  "ai_email_draft": "מייל סיכום ללקוח (6-8 שורות): מקצועי, ידידותי",
  "ai_call_reminder": "מייל פולואפ אם הלקוח לא שלח נתונים"
}` }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error?.message });
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON', raw: text.substring(0,200) });
      return res.status(200).json({ phase: 1, ...JSON.parse(match[0]) });
    }

    // PHASE 2: Deep analysis — reports, proposals, tasks
    if (phase === 2) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `${baseInfo}

החזר JSON בלבד:
{
  "diagnostic_report": "דוח אבחון מקצועי פנימי: רקע, מבנה משפחתי, מבנה נכסים, מטרות, אתגרים, כיווני פתרון, מידע חסר, שלבים הבאים",
  "professional_analysis": "ניתוח מקצועי: מורכבויות משפטיות/משפחתיות/מיסויות, סיכונים, הזדמנויות",
  "strategic_alternatives": "3 חלופות: שמרנית / ביניים / אקטיבית — מהות, כלים, יתרונות, חסרונות",
  "tasks_client": "משימות ללקוח: מסמכים ונתונים להשלמה",
  "tasks_lawyer": "משימות לעורך הדין: בדיקות מס, חלופות, בדיקות משפטיות",
  "questionnaire": "שאלון לשליחה ללקוח: פרטי נכסים ומידע נוסף",
  "asset_map": "מפת נכסים: מבנה משפחה + רשימת נכסים + נקודות לתכנון",
  "fee_proposal": "הצעת שכ"ט: שלב א) אבחון ותכנון שלב ב) תשתית משפטית שלב ג) יישום — עם מחירים ריאליים. עלות שלב א מקוזזת אם מתקדמים"
}` }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error?.message });
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON', raw: text.substring(0,200) });
      return res.status(200).json({ phase: 2, ...JSON.parse(match[0]) });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
