module.exports = async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = 'https://ernst-law-ten.vercel.app/api/gcal-callback';

  try {
    // Exchange code for tokens
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await r.json();
    if (!tokens.access_token) return res.status(400).send('Failed to get tokens: ' + JSON.stringify(tokens));

    // Store tokens in Supabase via redirect with tokens in URL fragment
    const tokenData = encodeURIComponent(JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in * 1000),
    }));
    res.redirect(`https://ernst-law-ten.vercel.app/ernst-law-v3.html#gcal_tokens=${tokenData}`);
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
}
