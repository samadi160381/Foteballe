// Vercel serverless function — proxies requests to API-Football (api-sports.io)
// so the secret API key never reaches the browser.
//
// Setup: in your Vercel project → Settings → Environment Variables, add:
//   APIFOOTBALL_KEY = <your key from dashboard.api-football.com>
// Then redeploy.
//
// Usage from the client: /api/football?path=fixtures&date=2026-06-30&timezone=Europe/Paris

export default async function handler(req, res) {
  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing APIFOOTBALL_KEY. Add it in Vercel → Settings → Environment Variables and redeploy.' });
    return;
  }

  const { path, ...rest } = req.query;
  if (!path) {
    res.status(400).json({ error: 'Missing "path" query param, e.g. ?path=fixtures&date=2026-06-30' });
    return;
  }

  // path may arrive as an array if duplicated — normalize to string
  const cleanPath = Array.isArray(path) ? path[0] : path;
  const qs = new URLSearchParams(rest).toString();
  const url = `https://v3.football.api-sports.io/${cleanPath}${qs ? '?' + qs : ''}`;

  try {
    const r = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
