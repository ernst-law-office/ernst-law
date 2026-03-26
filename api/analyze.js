module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Edit mode — refine existing text
  if (req.body.editMode) {
    const { currentText, instruction, clientName, fieldKey } = req.body;
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
          max_tokens: 2000,
          messages: [{ role: 'user', content: `ערוך את הטקסט הבא בהתאם להוראה.
לקוח: ${clientName}
טקסט נוכחי:
${currentText}

הוראה לעריכה: ${instruction}

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

  const { consultData: c } = req.body;
  if (!c) return res.status(400).json({ error: 'Missing data' });

  const systemPrompt = `אתה סוכן AI המסייע לעורך דין איתמר ארנסט בניתוח שיחות ייעוץ בנושא תכנון העברה בין-דורית של נכסים במשפחה.

כללי עבודה קריטיים:
- בסס את הניתוח על סיכום השיחה שסופק.
- אין להוסיף מידע שלא נאמר בשיחה.
- אם מידע חסר – יש לציין זאת במפורש.
- אין לכלול מספרי תעודת זהות, מספרי חשבון או כתובות מדויקות.
- השפה בתוצרים ללקוח: פשוטה, ברורה, לא משפטית מדי.
- כל התוצרים בעברית.

המערכת מפעילה את המודולים הבאים:

INTERGENERATIONAL_CASE_CLASSIFIER:
- סיווג סוג המשפחה
- סיווג סוג הנכסים
- הערכת מורכבות משפטית (נמוכה/בינונית/גבוהה)
- הערכת מורכבות מיסויית (נמוכה/בינונית/גבוהה)
- זיהוי כלים משפטיים רלוונטיים

INTERGENERATIONAL_STRATEGY_ENGINE:
- הגדרת מטרת התכנון
- זיהוי אילוצים
- 3 חלופות: שמרנית / ביניים / אקטיבית

PROMPT_PROFESSIONAL_ANALYSIS:
- מורכבויות משפטיות, משפחתיות, מיסויות
- סיכונים אפשריים
- הזדמנויות לתכנון
- נושאים לבחינה בלבד - אין מסקנות סופיות`;

  const transcriptSection = c.transcript
    ? `\n\nסיכום השיחה המלא (מ-HappyScribe):\n${c.transcript}`
    : '';

  const userPrompt = `נתוני שיחת ייעוץ:
לקוח: ${c.client_name}
סוג תיק: ${c.case_type || 'תכנון בין-דורי'}
תאריך: ${c.date || 'לא צוין'}
פוטנציאל שכ"ט משוער: ${c.fee_potential || 0} שקל
הערות: ${c.notes || 'אין'}${transcriptSection}

בצע ניתוח מלא והחזר JSON בלבד (ללא טקסט לפני או אחרי):

{
  "summary": "סיכום קצר 2-3 משפטים של עיקרי השיחה",
  "recommendation": "המלצה אסטרטגית ראשית לעורך הדין",
  "next_action": "email",
  "complexity_level": "נמוכה או בינונית או גבוהה או גבוהה מאוד",
  "fee_potential_suggestion": "הצעה לשכ"ט משוער בשקלים כמספר בלבד",
  "seriousness_level": "מספר 1-5",
  "closing_probability": "אחוז סגירה משוער 0-100",
  "case_classification": "סיווג התיק: סוג משפחה, נכסים, מורכבות משפטית ומיסויית, כלים רלוונטיים",
  "professional_analysis": "ניתוח מקצועי: מורכבויות, סיכונים, הזדמנויות, נושאים לבחינה",
  "strategic_alternatives": "3 חלופות: שמרנית / ביניים / אקטיבית עם יתרונות וחסרונות לכל אחת",
  "diagnostic_report": "דוח אבחון מקצועי פנימי: רקע, מבנה משפחתי, מבנה נכסים, מטרות, אתגרים, כיווני פתרון, מידע חסר, שלבים הבאים",
  "client_summary": "סיכום ידידותי ללקוח בשפה פשוטה: תודה, עיקרי הדברים, מטרות, נושאים לבחינה",
  "tasks_client": "משימות ללקוח: מסמכים ונתונים להשלמה",
  "tasks_lawyer": "משימות לעורך הדין: בדיקות מס, חלופות, בדיקות נוספות",
  "questionnaire": "שאלון לשליחה ללקוח במייל לצורך השלמת נתונים על נכסים ומידע נוסף",
  "asset_map": "מפת נכסים: מבנה משפחה + רשימת נכסים עם סוג/בעלות/מידע לתכנון + נקודות לתכנון עתידי",
  "fee_proposal": "הצעת שכר טרחה בשלושה שלבים: א) אבחון ותכנון ב) בניית תשתית משפטית ג) יישום. כלול טווח מחירים ריאלי. ציין כי עלות שלב א מקוזזת מהשכ"ט הכולל אם מתקדמים",
  "email_draft": "מייל סיכום ללקוח (6-8 שורות): מקצועי, ידידותי, לא טכני מדי",
  "call_reminder": "מייל פולואפ אם הלקוח לא שלח נתונים",
  "suggested_followup_days": "מספר ימים מומלץ לפולו-אפ (7 או 14 או 21) בהתאם לרצינות הלקוח"
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
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.error?.message || 'API error' });

    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON', raw: text.substring(0, 500) });

    const result = JSON.parse(match[0]);
    return res.status(200).json(result);
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
