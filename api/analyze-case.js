module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({error:'ANTHROPIC_API_KEY not set'});
 
  const {caseData:c} = req.body;
  if (!c) return res.status(400).json({error:'Missing data'});
 
  const sys = 'אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית.\n' +
    'הלקוח כבר אישר התקשרות והחזיר שאלון/מסמכים. בצע ניתוח מלא ומקצועי.\n' +
    'INTERGENERATIONAL_CASE_CLASSIFIER + STRATEGY_ENGINE + PROMPT_PROFESSIONAL_ANALYSIS.\n' +
    'אין להמציא מידע. ציין מידע חסר. שפה מקצועית. כל הפלט בעברית.';
 
  const info = 'לקוח: ' + c.client_name + '\n' +
    'סוג תיק: ' + (c.case_type||'תכנון בין-דורי') + '\n' +
    'שכ"ט: ' + (c.fee ? c.fee+' ש"ח' : 'לא צוין') + '\n\n' +
    'מידע מהשיחה ומהשאלון:\n' + (c.notes||'אין') +
    (c.questionnaire_data ? '\n\nנתוני שאלון:\n'+c.questionnaire_data : '');
 
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001',
        max_tokens:4000,
        system:sys,
        messages:[{role:'user',content:info+'\n\nהפק JSON בלבד עם ניתוח מלא ומפורט:\n'+
          '{"diagnostic_report":"דוח אבחון מקצועי מלא: רקע, מבנה משפחתי, מבנה נכסים, מטרות, אתגרים משפטיים ומיסויים, כיווני פתרון, מידע חסר, שלבים הבאים",'+
          '"professional_analysis":"ניתוח מקצועי מעמיק: מורכבויות משפטיות/מיסויות/משפחתיות, סיכונים, הזדמנויות, כלים לבחינה",'+
          '"strategic_alternatives":"3 חלופות מלאות: שמרנית/ביניים/אקטיבית. לכל: מהות, כלים, יתרונות, חסרונות, מידע נדרש",'+
          '"tasks_client":"משימות ללקוח: מסמכים, נתונים, פעולות נדרשות",'+
          '"tasks_lawyer":"משימות לעו\"ד: בדיקות מס, סימולציות, ניסוח מסמכים",'+
          '"questionnaire":"שאלון השלמה אם נדרש: שאלות רלוונטיות בלבד",'+
          '"asset_map":"מפת נכסים: מבנה משפחה, נכסים עם בעלות/ערך, נקודות לתכנון",'+
          '"fee_proposal":"הצעת שכ\"ט: אבחון 5,000+מעמ, תהליך מלא 30,000-50,000+מעמ, שלושה שלבים, שלב א מקוזז"}'}],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('API '+r.status+': '+(d.error?.message||'unknown'));
    const text = (d.content?.[0]?.text||'');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json: '+text.substring(0,200));
    return res.status(200).json(JSON.parse(m[0]));
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({error:e.message});
  }
}
