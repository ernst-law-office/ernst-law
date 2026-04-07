module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Debug: check env
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
          model: 'claude-sonnet-4-20250514', max_tokens: 1500,
          messages: [{ role: 'user', content: 'ערוך: ' + currentText + '\nהוראה: ' + instruction + '\nהחזר JSON: {"edited_text":"..."}' }],
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

  const sys = 'אתה סוכן AI של משרד עו"ד לתכנון העברה בין-דורית. ' +
    'אל תוסיף מידע שלא נמסר. ציין מידע חסר. שפה פנימית מקצועית, ללקוח ברורה. ' +
    'מצב A = שירות נקודתי (צוואה). מצב B = תכנון בין-דורי מלא. ' +
    'תמחור: אבחון 3000-5000+מעמ, מלא 30000-50000+מעמ. הכל בעברית.';

  const info = 'לקוח: ' + c.client_name +
    '\nסוג: ' + (c.case_type||'תכנון בין-דורי') +
    '\nשכ"ט: ' + (c.fee_potential||'לא צוין') +
    '\nסיכום שיחה:\n' + (c.notes||c.transcript||'אין');

  const call = async (userMsg) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: sys,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('API ' + r.status + ': ' + JSON.stringify(d.error));
    const text = d.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json: ' + text.substring(0,300));
    return JSON.parse(m[0]);
  };

  try {
    if (!phase || phase === 1) {
      const result = await call(
        info + '\n\nהחזר JSON בלבד:\n' +
        '{"summary":"תקציר מנהלים",' +
        '"recommendation":"המלצה קצרה",' +
        '"complexity_level":"בינונית",' +
        '"fee_potential_suggestion":"0",' +
        '"seriousness_level":"3",' +
        '"closing_probability":"50",' +
        '"suggested_followup_days":"7",' +
        '"case_classification":"סיווג: מצב A/B, משפחה, נכסים, מורכבות",' +
        '"client_summary":"סיכום ידידותי ללקוח",' +
        '"ai_email_draft":"מייל ללקוח 6-8 שורות",' +
        '"ai_call_reminder":"מייל פולואפ קצר"}'
      );
      return res.status(200).json({phase:1, ...result});
    }
    if (phase === 2) {
      const result = await call(
        info + '\n\nהחזר JSON בלבד:\n' +
        '{"diagnostic_report":"דוח אבחון פנימי",' +
        '"professional_analysis":"ניתוח מקצועי",' +
        '"strategic_alternatives":"3 חלופות",' +
        '"tasks_client":"משימות ללקוח",' +
        '"tasks_lawyer":"משימות לעו\"ד",' +
        '"questionnaire":"שאלון מותאם",' +
        '"asset_map":"מפת נכסים",' +
        '"fee_proposal":"הצעת שכ\"ט מפורטת"}'
      );
      return res.status(200).json({phase:2, ...result});
    }
    return res.status(400).json({error:'invalid phase'});
  } catch(e) {
    console.error('ERROR:', e.message);
    return res.status(500).json({error: e.message});
  }
}
