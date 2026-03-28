module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
          messages: [{ role: 'user', content: 'ערוך את הטקסט הבא בהתאם להוראה.\nלקוח: ' + clientName + '\nטקסט:\n' + currentText + '\nהוראה: ' + instruction + '\nהחזר JSON בלבד: {"edited_text": "..."}' }],
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

  const systemPrompt = [
    'אתה סוכן AI פנימי של משרד עורכי דין המתמחה בתכנון העברה בין-דורית.',
    'עקרונות: אין להוסיף מידע שלא נמסר. אם חסר - ציין תחת "מידע חסר". אין לכלול ת"ז/חשבונות/כתובות במסמכים חיצוניים.',
    'שפה פנימית: מקצועית ותמציתית. שפה ללקוח: ברורה ומכבדת.',
    'הבחן בין שירות נקודתי (צוואה/יפו"כ) לתהליך תכנון בין-דורי מלא.',
    'הפעל: INTERGENERATIONAL_CASE_CLASSIFIER, מערכת האבחון הראשית, Workflow Process Intergenerational Planning.',
    'עלויות: פגישת אבחון 3,000+מעמ, תהליך מלא 30,000-50,000+מעמ. הצג בביטחון עם חידוד ערך.',
    'כל הפלט בעברית בלבד.'
  ].join('\n');

  const baseInfo = [
    'לקוח: ' + c.client_name,
    'סוג תיק: ' + (c.case_type || 'תכנון בין-דורי'),
    'תאריך שיחה: ' + (c.date || 'לא צוין'),
    'שכ"ט שעלה: ' + (c.fee_potential ? '₪' + c.fee_potential.toLocaleString() : 'לא צוין'),
    'מורכבות: ' + (c.complexity_level || 'לא הוגדרה'),
    'סיכום שיחה:',
    (c.notes || c.transcript || 'אין'),
  ].join('\n');

  const callClaude = async (userMsg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, system: systemPrompt, messages: [{ role: 'user', content: userMsg }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'API error');
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    return JSON.parse(match[0]);
  };

  try {
    if (!phase || phase === 1) {
      const prompt1 = baseInfo + '\n\nהחזר JSON בלבד עם השדות:\n' + JSON.stringify({
        summary: 'תקציר מנהלים: עיקרי השיחה, מבנה משפחתי, מבנה נכסים, מטרות הלקוח, סיכונים, עלויות שעלו, מידע חסר, המלצה להמשך',
        recommendation: 'המלצה לפעולה הבאה — משפט קצר',
        complexity_level: 'נמוכה/בינונית/גבוהה/גבוהה מאוד',
        fee_potential_suggestion: 0,
        seriousness_level: '1-5',
        closing_probability: '0-100',
        suggested_followup_days: '7 או 14 או 21',
        case_classification: 'סיווג INTERGENERATIONAL_CASE_CLASSIFIER: סוג משפחה, נכסים, מורכבות משפטית ומיסויית, כלים רלוונטיים',
        client_summary: 'סיכום ידידותי ללקוח: עיקרי השיחה, מה מחכה לו, ערך התהליך',
        ai_email_draft: 'מייל ללקוח: תודה על השיחה | סיכום בכותרות | הכנה לפגישה | מסמכים נדרשים | עלות פגישת אבחון (3,000+מעמ) וערך התהליך | תאריך מוצע',
        ai_call_reminder: 'מייל פולואפ ידידותי עם תזכורת ערך',
      }, null, 0);
      const result = await callClaude(prompt1);
      return res.status(200).json({ phase: 1, ...result });
    }

    if (phase === 2) {
      const prompt2 = baseInfo + '\n\nהחזר JSON בלבד עם השדות:\n' + JSON.stringify({
        diagnostic_report: 'אבחון שיחה פנימי: מוקד לשימור | מוקד לשיפור | המלצה לסגירה | הערכת רמת תיק | הסתברות סגירה | פעולה הבאה',
        professional_analysis: 'ניתוח מקצועי: מורכבויות משפטיות/מיסויות/משפחתיות, סיכונים, הזדמנויות, כלים רלוונטיים',
        strategic_alternatives: '3 חלופות: שמרנית/ביניים/אקטיבית — מהות, כלים, יתרונות, חסרונות, עלות',
        tasks_client: 'משימות ללקוח: מסמכים, מידע להשלמה, פעולות נדרשות',
        tasks_lawyer: 'משימות לעו"ד: בדיקות מס, ניסוח, תיאום',
        questionnaire: 'שאלון מותאם אישית — רק שאלות רלוונטיות: נכסים, ירושות, מצב ילדים, צוואות, העברות קודמות, נכסים פיננסיים, סדרי עדיפויות',
        asset_map: 'מפת נכסים: מבנה משפחה + רשימת נכסים (סוג/בעלות/ערך) + נקודות לתכנון + מידע חסר',
        fee_proposal: 'הצעת שכ"ט: פגישת אבחון 3,000+מעמ (מיפוי+סימולציות+חלופות) | תהליך מלא 30,000-50,000+מעמ | שלבים: א)אבחון ב)תשתית משפטית ג)יישום | עלות שלב א מקוזזת אם ממשיכים | הצג בביטחון עם חידוק ערך',
      }, null, 0);
      const result = await callClaude(prompt2);
      return res.status(200).json({ phase: 2, ...result });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch(e) {
    console.error('Analyze error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
