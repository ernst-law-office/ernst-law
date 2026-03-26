module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, tokens, meeting } = req.body;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  // Refresh token if needed
  const getValidToken = async (tokens) => {
    if (Date.now() < tokens.expiry - 60000) return tokens.access_token;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }),
    });
    const data = await r.json();
    return data.access_token;
  };

  try {
    const accessToken = await getValidToken(tokens);

    // GET events from Google Calendar
    if (action === 'list') {
      const now = new Date().toISOString(); // from today
      const future = new Date(Date.now() + 90*86400000).toISOString(); // 90 days forward
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/office%40ernstadv.com/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime&maxResults=250`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await r.json();
      const events = (data.items || []).map(e => ({
        google_id: e.id,
        title: e.summary || 'פגישה',
        date: (e.start?.dateTime || e.start?.date || '').split('T')[0],
        time: e.start?.dateTime ? e.start.dateTime.split('T')[1].substring(0,5) : '',
        meet_link: e.hangoutLink || '',
        notes: e.description || '',
        type: 'consult',
        from_google: true,
      }));
      return res.status(200).json({ events });
    }

    // CREATE event in Google Calendar
    if (action === 'create') {
      const startDt = `${meeting.date}T${meeting.time || '10:00'}:00`;
      const endDt = `${meeting.date}T${String(parseInt((meeting.time||'10:00').split(':')[0]) + Math.floor((meeting.duration||60)/60)).padStart(2,'0')}:${(meeting.time||'10:00').split(':')[1]}:00`;
      const event = {
        summary: meeting.title || meeting.client_name || 'פגישה',
        description: meeting.notes || '',
        start: { dateTime: startDt, timeZone: 'Asia/Jerusalem' },
        end: { dateTime: endDt, timeZone: 'Asia/Jerusalem' },
        ...(meeting.meet_link ? {} : { conferenceData: { createRequest: { requestId: Date.now().toString() } } }),
      };
      const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/office%40ernstadv.com/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const data = await r.json();
      return res.status(200).json({ google_id: data.id, meet_link: data.hangoutLink || '' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
