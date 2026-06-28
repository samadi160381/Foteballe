export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path = req.query.path || '';
  if (!path) return res.status(400).json({ error: 'path param required' });

  try {
    const url = 'https://api.football-data.org/v4/' + path.replace(/^\/+/, '');
    const r = await fetch(url, {
      headers: { 'X-Auth-Token': '8684c9e13ec4428db00d63b95adc2cf4' }
    });
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(r.status).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
