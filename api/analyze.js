module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({error:'ANTHROPIC_API_KEY not set'});

  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
          messages: [{ role: 'user', content: 'ערוך:\n' + currentText + '\nהוראה: ' + instruction + '\nJSON בלבד: {"edited_text":"..."}' }],
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

  const sys = 'אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית של נכסים במשפחה.\n\n' +
    'AGENT_INSTRUCTIONS:\n' +
    'כאשר מוזן סיכום שיחה תנתח ותפיק תוצרים מפורטים ומקצועיים. אין להוסיף מידע שלא נמסר. אם מידע חסר - ציין במפורש. ' +
    'שפה פנימית: מקצועית ומדויקת. שפה ללקוח: ברורה, מכבדת, לא משפטית. ' +
    'הבחן בין מצב A (שירות נקודתי: צוואה/יפו"כ בלבד) למצב B (תכנון בין-דורי מלא).\n\n' +
    'INTERGENERATIONAL_CASE_CLASSIFIER:\n' +
    'סווג סוג משפחה: זוג עם ילדים בגירים, קטינים, ילדים מנישואים קודמים, פערים כלכליים, נכסים בחול, עסק משפחתי, חשש לקונפליקט.\n' +
    'סווג נכסים: דירה יחידה, מספר דירות, נכסים מושכרים, קרקע/ירושה/מתנה, פיננסיים, זכויות בנייה/פינוי-בינוי, עסק/חברה, נכסים בחול.\n' +
    'מורכבות משפטית (נמוכה/בינונית/גבוהה): לפי מספר נכסים, יורשים, חלוקה לא שוויונית, נישואים שניים, חול.\n' +
    'מורכבות מיסויית (נמוכה/בינונית/גבוהה): לפי שבח, מס רכישה, מספר נכסים, נכסים מושכרים, ירושות, חול.\n\n' +
    'STRATEGY_ENGINE:\n' +
    'הצע 3 חלופות תכנון. לכל חלופה: מהות, כלים משפטיים, מתי עדיפה, יתרונות, חסרונות, מידע נוסף נדרש.\n' +
    'כלים: צוואה, צוואה הדדית, יפו"כ מתמשך, הסכם מתנה, הסכם הלוואה, הסכם משפחתי, מנגנוני איזון, נאמנות, תכנון מס מקרקעין.\n\n' +
    'PROMPT_FEE_PROPOSAL:\n' +
    'מצב A - צוואות: 5,000-8,000 ש"ח + מעמ. ' +
    'מצב B - פגישת אבחון: 3,000-5,000 ש"ח + מעמ (מיפוי/סימולציות/חלופות). תהליך מלא: 30,000-50,000 ש"ח + מעמ. ' +
    'שלבים: א) אבחון ותכנון ב) בניית תשתית משפטית ג) יישום. עלות שלב א מקוזזת אם ממשיכים. ' +
    'הצג בביטחון, הדגש ערך, אל תתנצל.\n\n' +
    'חשוב: כתוב תשובות מפורטות ומקיפות לכל שדה. אל תתמצת יתר על המידה. כל הפלט בעברית בלבד.';

  const info = 'לקוח: ' + c.client_name + '\n' +
    'סוג תיק: ' + (c.case_type||'תכנון בין-דורי') + '\n' +
    'תאריך שיחה: ' + (c.date||'לא צוין') + '\n' +
    'שכ"ט שעלה בשיחה: ' + (c.fee_potential ? c.fee_potential + ' ש"ח' : 'לא צוין') + '\n' +
    'סיכום השיחה:\n' + (c.notes||c.transcript||'אין');

  const call = async (msg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:'claude-haiku-4-5-20251001', max_tokens:4000, system:sys, messages:[{role:'user',content:msg}]}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('API ' + r.status + ': ' + (d.error?.message||JSON.stringify(d)));
    const text = (d.content?.[0]?.text||'');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json: ' + text.substring(0,300));
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase===1) {
      const prompt = info + '\n\n' +
        'הפעל INTERGENERATIONAL_CASE_CLASSIFIER. זהה מצב A או B.\n' +
        'כתוב תשובות מפורטות ומקצועיות - לא מתומצתות.\n' +
        'החזר JSON בלבד:\n' +
        '{\n' +
        '"summary": "תקציר מנהלים מפורט: פסקת רקע כללי | מבנה משפחתי מפורט | מבנה נכסים מפורט | מטרות הלקוח | סוגיות ואתגרים מרכזיים | עלויות שעלו בשיחה | המלצה להמשך | מידע חסר",\n' +
        '"recommendation": "המלצה לפעולה הבאה - ברורה ומנומקת",\n' +
        '"complexity_level": "נמוכה / בינונית / גבוהה / גבוהה מאוד",\n' +
        '"fee_potential_suggestion": "סכום ריאלי בשקלים",\n' +
        '"seriousness_level": "1-5",\n' +
        '"closing_probability": "0-100",\n' +
        '"suggested_followup_days": "7 / 14 / 21",\n' +
        '"case_classification": "סיווג מפורט: מצב A/B עם נימוק | סוג משפחה מפורט | סוג נכסים מפורט | מורכבות משפטית עם נימוק | מורכבות מיסויית עם נימוק | מידע חסר",\n' +
        '"client_summary": "סיכום מפורט ללקוח: פתיחה-תודה | עיקרי הדברים שעלו | המטרות המרכזיות | הנושאים לבחינה | ציון תהליך המשך. שפה פשוטה וברורה",\n' +
        '"ai_email_draft": "מייל מלא ללקוח לפי מצב A/B: שורת פתיחה | סיכום השיחה בכותרות | המשך תהליך עם הסבר ברור | עלויות מפורטות | רשימת נתונים נדרשים | תאריך/מועדים מוצעים | חתימה. 8-12 שורות מלאות",\n' +
        '"ai_call_reminder": "מייל פולואפ מלא: פנייה, תזכורת ערך, בקשה להשלמת מידע, הצעת סיוע. 6-8 שורות"\n' +
        '}';
      const result = await call(prompt);
      return res.status(200).json({phase:1,...result});
    }

    if (phase===2) {
      const prompt = info + '\n\n' +
        'הפעל STRATEGY_ENGINE ו-PROMPT_PROFESSIONAL_ANALYSIS.\n' +
        'כתוב תשובות מפורטות ומקצועיות - כמו דוח מקצועי אמיתי.\n' +
        'החזר JSON בלבד:\n' +
        '{\n' +
        '"diagnostic_report": "דוח אבחון מקצועי מלא לשימוש פנימי: רקע כללי | מבנה משפחתי | מבנה נכסים מפורט | מטרות הלקוחות | אתגרים משפטיים | אתגרים מיסויים | כיווני פתרון | מידע חסר להשלמת אבחון | שלבים הבאים",\n' +
        '"professional_analysis": "ניתוח מקצועי מעמיק: מורכבויות משפטיות | מורכבויות מיסויות | מורכבויות משפחתיות | סיכונים ספציפיים | הזדמנויות תכנון | כלים משפטיים לבחינה עם הסבר לכל אחד",\n' +
        '"strategic_alternatives": "3 חלופות לפי STRATEGY_ENGINE: חלופה שמרנית (מהות+כלים+יתרונות+חסרונות) | חלופת ביניים (מהות+כלים+יתרונות+חסרונות) | חלופה אקטיבית (מהות+כלים+יתרונות+חסרונות) | מידע נוסף נדרש לכל חלופה",\n' +
        '"tasks_client": "משימות מפורטות ללקוח: מסמכים נדרשים לכל נכס | מידע משפחתי | מסמכים קיימים | נתונים פיננסיים | לוח זמנים מוצע",\n' +
        '"tasks_lawyer": "משימות מקצועיות מפורטות לעוד: בדיקות מס ספציפיות | סימולציות נדרשות | בדיקת מבנה בעלות | בחינת כל חלופה | מסמכים לניסוח",\n' +
        '"questionnaire": "שאלון מלא ומותאם אישית: פתיחה ידידותית | שאלות על כל נכס שעלה | מידע משפחתי רלוונטי | מסמכים קיימים | נכסים פיננסיים | מטרות והעדפות | סיום ידידותי",\n' +
        '"asset_map": "מפת נכסים מלאה: מבנה משפחה (בני זוג/ילדים/נכדים) | רשימת נכסים מפורטת (סוג/בעלות/ערך/הערות) | נכסים פיננסיים | נקודות מרכזיות לתכנון | מידע חסר",\n' +
        '"fee_proposal": "הצעת שכ"ט מפורטת ובביטחון: הצגת ערך | מצב A - צוואות עם עלות | מצב B - שלב אבחון עם עלות ומה כולל | שלב תכנון מלא עם עלות ושלושה שלבים | קיזוז שלב אבחון | קריאה לפעולה"\n' +
        '}';
      const result = await call(prompt);
      return res.status(200).json({phase:2,...result});
    }

    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({error:e.message});
  }
}
