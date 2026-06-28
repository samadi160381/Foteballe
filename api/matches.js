export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  const url = `https://api.football-data.org/v4/${path}`;
  try {
    const apiRes = await fetch(url, {
      headers: { 'X-Auth-Token': '8684c9e13ec4428db00d63b95adc2cf4' }
    });
    const data = await apiRes.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    return res.status(apiRes.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
