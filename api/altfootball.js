export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.query.path || '';
  if (!path) return res.status(400).json({ error: 'path param required' });

  try {
    const url = 'https://v3.football.api-sports.io/' + path.replace(/^\/+/, '');
    const r = await fetch(url, {
      headers: { 'x-apisports-key': '73c725b077b7969f8ea3a111bea9327d' }
    });
    const data = await r.json();
    // No caching headers here on purpose: this proxy is only called when a user
    // explicitly browses an "alt" league (Argentina, Morocco, etc), never on the
    // 60s auto-refresh loop, so traffic volume is naturally low and we'd rather
    // get fresh data than risk masking a real failure behind a stale cache.
    return res.status(r.status).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
