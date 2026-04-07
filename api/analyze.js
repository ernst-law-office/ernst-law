module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({error:'no key'});

  if (req.body.editMode) {
    const {currentText,instruction,clientName}=req.body;
    try {
      const r=await fetch('https://api.anthropic.com/v1/messages',{
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

  const sys=[
    'אתה סוכן AI פנימי של משרד עורכי דין המתמחה בתכנון העברה בין-דורית.',
    '',
    'כללים: אין להוסיף מידע שלא נמסר. מידע חסר - ציין תחת "מידע חסר". אין לכלול ת"ז/חשבונות/כתובות.',
    'שפה פנימית: מקצועית. שפה ללקוח: ברורה, לא משפטית.',
    '',
    'זהה מצב A (שירות נקודתי: צוואה/יפוכ) או מצב B (תכנון בין-דורי מלא).',
    '',
    'INTERGENERATIONAL_CASE_CLASSIFIER:',
    'סווג: סוג משפחה, סוג נכסים, מורכבות משפטית (נמוכה/בינונית/גבוהה), מורכבות מיסויית (נמוכה/בינונית/גבוהה).',
    '',
    'STRATEGY_ENGINE:',
    'הצע 3 חלופות: שמרנית, ביניים, אקטיבית. לכל אחת: מהות, כלים משפטיים, יתרונות, חסרונות.',
    'כלים: צוואה, צוואה הדדית, יפוכ מתמשך, הסכם מתנה, הסכם הלוואה, הסכם משפחתי, מנגנוני איזון, נאמנות.',
    '',
    'תמחור (הצג בביטחון ללא התנצלות):',
    'מצב A: חבילת צוואות+יפוכ עם הנחה 10%. אם רלוונטי - הצע תכנון מס.',
    'מצב B: פגישת אבחון 5000 ש"ח + מעמ. תהליך מלא 30000-50000 ש"ח + מעמ. שלב א מקוזז.',
    '',
    'כתוב תשובות מפורטות ומקצועיות. הכל בעברית.',
  ].join('\n');

  const info=[
    'לקוח: '+c.client_name,
    'סוג תיק: '+(c.case_type||'תכנון בין-דורי'),
    'תאריך: '+(c.date||'לא צוין'),
    'עלות שעלתה: '+(c.fee_potential||'לא צוין'),
    '',
    'סיכום השיחה:',
    (c.notes||c.transcript||'אין'),
  ].join('\n');

  const p1keys={
    summary:'תקציר מנהלים מלא: עיקרי השיחה, מבנה משפחתי, מבנה נכסים, מטרות, סיכונים, המלצה, עלויות, מועדים, מידע חסר',
    recommendation:'המלצה ברורה ומנומקת לפעולה הבאה',
    complexity_level:'נמוכה / בינונית / גבוהה / גבוהה מאוד',
    fee_potential_suggestion:'סכום ריאלי בשקלים',
    seriousness_level:'1-5',
    closing_probability:'0-100',
    suggested_followup_days:'7 / 14 / 21',
    case_classification:'סיווג INTERGENERATIONAL_CASE_CLASSIFIER מפורט: מצב A/B, סוג משפחה, נכסים, מורכבות משפטית+נימוק, מורכבות מיסויית+נימוק, מידע חסר',
    client_summary:'סיכום ידידותי מלא ללקוח: תודה, עיקרי הדברים, מטרות, נושאים לבחינה, מה מחכה לו. שפה פשוטה',
    ai_email_draft:'מייל מלא ללקוח 10-14 שורות: תודה, סיכום בכותרות, הכנה לפגישה, מסמכים נדרשים, עלות אבחון וערך התהליך, תאריך מוצע',
    ai_call_reminder:'מייל פולואפ 6-8 שורות: פנייה ידידותית, תזכורת ערך, בקשת השלמת מידע',
  };

  const p2keys={
    diagnostic_report:'אבחון שיחה פנימי מפורט: מוקד לשימור, מוקד לשיפור, המלצה לקראת סגירה, הערכת רמת תיק, הסתברות סגירה, פעולה הבאה',
    professional_analysis:'ניתוח מקצועי מעמיק: מורכבויות משפטיות, מיסויות, משפחתיות, סיכונים ספציפיים, הזדמנויות, כלים משפטיים לבחינה',
    strategic_alternatives:'3 חלופות STRATEGY_ENGINE מפורטות: שמרנית (מהות+כלים+יתרונות+חסרונות) | ביניים (מהות+כלים+יתרונות+חסרונות) | אקטיבית (מהות+כלים+יתרונות+חסרונות)',
    tasks_client:'משימות מפורטות ללקוח: מסמכים לכל נכס, מידע משפחתי, מסמכים קיימים, נתונים פיננסיים',
    tasks_lawyer:'משימות מקצועיות לעורך הדין: בדיקות מס, סימולציות, בדיקת מבנה בעלות, בחינת חלופות, מסמכים לניסוח',
    questionnaire:'שאלון מותאם אישית: פתיחה ידידותית, שאלות לכל נכס שעלה, מידע משפחתי, מסמכים קיימים, נכסים פיננסיים, מטרות, סיום ידידותי',
    asset_map:'מפת נכסים משפחתית: מבנה משפחה, רשימת נכסים עם בעלות וערך, נכסים פיננסיים, עסקים, נקודות לתכנון, מידע חסר',
    fee_proposal:'הצעת שכר טרחה מלאה: הצגת ערך | מצב A: חבילת צוואות+יפוכ הנחה 10%+תכנון מס | מצב B: אבחון 5000+מעמ מה כולל + תהליך מלא 30000-50000+מעמ 3 שלבים + קיזוז שלב א | קריאה לפעולה',
  };

  const buildPrompt=(keys)=>{
    const lines=['החזר JSON בלבד עם השדות הבאים. כל שדה - תשובה מפורטת ומקצועית:','{'];
    const entries=Object.entries(keys);
    entries.forEach(([k,v],i)=>{
      lines.push('  "'+k+'": "'+v+'"'+(i<entries.length-1?',':''));
    });
    lines.push('}');
    return lines.join('\n');
  };

  const callAPI=async(msg)=>{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:4000,system:sys,messages:[{role:'user',content:msg}]}),
    });
    const d=await r.json();
    if(!r.ok) throw new Error('API '+r.status+': '+(d.error?.message||'unknown'));
    const text=(d.content?.[0]?.text||'');
    const m=text.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('no json: '+text.substring(0,200));
    return JSON.parse(m[0]);
  };

  try {
    if(!phase||phase===1){
      const result=await callAPI(info+'\n\nזהה מצב A/B. הפק תוצרי חובה לפי הוראות המערכת.\n\n'+buildPrompt(p1keys));
      return res.status(200).json({phase:1,...result});
    }
    if(phase===2){
      const result=await callAPI(info+'\n\nהפעל STRATEGY_ENGINE ומערכת האבחון הראשית.\n\n'+buildPrompt(p2keys));
      return res.status(200).json({phase:2,...result});
    }
    return res.status(400).json({error:'invalid phase'});
  } catch(e){
    console.error('ERROR:',e.message);
    return res.status(500).json({error:e.message});
  }
}
