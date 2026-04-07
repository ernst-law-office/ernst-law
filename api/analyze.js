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

  const {consultData:c,phase}=req.body;
  if(!c) return res.status(400).json({error:'Missing data'});

  const SYSTEM = `אתה סוכן AI פנימי של משרד עורכי דין המתמחה בתכנון העברה בין-דורית של נכסים במשפחה.

הוראות מערכת:
המערכת משמשת לניהול, אבחון, סיווג, תיעוד וליווי תיקי תכנון העברה בין-דורית.
אין להוסיף מידע שלא נמסר. אם מידע חסר - ציין במפורש תחת "מידע חסר / טעון השלמה".
אין לכלול ת"ז, מספרי חשבון, כתובות מדויקות במסמכים חיצוניים.
שפה פנימית: מקצועית, מדויקת. שפה ללקוח: ברורה, מכבדת, לא משפטית.

הבחן בין:
- מצב A - שירות משפטי נקודתי: צוואה / יפו"כ / תכנון מס להעברת נכסים בלבד
- מצב B - תהליך תכנון בין-דורי: אבחון, סימולציות, מתווה פעולה, מסמכים ויישום

INTERGENERATIONAL_CASE_CLASSIFIER - סווג לפי:
סוג משפחה: זוג עם ילדים בגירים/קטינים/מנישואים קודמים, פערים כלכליים, נכסים בחו"ל, עסק משפחתי, חשש לקונפליקט.
סוג נכסים: דירה יחידה, מספר דירות, נכסים מושכרים, קרקע/ירושה/מתנה, פיננסיים, זכויות בנייה/פינוי-בינוי, עסק/חברה.
מורכבות משפטית (נמוכה/בינונית/גבוהה): לפי מספר נכסים, יורשים, חלוקה לא שוויונית, נישואים שניים, חו"ל.
מורכבות מיסויית (נמוכה/בינונית/גבוהה): לפי שבח, מס רכישה, נכסים מושכרים, ירושות, חו"ל.

STRATEGY_ENGINE - 3 חלופות תכנון:
חלופה שמרנית: שמירת שליטה, פחות פעולות מיידיות, הסדרה עתידית.
חלופת ביניים: שילוב פעולות בהווה עם הסדרה עתידית.
חלופה אקטיבית: פעולות מיידיות לחיסכון מיסויי ומניעת קונפליקט.
לכל חלופה: מהות, כלים משפטיים, יתרונות, חסרונות, מידע נדרש.
כלים: צוואה, צוואה הדדית, יפו"כ מתמשך, הסכם מתנה, הסכם הלוואה, הסכם משפחתי, מנגנוני איזון, נאמנות, תכנון מס מקרקעין.

כללי תמחור (הצג בביטחון, ללא התנצלות, עם חידוד ערך):
מצב A - צוואות: הצע חבילה משולבת צוואות + יפו"כ עם הנחה 10%. אם יש אפשרות תכנון מס - הצע חלופה.
מצב B - פגישת אבחון: 5,000 ש"ח + מעמ (מיפוי/סימולציות/חלופות).
מצב B - תהליך מלא: 30,000-50,000 ש"ח + מעמ (מתווה משפטי+מיסויי+מסמכים+יישום).
עלות שלב האבחון מקוזזת מהשכ"ט הכולל.

כתוב תשובות מפורטות ומקצועיות - לא תמציות קצרות. כל הפלט בעברית.`;

  const INFO = [
    'לקוח: ' + c.client_name,
    'סוג תיק: ' + (c.case_type||'תכנון בין-דורי'),
    'תאריך: ' + (c.date||'לא צוין'),
    'שכ"ט שעלה: ' + (c.fee_potential ? c.fee_potential+' ש"ח' : 'לא צוין'),
    '',
    'סיכום השיחה:',
    (c.notes||c.transcript||'אין'),
  ].join('\n');

  const callAPI = async (msg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4000,system:SYSTEM,messages:[{role:'user',content:msg}]}),
    });
    const d=await r.json();
    if(!r.ok) throw new Error('API '+r.status+': '+(d.error?.message||JSON.stringify(d)));
    const text=(d.content?.[0]?.text||'');
    const m=text.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('no json: '+text.substring(0,300));
    return JSON.parse(m[0]);
  };

  try {
    if (!phase||phase===1) {
      const msg = INFO + `

פעל לפי שלב ב של ה-Workflow: ניתוח שיחת ייעוץ/אבחון.
זהה מצב A (שירות נקודתי) או מצב B (תכנון בין-דורי).
הפק תוצרי חובה מפורטים לפי סעיף 4 בהוראות.

החזר JSON בלבד (ערכים מפורטים ומלאים - לא קצרים):
{
  "summary": "תקציר מנהלים מלא לפי סעיף 4.1: עיקרי השיחה | מבנה משפחתי | מבנה נכסים | מטרות הלקוח | סיכונים מרכזיים | המלצה להמשך | עלויות שעלו בשיחה | מועד/הצעת מועדים | מידע חסר",
  "recommendation": "המלצה ברורה ומנומקת לפעולה הבאה",
  "complexity_level": "נמוכה / בינונית / גבוהה / גבוהה מאוד",
  "fee_potential_suggestion": "סכום ריאלי בשקלים",
  "seriousness_level": "1-5",
  "closing_probability": "0-100",
  "suggested_followup_days": "7 / 14 / 21",
  "case_classification": "סיווג INTERGENERATIONAL_CASE_CLASSIFIER: מצב A/B | סוג משפחה | סוג נכסים | מורכבות משפטית + נימוק | מורכבות מיסויית + נימוק | מידע חסר",
  "client_summary": "סיכום ידידותי מלא ללקוח: תודה על הפגישה | עיקרי הדברים | מטרות המשפחה | נושאים לבחינה | מה מחכה לו. שפה פשוטה",
  "ai_email_draft": "מייל מלא לפי סעיף 4.2 ומצב A/B: תודה | סיכום בכותרות | הכנה לפגישה | מסמכים נדרשים | עלות אבחון וערך | תאריך/מועדים. 10-14 שורות מלאות",
  "ai_call_reminder": "מייל פולואפ מלא: פנייה | תזכורת ערך | בקשת השלמת מידע | הצעת סיוע. 6-8 שורות"
}`;
      const result = await callAPI(msg);
      return res.status(200).json({phase:1,...result});
    }

    if (phase===2) {
      const msg = INFO + `

פעל לפי STRATEGY_ENGINE ומערכת האבחון הראשית.
הפק תוצרי חובה מפורטים לפי סעיפים 4.3-4.5 בהוראות.

החזר JSON בלבד (ערכים מפורטים ומלאים - כמו דוחות מקצועיים אמיתיים):
{
  "diagnostic_report": "אבחון שיחה פנימי לפי סעיף 4.3: מוקד לשימור (מה נעשה נכון) | מוקד לשיפור (מה ניתן לשפר) | המלצה לפעולה לקראת סגירה | הערכת רמת התיק | הערכת הסתברות סגירה | הצעת פעולה הבאה",
  "professional_analysis": "ניתוח מקצועי מעמיק: מורכבויות משפטיות | מורכבויות מיסויות | מורכבויות משפחתיות | סיכונים ספציפיים | הזדמנויות תכנון | כלים משפטיים לבחינה עם הסבר",
  "strategic_alternatives": "3 חלופות STRATEGY_ENGINE מפורטות: חלופה שמרנית (מהות+כלים+יתרונות+חסרונות+מידע נדרש) | חלופת ביניים (מהות+כלים+יתרונות+חסרונות) | חלופה אקטיבית (מהות+כלים+יתרונות+חסרונות)",
  "tasks_client": "משימות מפורטות ללקוח לפי סעיף 4.5: מסמכים לכל נכס | מידע משפחתי | מסמכים קיימים | נתונים פיננסיים",
  "tasks_lawyer": "משימות מקצועיות מפורטות לעו\"ד: בדיקות מס ספציפיות | סימולציות | בדיקת מבנה בעלות | בחינת חלופות | מסמכים לניסוח",
  "questionnaire": "שאלון מותאם אישית לפי סעיף 4.4: פתיחה ידידותית | שאלות לכל נכס שעלה | מידע משפחתי | מסמכים קיימים | נכסים פיננסיים | מטרות והעדפות | סיום ידידותי",
  "asset_map": "מפת נכסים משפחתית מלאה: מבנה משפחה | נכסי מקרקעין (סוג/בעלות/ערך/הערות) | נכסים פיננסיים | עסקים | נקודות לתכנון | מידע חסר",
  "fee_proposal": "הצעת שכ\"ט מלאה לפי סעיף 5 ומצב A/B: הצגת ערך | מצב A: חבילת צוואות+יפו\"כ עם הנחה 10%+תכנון מס אם רלוונטי | מצב B: אבחון 5,000+מעמ (מה כולל) + תהליך מלא 30,000-50,000+מעמ (שלושה שלבים) + קיזוז שלב א | קריאה לפעולה"
}`;
      const result = await callAPI(msg);
      return res.status(200).json({phase:2,...result});
    }

    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({error:e.message});
  }
}
