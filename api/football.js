// Vercel serverless function — proxies requests to API-Football (api-sports.io)
// so the secret API key never reaches the browser.
//
// Setup: in your Vercel project → Settings → Environment Variables, add:
//   APIFOOTBALL_KEY = <your key from dashboard.api-football.com>
// Then redeploy.
//
// Usage from the client: /api/football?path=fixtures&date=2026-06-30&timezone=Europe/Paris
//
// ══════════════════════════════════════════════════════════════════
// CACHING — this is what actually fixes "too many requests"
// ══════════════════════════════════════════════════════════════════
// Two layers, stacked:
//
// 1. Edge cache (the big one): we set a `Cache-Control: s-maxage=…` header.
//    Vercel's CDN honors this for serverless functions — the FIRST request
//    for a given URL (e.g. /api/football?path=fixtures&date=2026-06-30)
//    hits API-Football, and every other visitor hitting that same URL
//    within the TTL window is served straight from Vercel's edge, never
//    touching your upstream quota at all. This is the difference between
//    "1 API call per unique request, regardless of how many users" vs.
//    "1 API call per user per poll" — usually a 50–500x reduction.
//
// 2. In-memory cache: a fallback inside the function itself, in case a
//    request reaches a warm lambda instance that the edge cache missed
//    (e.g. during local dev, or on plans where edge caching doesn't
//    apply to every path). Cheap insurance, no extra infra needed.
//
// TTLs are chosen per endpoint based on how fast that data actually
// changes — live scores get a short cache, finished/past fixtures get
// a very long one since they never change again.

const memoryCache = new Map(); // key -> { data, status, expiresAt }

function getCacheTTLSeconds(cleanPath, query) {
  const p = cleanPath.toLowerCase();

  // Rarely changes at all
  if (p === 'leagues' || p === 'teams') return 60 * 60 * 24; // 24h
  if (p === 'standings') return 60 * 15;                      // 15 min

  // Fixture-events / stats / lineups update during live play but are
  // otherwise static — a moderate cache still kills most duplicate load.
  if (p === 'fixtures/lineups') return 60 * 5;    // 5 min (confirmed pre-match, rarely changes after)
  if (p === 'fixtures/statistics') return 45;     // updates during live matches
  if (p === 'fixtures/events') return 30;         // updates during live matches
  if (p === 'fixtures/headtohead') return 60 * 60; // past meetings, changes ~never

  if (p === 'fixtures') {
    // Single fixture by id — could be live, so keep it short.
    if (query.id) return 30;

    // A team's recent form — only changes once a match finishes.
    if (query.team && query.last) return 60 * 10;

    // A whole day's fixtures — the common case (the live-scores list).
    if (query.date) {
      const today = new Date().toISOString().slice(0, 10);
      if (query.date < today) return 60 * 60 * 24; // past date: immutable, cache hard
      if (query.date > today) return 60 * 30;       // future date: rarely changes
      return 30;                                    // today: could contain live matches
    }
  }

  return 60; // sane default for anything not listed above
}

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
  const ttl = getCacheTTLSeconds(cleanPath, rest);
  const cacheKey = url;

  // ── 1. In-memory hit? Serve immediately, no upstream call. ──
  const hit = memoryCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    res.setHeader('X-Cache', 'HIT');
    res.status(hit.status).json(hit.data);
    return;
  }

  try {
    const r = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
    const data = await r.json();

    // Cache successful responses normally. Cache error responses too, but
    // briefly — this stops a burst of users from hammering an already-
    // failing/rate-limited upstream (e.g. the "Free plans do not have
    // access to this date" error) over and over.
    const isOk = r.status >= 200 && r.status < 300;
    const effectiveTtl = isOk ? ttl : Math.min(ttl, 15);

    memoryCache.set(cacheKey, {
      data,
      status: r.status,
      expiresAt: Date.now() + effectiveTtl * 1000,
    });

    res.setHeader('Cache-Control', `public, s-maxage=${effectiveTtl}, stale-while-revalidate=${effectiveTtl * 2}`);
    res.setHeader('X-Cache', 'MISS');
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
