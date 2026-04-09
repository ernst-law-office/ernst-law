module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({error:'ANTHROPIC_API_KEY not set'});

  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1500,
          messages:[{role:'user',content:'ערוך:\n'+currentText+'\nהוראה: '+instruction+'\nJSON: {"edited_text":"..."}'}]}),
      });
      const d=await r.json();
      const m=(d.content?.[0]?.text||'').match(/\{[\s\S]*\}/);
      if(!m) return res.status(500).json({error:'no json'});
      return res.status(200).json(JSON.parse(m[0]));
    } catch(e){return res.status(500).json({error:e.message});}
  }

  const {consultData:c} = req.body;
  if (!c) return res.status(400).json({error:'Missing data'});

  const sys = [
    'אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית.',
    '',
    'הוראות מערכת:',
    'אין להוסיף מידע שלא נמסר. אם חסר - ציין "מידע חסר / טעון השלמה".',
    'הבחן בין מצב A (שירות נקודתי: צוואה/יפו"כ) למצב B (תכנון בין-דורי מלא).',
    '',
    'תמחור מצב A: חבילת צוואות + יפו"כ עם הנחה 10%. אם ניתן לחסוך במס - הצע חלופה.',
    'תמחור מצב B: פגישת אבחון 5,000 ש"ח + מעמ. תהליך מלא 30,000-50,000 ש"ח + מעמ.',
    'הצג עלויות בביטחון, ללא התנצלות, עם חידוד ערך.',
    '',
    'INTERGENERATIONAL_CASE_CLASSIFIER:',
    'סווג סוג משפחה, סוג נכסים, מורכבות משפטית ומיסויית.',
    '',
    'כתוב תשובות מפורטות ומקצועיות. כל הפלט בעברית.',
  ].join('\n');

  const info = [
    'לקוח: ' + c.client_name,
    'סוג תיק: ' + (c.case_type||'תכנון בין-דורי'),
    'תאריך: ' + (c.date||'לא צוין'),
    'שכ"ט שעלה בשיחה: ' + (c.fee_potential ? c.fee_potential+' ש"ח' : 'לא צוין'),
    '',
    'סיכום השיחה:',
    (c.notes||c.transcript||'אין'),
  ].join('\n');

  const prompt = info + '\n\n' + [
    'פעל לפי שלב ב של ה-Workflow: ניתוח שיחת ייעוץ/אבחון.',
    'זהה מצב A או B. הפק JSON בלבד עם 6 שדות מפורטים:',
    '{',
    '"summary": "תקציר מנהלים מלא: עיקרי השיחה | מבנה משפחתי | מבנה נכסים | מטרות הלקוח | סיכונים מרכזיים | המלצה להמשך | עלויות שעלו | מועד הפגישה הבאה | מידע חסר",',
    '"recommendation": "המלצה ברורה ומנומקת",',
    '"complexity_level": "נמוכה / בינונית / גבוהה / גבוהה מאוד",',
    '"fee_potential_suggestion": "סכום ריאלי",',
    '"seriousness_level": "1-5",',
    '"closing_probability": "0-100",',
    '"suggested_followup_days": "7 / 14 / 21",',
    '"case_classification": "מצב A/B | סוג משפחה | סוג נכסים | מורכבות משפטית + נימוק | מורכבות מיסויית + נימוק | מידע חסר",',
    '"client_summary": "סיכום ידידותי מפורט ללקוח: תודה | עיקרי הדברים שעלו | מטרות המשפחה | נושאים לבחינה | מה מחכה לו. שפה פשוטה וברורה - לא משפטית",',
    '"ai_email_draft": "מייל מלא ומפורט ללקוח לפי מצב A/B:\n- שורת פתיחה עם תודה\n- סיכום השיחה בכותרות\n- הכנה לפגישה / המשך תהליך\n- רשימת מסמכים/מידע נדרש\n- הבהרת עלויות וערך התהליך\n- תאריך הפגישה או הצעת מועדים\n- חתימה מקצועית\n10-14 שורות",',
    '"ai_call_reminder": "מייל פולואפ מלא: פנייה אישית | תזכורת ערך | בקשת השלמת מידע | הצעת סיוע | חתימה. 6-8 שורות"',
    '}',
  ].join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens:4000,
        system:sys,
        messages:[{role:'user',content:prompt}],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('API '+r.status+': '+(d.error?.message||JSON.stringify(d)));
    const text = (d.content?.[0]?.text||'');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json: '+text.substring(0,300));
    return res.status(200).json({phase:1,...JSON.parse(m[0])});
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({error:e.message});
  }
}
