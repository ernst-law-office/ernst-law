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
          model: 'claude-sonnet-4-6', max_tokens: 1500,
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

  const sys = 'אתה סוכן AI פנימי של משרד עו"ד המתמחה בתכנון העברה בין-דורית.\n' +
    'כללים: אל תוסיף מידע שלא נמסר. ציין מידע חסר במפורש. שפה פנימית מקצועית, ללקוח ברורה.\n' +
    'הבחן בין שירות נקודתי (צוואה/יפו"כ) = מצב A, לתכנון בין-דורי מלא = מצב B.\n' +
    'INTERGENERATIONAL_CASE_CLASSIFIER: סווג משפחה, נכסים, מורכבות משפטית ומיסויית.\n' +
    'STRATEGY_ENGINE: 3 חלופות שמרנית/ביניים/אקטיבית עם כלים משפטיים.\n' +
    'תמחור: אבחון 3000-5000+מעמ, מלא 30000-50000+מעמ, צוואות 5000-8000+מעמ. הצג בביטחון.\n' +
    'כל הפלט בעברית בלבד.';

  const info = 'לקוח: ' + c.client_name + '\n' +
    'סוג תיק: ' + (c.case_type||'תכנון בין-דורי') + '\n' +
    'שכ"ט: ' + (c.fee_potential ? String(c.fee_potential) : 'לא צוין') + '\n' +
    'סיכום שיחה:\n' + (c.notes||c.transcript||'אין');

  const p1fields = [
    'summary: תקציר מנהלים (מבנה משפחתי/נכסים/מטרות/אתגרים/עלויות/מידע חסר/המלצה)',
    'recommendation: המלצה קצרה במשפט אחד',
    'complexity_level: נמוכה/בינונית/גבוהה/גבוהה מאוד',
    'fee_potential_suggestion: מספר בשקלים',
    'seriousness_level: 1-5',
    'closing_probability: 0-100',
    'suggested_followup_days: 7/14/21',
    'case_classification: סיווג INTERGENERATIONAL_CASE_CLASSIFIER (מצב A/B, משפחה, נכסים, מורכבויות)',
    'client_summary: סיכום ידידותי 4-5 שורות לא משפטי',
    'ai_email_draft: מייל ללקוח 6-8 שורות (מצב A: צוואות+עלות. מצב B: אבחון+עלות+נתונים)',
    'ai_call_reminder: מייל פולואפ 5 שורות ידידותי',
  ].join('\n');

  const p2fields = [
    'diagnostic_report: דוח אבחון פנימי (רקע/משפחה/נכסים/מטרות/אתגרים/כיווני פתרון/מידע חסר/שלבים הבאים)',
    'professional_analysis: ניתוח מקצועי (מורכבויות משפטיות/מיסויות/משפחתיות, סיכונים, הזדמנויות, כלים)',
    'strategic_alternatives: 3 חלופות STRATEGY_ENGINE (שמרנית/ביניים/אקטיבית - מהות/כלים/יתרונות/חסרונות)',
    'tasks_client: משימות ללקוח (מסמכים/נתונים)',
    'tasks_lawyer: משימות לעו"ד (בדיקות מס/סימולציות/חלופות)',
    'questionnaire: שאלון מותאם (נכסים/משפחה/מסמכים קיימים/מטרות)',
    'asset_map: מפת נכסים (משפחה + נכסים עם בעלות + נקודות לתכנון)',
    'fee_proposal: הצעת שכ"ט מפורטת (אבחון/תהליך/שלבים/קיזוז)',
  ].join('\n');

  const call = async (prompt) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: sys,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'API error ' + r.status);
    const text = d.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json. got: ' + text.substring(0,200));
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase === 1) {
      const prompt = info + '\n\nהחזר JSON בלבד עם השדות הבאים:\n' + p1fields;
      const result = await call(prompt);
      return res.status(200).json({phase:1, ...result});
    }
    if (phase === 2) {
      const prompt = info + '\n\nהחזר JSON בלבד עם השדות הבאים:\n' + p2fields;
      const result = await call(prompt);
      return res.status(200).json({phase:2, ...result});
    }
    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('analyze error:', e.message);
    return res.status(500).json({error: e.message});
  }
}
