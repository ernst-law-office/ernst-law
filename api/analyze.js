module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Edit mode
  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: `ערוך את הטקסט הבא בהתאם להוראה. לקוח: ${clientName}\nטקסט:\n${currentText}\nהוראה: ${instruction}\nהחזר JSON בלבד: {"edited_text": "..."}` }],
        }),
      });
      const data = await r.json();
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON' });
      return res.status(200).json(JSON.parse(match[0]));
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  const { consultData: c, phase } = req.body;
  if (!c) return res.status(400).json({ error: 'Missing data' });

  const systemPrompt = `אתה סוכן AI פנימי של משרד עורכי דין המתמחה בתכנון העברה בין-דורית.

עקרונות עבודה:
- אין להוסיף מידע שלא נמסר. אם מידע חסר, ציין זאת תחת "מידע חסר / טעון השלמה"
- אין לכלול במסמכים חיצוניים: מספרי ת"ז, מספרי חשבון, כתובות מדויקות
- שפה פנימית: מקצועית, מדויקת, תמציתית
- שפה ללקוח: ברורה, מכבדת, לא משפטית מדי
- הבחן בין שירות נקודתי (צוואה/יפו"כ) לתהליך תכנון בין-דורי מלא
- הפעל: INTERGENERATIONAL_CASE_CLASSIFIER, מערכת האבחון הראשית, Workflow Process Intergenerational Planning
- כאשר עלויות עלו בשיחה: הצג אותן במדויק, בטוח, לא מתנצל, תוך חידוד הערך
- כל הפלט בעברית בלבד`;

  const baseInfo = `לקוח: ${c.client_name}
סוג תיק: ${c.case_type || 'תכנון בין-דורי'}
תאריך שיחה: ${c.date || 'לא צוין'}
שכ"ט שעלה בשיחה: ${c.fee_potential ? '₪' + c.fee_potential.toLocaleString() : 'לא צוין'}
מורכבות: ${c.complexity_level || 'לא הוגדרה'}
הערות/סיכום שיחה:
${c.notes || c.transcript || 'אין'}`;

  try {
    // PHASE 1: תקציר, מייל ללקוח, אבחון פנימי, ציונים
    if (!phase || phase === 1) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `${baseInfo}

הפק JSON בלבד עם השדות הבאים:

{
  "summary": "תקציר מנהלים: עיקרי השיחה, מבנה משפחתי, מבנה נכסים, מטרות הלקוח, סיכונים מרכזיים, עלויות שעלו בשיחה, מידע חסר, המלצה להמשך",
  "recommendation": "המלצה לפעולה הבאה — משפט אחד קצר",
  "complexity_level": "נמוכה או בינונית או גבוהה או גבוהה מאוד",
  "fee_potential_suggestion": 0,
  "seriousness_level": "1-5",
  "closing_probability": "0-100",
  "suggested_followup_days": "7 או 14 או 21",
  "case_classification": "סיווג לפי INTERGENERATIONAL_CASE_CLASSIFIER: סוג משפחה, מבנה נכסים, מורכבות משפטית ומיסויית, כלים רלוונטיים, הבחנה בין שירות נקודתי לתהליך מלא",
  "client_summary": "סיכום ידידותי ללקוח: עיקרי השיחה, מה מחכה לו, ערך התהליך",
  "ai_email_draft": "מייל ללקוח עם המבנה הקבוע: תודה על השיחה | סיכום בכותרות | הכנה לפגישה שנקבעה | מסמכים/מידע נדרש | הבהרת עלות פגישת האבחון (3,000+מעמ) והמשך התהליך | חיזוק ערך התהליך | תאריך/מועדים",
  "ai_call_reminder": "מייל פולואפ למקרה שהלקוח לא שלח מסמכים — ידידותי, עם תזכורת ערך"
}` }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error?.message });
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON', raw: text.substring(0,300) });
      return res.status(200).json({ phase: 1, ...JSON.parse(match[0]) });
    }

    // PHASE 2: אבחון פנימי, שאלון, משימות, מפת נכסים, הצעת שכ"ט
    if (phase === 2) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `${baseInfo}

הפק JSON בלבד עם השדות הבאים:

{
  "diagnostic_report": "אבחון שיחה פנימי: מוקד לשימור | מוקד לשיפור | המלצה לפעולה לקראת סגירה | הערכת רמת התיק | הערכת הסתברות לסגירה | הצעת פעולה הבאה",
  "professional_analysis": "ניתוח מקצועי: מורכבויות משפטיות, מיסויות, משפחתיות | סיכונים | הזדמנויות | כלים רלוונטיים",
  "strategic_alternatives": "חלופות תכנון: שמרנית / ביניים / אקטיבית — מהות, כלים משפטיים, יתרונות, חסרונות, עלות משוערת לכל חלופה",
  "tasks_client": "משימות ללקוח: מסמכים נדרשים, מידע להשלמה, פעולות נדרשות",
  "tasks_lawyer": "משימות לעו\"ד: בדיקות מס, ניסוח מסמכים, בדיקות משפטיות, תיאום",
  "questionnaire": "שאלון מותאם אישית ללקוח — רק שאלות רלוונטיות לשיחה זו: נכסים, ירושות/מתנות, מצב ילדים, צוואות קיימות, העברות קודמות, נכסים פיננסיים, סדרי עדיפויות. ללא מידע רגיש",
  "asset_map": "מפת נכסים משפחתית: מבנה משפחה + רשימת נכסים (סוג/בעלות/ערך משוער) + נקודות לתכנון + מידע חסר",
  "fee_proposal": "הצעת שכר טרחה מפורטת:\n• פגישת אבחון: 3,000 ₪ + מע\"מ (כולל מיפוי, סימולציות, בחינת חלופות)\n• תהליך תכנון מלא: טווח מחירים ריאלי בהתאם למורכבות (30,000–50,000 ₪ + מע\"מ)\n• פירוט שלבים: א) אבחון ותכנון ב) בניית תשתית משפטית ג) יישום\n• ציון שעלות שלב א' מקוזזת מהשכ\"ט הכולל אם מתקדמים\nהצג בביטחון, ללא התנצלות, עם חידוד הערך"
}` }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data.error?.message });
      const text = data.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON', raw: text.substring(0,300) });
      return res.status(200).json({ phase: 2, ...JSON.parse(match[0]) });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
