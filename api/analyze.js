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
      body: JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2000,system:sys,messages:[{role:'user',content:msg}]}),
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

החזר JSON בלבד. זהה מצב A (צוואות) או מצב B (תכנון בין-דורי):
{"summary":"תקציר: מבנה משפחתי, נכסים, מטרות, אתגרים, מידע חסר, המלצה","recommendation":"פעולה הבאה במשפט אחד","complexity_level":"נמוכה/בינונית/גבוהה","fee_potential_suggestion":"0","seriousness_level":"3","closing_probability":"50","suggested_followup_days":"7","case_classification":"סיווג: סוג משפחה, נכסים, מורכבות משפטית, מורכבות מיסויית, מצב A/B, מידע חסר","client_summary":"סיכום ידידותי 4-5 שורות: תודה, עיקרי הדברים, מטרות, המשך. שפה פשוטה","ai_email_draft":"מייל מצב A: סיכום+עלות צוואות 5000-8000+מעמ. מצב B: סיכום+אבחון 3000-5000+מעמ+נתונים נדרשים+תאריך. 6-8 שורות","ai_call_reminder":"מייל פולואפ 5 שורות ידידותי"}`);
      return res.status(200).json({phase:1,...result});
    }

    if (phase===2) {
      const result = await call(info + `

החזר JSON בלבד עם STRATEGY_ENGINE ו-PROMPT_PROFESSIONAL_ANALYSIS:
{"diagnostic_report":"דוח אבחון פנימי: רקע, מבנה משפחתי, נכסים, מטרות, אתגרים משפטיים ומיסויים, כיווני פתרון, מידע חסר, שלבים הבאים","professional_analysis":"ניתוח מקצועי: מורכבויות (משפטית/מיסויית/משפחתית), סיכונים, הזדמנויות, כלים לבחינה","strategic_alternatives":"3 חלופות: שמרנית/ביניים/אקטיבית. לכל: מהות, כלים, יתרונות, חסרונות","tasks_client":"משימות ללקוח: מסמכים ונתונים להשלמה","tasks_lawyer":"משימות לעו\"ד: בדיקות מס, סימולציות, בחינת חלופות","questionnaire":"שאלון מותאם: נכסים (סוג/עיר/שנה/אופן/שווי/משכנתא), מידע משפחתי, מסמכים קיימים, מטרות","asset_map":"מפת נכסים: מבנה משפחה + נכסים עם בעלות + נקודות לתכנון","fee_proposal":"אבחון: 3000-5000+מעמ. תהליך מלא: 30000-50000+מעמ. שלבים: א)אבחון ב)תשתית ג)יישום. שלב א מקוזז"}`);
      return res.status(200).json({phase:2,...result});
    }

    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('analyze error:', e.message);
    return res.status(500).json({error:e.message});
  }
}
