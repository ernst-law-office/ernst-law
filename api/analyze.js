module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Edit mode
  if (req.body.editMode) {
    const { currentText, instruction, clientName } = req.body;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 2000,
          messages: [{ role: 'user', content: 'ערוך את הטקסט לפי ההוראה.\nלקוח: ' + clientName + '\nטקסט: ' + currentText + '\nהוראה: ' + instruction + '\nהחזר JSON בלבד: {"edited_text":"..."}' }],
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

  // Full system prompt from all project files
  const sys = `אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית של נכסים.

AGENT_INSTRUCTIONS:
- מטרתך לנתח שיחות ייעוץ, לזהות סיכונים, להציע חלופות ולהפיק מסמכים מקצועיים.
- אין להוסיף מידע שלא נאמר בשיחה. אם מידע חסר – ציין במפורש תחת "מידע חסר / טעון השלמה".
- אין לכלול במסמכים חיצוניים: ת"ז, מספרי חשבון, כתובות מדויקות.
- שפה פנימית: מקצועית, מדויקת, תמציתית. שפה ללקוח: ברורה, מכבדת, לא משפטית מדי.
- הבחן תמיד בין: שירות נקודתי (צוואה/יפו"כ) לבין תהליך תכנון בין-דורי מלא.

INTERGENERATIONAL_CASE_CLASSIFIER:
- סווג סוג המשפחה: זוג עם ילדים בגירים/קטינים, נישואים שניים, פערים כלכליים, נכסים בחו"ל, עסק משפחתי.
- סווג סוג הנכסים: דירת מגורים יחידה, מספר דירות, נכסים מושכרים, קרקע/ירושה, נכסים פיננסיים, זכויות בנייה/פינוי-בינוי.
- הערך מורכבות משפטית: נמוכה/בינונית/גבוהה (לפי: מספר נכסים, מספר יורשים, חלוקה לא שוויונית, נישואים שניים, חו"ל).
- הערך מורכבות מיסויית: נמוכה/בינונית/גבוהה (לפי: מספר נכסי מקרקעין, שבח, מס רכישה, נכסים מושכרים, ירושות).

STRATEGY_ENGINE:
- זהה מטרות: שוויון, חיסכון מס, שליטה, מניעת קונפליקט, שמירת נכסים במשפחה, הגנה מבני זוג של ילדים.
- זהה אילוצים: מידע חסר, פערי שווי, ילדים שקיבלו כסף/נכסים, רגישות משפחתית, צוואה הדדית.
- הצע 3 חלופות: שמרנית / ביניים / אקטיבית. לכל אחת: מהות, כלים משפטיים, יתרונות, חסרונות, מידע נוסף נדרש.

כלים משפטיים לציון כשרלוונטיים: צוואה, צוואה הדדית, יפו"כ מתמשך, הסכם מתנה, הסכם הלוואה, הסכם משפחתי, מנגנוני איזון, נאמנות, תכנון מס מקרקעין.

תמחור (הצג בביטחון, ללא התנצלות):
- פגישת אבחון: 3,000-5,000 ש"ח + מעמ (מיפוי, סימולציות, חלופות).
- תהליך תכנון מלא: 30,000-50,000 ש"ח + מעמ (תלוי מורכבות).
- שירות נקודתי (צוואות): 5,000-8,000 ש"ח + מעמ.
- עלות שלב האבחון מקוזזת אם ממשיכים לתהליך מלא.

כל הפלט בעברית בלבד.`;

  const info = 'לקוח: ' + c.client_name +
    '\nסוג תיק: ' + (c.case_type||'תכנון בין-דורי') +
    '\nתאריך שיחה: ' + (c.date||'לא צוין') +
    '\nשכ"ט שעלה: ' + (c.fee_potential ? '₪'+c.fee_potential.toLocaleString() : 'לא צוין') +
    '\nסיכום השיחה:\n' + (c.notes||c.transcript||'אין');

  const call = async (msg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4000,system:sys,messages:[{role:'user',content:msg}]}),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message||'API error '+r.status);
    const m = (d.content?.[0]?.text||'').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json in response');
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase===1) {
      const result = await call(info + `

הפעל INTERGENERATIONAL_CASE_CLASSIFIER. זהה האם מצב A (שירות נקודתי - צוואות) או מצב B (תכנון בין-דורי מלא).

החזר JSON בלבד עם השדות הבאים (כל ערך מחרוזת בעברית):
{
"summary": "תקציר מנהלים: רקע כללי, מבנה משפחתי, מבנה נכסים, מטרות הלקוח, סוגיות ואתגרים מרכזיים, עלויות שעלו בשיחה, המלצה להמשך, מידע חסר",
"recommendation": "המלצה לפעולה הבאה במשפט אחד",
"complexity_level": "נמוכה",
"fee_potential_suggestion": "0",
"seriousness_level": "3",
"closing_probability": "50",
"suggested_followup_days": "7",
"case_classification": "סיווג לפי INTERGENERATIONAL_CASE_CLASSIFIER: סוג המשפחה, סוג הנכסים, מורכבות משפטית, מורכבות מיסויית, סוג התיק (A/B), מידע חסר",
"client_summary": "סיכום ידידותי ללקוח: תודה על הפגישה, עיקרי הדברים, מטרות המשפחה, נושאים לבחינה. שפה פשוטה לא משפטית",
"ai_email_draft": "מייל ללקוח לפי מצב A או B. מצב A: סיכום, עלות צוואות 5000-8000+מעמ, הצעת ערך. מצב B: סיכום, הסבר פגישת אבחון 3000-5000+מעמ ומטרתה (מיפוי/סימולציות/חלופות), רשימת נתונים נדרשים, תאריך מוצע/הצעת מועדים. 6-8 שורות, שפה מקצועית לא משפטית",
"ai_call_reminder": "מייל פולואפ קצר אם הלקוח לא השלים נתונים. 5-7 שורות ידידותי עם תזכורת ערך"
}`);
      return res.status(200).json({phase:1,...result});
    }

    if (phase===2) {
      const result = await call(info + `

הפעל STRATEGY_ENGINE ו-PROMPT_PROFESSIONAL_ANALYSIS.

החזר JSON בלבד עם השדות הבאים (כל ערך מחרוזת בעברית):
{
"diagnostic_report": "דוח אבחון מקצועי פנימי (AGENT_INSTRUCTIONS שלב 2): רקע כללי, מבנה משפחתי, מבנה נכסים, מטרות הלקוחות, אתגרים משפטיים ומיסויים, כיווני פתרון, מידע חסר, שלבים הבאים. מקצועי ותמציתי",
"professional_analysis": "ניתוח מקצועי (PROMPT_PROFESSIONAL_ANALYSIS): מורכבויות משפטיות, מורכבויות מיסויות, מורכבויות משפחתיות, סיכונים, הזדמנויות, כלים משפטיים לבחינה. אין לקבוע מסקנות סופיות",
"strategic_alternatives": "3 חלופות (STRATEGY_ENGINE): חלופה שמרנית, חלופת ביניים, חלופה אקטיבית. לכל אחת: מהות, כלים משפטיים, מתי עדיפה, יתרונות, חסרונות, מידע נוסף נדרש",
"tasks_client": "משימות להשלמה מצד הלקוח: מסמכים, נתונים, מידע חסר",
"tasks_lawyer": "משימות מקצועיות לעו\"ד: בדיקות מס, סימולציות, בדיקת מבנה בעלות, בחינת חלופות, בדיקת צורך בכלים משפטיים",
"questionnaire": "שאלון מותאם אישית לפגישת האבחון (פרומפט 4). פתיחה ידידותית. שאלות רלוונטיות בלבד על: נכסים (סוג/עיר/שנת רכישה/אופן קבלה/שווי/משכנתא/שכירות/שותפים), מידע משפחתי, מסמכים קיימים, נכסים פיננסיים, מטרות. ללא מידע רגיש",
"asset_map": "מפת נכסים משפחתית (Family Asset Map): מבנה משפחה (בני זוג, ילדים, נכדים), רשימת נכסים לכל אחד עם סוג/בעלות/מידע חשוב, נקודות מרכזיות לתכנון, מידע חסר",
"fee_proposal": "הצעת שכ\"ט (PROMPT_FEE_PROPOSAL_EMAIL): פגישת אבחון 3000-5000 ש\"ח + מעמ. תהליך מלא 30000-50000 ש\"ח + מעמ. שלושה שלבים: א) אבחון ותכנון ב) בניית תשתית משפטית ג) יישום. עלות שלב א מקוזזת. הצג בביטחון, הדגש ערך, ללא התנצלות"
}`);
      return res.status(200).json({phase:2,...result});
    }

    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('analyze error:', e.message);
    return res.status(500).json({error:e.message});
  }
}
