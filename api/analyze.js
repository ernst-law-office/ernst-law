module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: `ערוך את הטקסט לפי ההוראה.\nלקוח: ${clientName}\nטקסט: ${currentText}\nהוראה: ${instruction}\nהחזר JSON בלבד: {"edited_text":"..."}` }],
        }),
      });
      const d = await r.json();
      const m = (d.content?.[0]?.text||'').match(/\{[\s\S]*\}/);
      if (!m) return res.status(500).json({error:'no json'});
      return res.status(200).json(JSON.parse(m[0]));
    } catch(e) { return res.status(500).json({error:e.message}); }
  }

  const { consultData: c, phase } = req.body;
  if (!c) return res.status(400).json({error:'Missing data'});

  const sys = `אתה סוכן AI פנימי של משרד עורכי דין לתכנון העברה בין-דורית.
כללים: אל תוסיף מידע שלא נמסר. אם חסר מידע ציין "מידע חסר". השפה פנימית מקצועית, ללקוח ברורה ומכבדת.
הבחן בין שירות נקודתי לתהליך תכנון מלא. פגישת אבחון: 3000+מעמ. תהליך מלא: 30000-50000+מעמ.
הפעל: INTERGENERATIONAL_CASE_CLASSIFIER. כל הפלט בעברית.`;

  const info = `לקוח: ${c.client_name}
סוג תיק: ${c.case_type||'תכנון בין-דורי'}
תאריך: ${c.date||'לא צוין'}
שכ"ט: ${c.fee_potential?'₪'+c.fee_potential.toLocaleString():'לא צוין'}
סיכום שיחה: ${c.notes||c.transcript||'אין'}`;

  const call = async (msg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:3000,system:sys,messages:[{role:'user',content:msg}]}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message||'API error '+r.status);
    const m = (d.content?.[0]?.text||'').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json in response');
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase===1) {
      const result = await call(`${info}

החזר JSON בלבד (ללא הסברים) עם השדות הבאים. ערך כל שדה הוא מחרוזת בעברית:
{
"summary": "תקציר מנהלים הכולל: עיקרי השיחה, מבנה משפחתי, מבנה נכסים, מטרות הלקוח, סיכונים, עלויות שעלו, מידע חסר, המלצה להמשך",
"recommendation": "המלצה לפעולה הבאה במשפט אחד",
"complexity_level": "נמוכה",
"fee_potential_suggestion": "0",
"seriousness_level": "3",
"closing_probability": "50",
"suggested_followup_days": "7",
"case_classification": "סיווג לפי INTERGENERATIONAL_CASE_CLASSIFIER: סוג משפחה, נכסים, מורכבות, כלים רלוונטיים",
"client_summary": "סיכום ידידותי ללקוח: עיקרי השיחה, מה מחכה לו, ערך התהליך",
"ai_email_draft": "מייל ללקוח: תודה על השיחה, סיכום, הכנה לפגישה, מסמכים נדרשים, עלות אבחון וערך התהליך, תאריך מוצע",
"ai_call_reminder": "מייל פולואפ ידידותי עם תזכורת ערך"
}`);
      return res.status(200).json({phase:1,...result});
    }

    if (phase===2) {
      const result = await call(`${info}

החזר JSON בלבד (ללא הסברים) עם השדות הבאים. ערך כל שדה הוא מחרוזת בעברית:
{
"diagnostic_report": "אבחון פנימי: מוקד לשימור, מוקד לשיפור, המלצה לסגירה, רמת תיק, הסתברות סגירה, פעולה הבאה",
"professional_analysis": "ניתוח מקצועי: מורכבויות משפטיות ומיסויות, סיכונים, הזדמנויות, כלים רלוונטיים",
"strategic_alternatives": "3 חלופות תכנון: שמרנית, ביניים, אקטיבית - כל אחת עם מהות, כלים, יתרונות, חסרונות, עלות",
"tasks_client": "משימות ללקוח: מסמכים, מידע להשלמה, פעולות נדרשות",
"tasks_lawyer": "משימות לעורך הדין: בדיקות, ניסוח, תיאום",
"questionnaire": "שאלון מותאם אישית לשיחה זו: שאלות על נכסים, ירושות, מצב ילדים, צוואות, העברות קודמות, נכסים פיננסיים",
"asset_map": "מפת נכסים: מבנה משפחה, רשימת נכסים עם סוג ובעלות, נקודות לתכנון, מידע חסר",
"fee_proposal": "הצעת שכר טרחה: פגישת אבחון 3000 שקל ומעמ לצורך מיפוי וסימולציות. תהליך מלא 30000-50000 שקל ומעמ הכולל שלוש שלבים: אבחון ותכנון, בניית תשתית משפטית, יישום. עלות שלב האבחון מקוזזת אם ממשיכים. הצג בביטחון עם הדגשת הערך."
}`);
      return res.status(200).json({phase:2,...result});
    }

    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('analyze error:', e.message);
    return res.status(500).json({error:e.message});
  }
}
