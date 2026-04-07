module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({error: 'ANTHROPIC_API_KEY not set'});
  }

  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
          messages: [{ role: 'user', content: 'ערוך את הטקסט לפי ההוראה.\nלקוח: ' + clientName + '\nטקסט:\n' + currentText + '\nהוראה: ' + instruction + '\nהחזר JSON בלבד: {"edited_text":"..."}' }],
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

  const sys = [
    'אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית.',
    '',
    'AGENT_INSTRUCTIONS:',
    'זהה מצב A (שירות נקודתי: צוואה/יפו"כ בלבד) או מצב B (תכנון בין-דורי מלא עם מספר נכסים/שיקולי מס/מורכבות).',
    'אין להוסיף מידע שלא נמסר. אם מידע חסר - ציין במפורש תחת "מידע חסר".',
    'אין לכלול ת"ז, חשבונות, כתובות מדויקות במסמכים חיצוניים.',
    'שפה פנימית: מקצועית ותמציתית. שפה ללקוח: ברורה, מכבדת, לא משפטית.',
    '',
    'INTERGENERATIONAL_CASE_CLASSIFIER:',
    'סווג סוג משפחה: זוג עם ילדים בגירים/קטינים/מנישואים קודמים, פערים כלכליים, נכסים בחול, עסק משפחתי.',
    'סווג נכסים: דירה יחידה, מספר דירות, נכסים מושכרים, קרקע/ירושה, פיננסיים, זכויות בנייה/פינוי-בינוי.',
    'מורכבות משפטית: נמוכה/בינונית/גבוהה (לפי מספר נכסים, יורשים, נישואים שניים, חו"ל).',
    'מורכבות מיסויית: נמוכה/בינונית/גבוהה (לפי שבח, מס רכישה, נכסים מושכרים, ירושות).',
    '',
    'STRATEGY_ENGINE: הצע 3 חלופות - שמרנית/ביניים/אקטיבית. לכל: מהות, כלים משפטיים, יתרונות, חסרונות.',
    'כלים אפשריים: צוואה, צוואה הדדית, יפו"כ מתמשך, הסכם מתנה, הסכם הלוואה, הסכם משפחתי, נאמנות, מנגנוני איזון.',
    '',
    'תמחור (הצג בביטחון ללא התנצלות):',
    'מצב A - צוואות: 5,000-8,000 ש"ח + מעמ.',
    'מצב B - פגישת אבחון: 3,000-5,000 ש"ח + מעמ (מיפוי/סימולציות/חלופות).',
    'מצב B - תהליך מלא: 30,000-50,000 ש"ח + מעמ (תלוי מורכבות).',
    'עלות שלב האבחון מקוזזת מהשכ"ט הכולל אם ממשיכים.',
    '',
    'כל הפלט בעברית בלבד.',
  ].join('\n');

  const info = [
    'לקוח: ' + c.client_name,
    'סוג תיק: ' + (c.case_type || 'תכנון בין-דורי'),
    'תאריך שיחה: ' + (c.date || 'לא צוין'),
    'שכ"ט שעלה בשיחה: ' + (c.fee_potential ? String(c.fee_potential) + ' ש"ח' : 'לא צוין'),
    'סיכום השיחה:',
    (c.notes || c.transcript || 'אין'),
  ].join('\n');

  const call = async (userMsg) => {
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
        system: sys,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('API ' + r.status + ': ' + (d.error && d.error.message ? d.error.message : JSON.stringify(d)));
    const text = d.content && d.content[0] ? d.content[0].text : '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json in response: ' + text.substring(0, 200));
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase === 1) {
      const p1 = info + '\n\n' + [
        'בהתאם ל-INTERGENERATIONAL_CASE_CLASSIFIER, זהה האם מצב A (שירות נקודתי) או B (תכנון מלא).',
        'החזר JSON בלבד עם השדות הבאים (מלא כל שדה בתוכן אמיתי מהשיחה):',
        '{',
        '"summary": "תקציר מנהלים מלא: רקע כללי, מבנה משפחתי, מבנה נכסים, מטרות הלקוח, סוגיות ואתגרים מרכזיים, עלויות שעלו, המלצה להמשך, מידע חסר",',
        '"recommendation": "המלצה לפעולה הבאה במשפט אחד",',
        '"complexity_level": "נמוכה / בינונית / גבוהה / גבוהה מאוד",',
        '"fee_potential_suggestion": "סכום בשקלים ללא סימנים",',
        '"seriousness_level": "1-5",',
        '"closing_probability": "0-100",',
        '"suggested_followup_days": "7 / 14 / 21",',
        '"case_classification": "סיווג מלא לפי INTERGENERATIONAL_CASE_CLASSIFIER: מצב A/B, סוג משפחה, סוג נכסים, מורכבות משפטית, מורכבות מיסויית, מידע חסר",',
        '"client_summary": "סיכום ידידותי ללקוח: תודה על הפגישה, עיקרי הדברים, מטרות, נושאים לבחינה. שפה פשוטה לא משפטית",',
        '"ai_email_draft": "מייל ללקוח לפי מצב A/B: פתיחה-תודה, סיכום בכותרות, המשך תהליך עם עלויות ברורות, נתונים נדרשים, תאריך מוצע. 6-8 שורות",',
        '"ai_call_reminder": "מייל פולואפ 5-7 שורות אם הלקוח לא שלח מסמכים. ידידותי עם תזכורת ערך"',
        '}',
      ].join('\n');
      const result = await call(p1);
      return res.status(200).json({ phase: 1, ...result });
    }

    if (phase === 2) {
      const p2 = info + '\n\n' + [
        'הפעל STRATEGY_ENGINE ו-PROMPT_PROFESSIONAL_ANALYSIS.',
        'החזר JSON בלבד עם השדות הבאים (מלא כל שדה בתוכן אמיתי):',
        '{',
        '"diagnostic_report": "דוח אבחון פנימי מלא: רקע כללי, מבנה משפחתי, מבנה נכסים, מטרות הלקוחות, אתגרים משפטיים ומיסויים, כיווני פתרון, מידע חסר, שלבים הבאים",',
        '"professional_analysis": "ניתוח מקצועי: מורכבויות משפטיות, מיסויות, משפחתיות, סיכונים, הזדמנויות, כלים משפטיים לבחינה",',
        '"strategic_alternatives": "3 חלופות לפי STRATEGY_ENGINE: שמרנית / ביניים / אקטיבית. לכל חלופה: מהות, כלים משפטיים, יתרונות, חסרונות, מידע נוסף נדרש",',
        '"tasks_client": "משימות ללקוח: רשימת מסמכים ונתונים להשלמה",',
        '"tasks_lawyer": "משימות לעוד: בדיקות מס, סימולציות, בדיקת מבנה בעלות, בחינת חלופות, כלים נדרשים",',
        '"questionnaire": "שאלון מותאם אישית לפגישת האבחון. פתיחה ידידותית. שאלות רלוונטיות בלבד: נכסים, משפחה, מסמכים קיימים, מטרות",',
        '"asset_map": "מפת נכסים משפחתית: מבנה משפחה, רשימת נכסים עם בעלות ומידע חשוב, נקודות לתכנון, מידע חסר",',
        '"fee_proposal": "הצעת שכ"ט מפורטת ובביטחון: מצב A - צוואות 5000-8000+מעמ. מצב B - אבחון 3000-5000+מעמ + תהליך מלא 30000-50000+מעמ בשלושה שלבים. שלב האבחון מקוזז. הדגש ערך"',
        '}',
      ].join('\n');
      const result = await call(p2);
      return res.status(200).json({ phase: 2, ...result });
    }

    return res.status(400).json({ error: 'invalid phase' });
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
