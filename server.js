const http = require('http');
const https = require('https');
const { fetch, ProxyAgent } = require('undici');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

const proxyAgent = new ProxyAgent('http://Cb6Vso1398593:1lWNf7Wh8GCIEVNS@unblocker.iproyal.com:12323');

const WEB_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];
const rWeb = () => WEB_UAS[Math.floor(Math.random() * WEB_UAS.length)];

const profileCache = new Map();
const imgCache     = new Map();
const CACHE_TTL    = 6 * 60 * 60 * 1000;
const IMG_TTL      = 7 * 24 * 60 * 60 * 1000;

function extractJson(body) {
  try { return JSON.parse(body); } catch(_) {}
  const match = body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (match) { try { return JSON.parse(match[1]); } catch(_) {} }
  const jsonMatch = body.match(/(\{[\s\S]*\})/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[1]); } catch(_) {} }
  return null;
}

async function fetchViaProxy(url, headers) {
  const res = await fetch(url, {
    dispatcher: proxyAgent,
    redirect: 'follow',
    headers,
  });
  const body = await res.text();
  return { status: res.status, body, headers: Object.fromEntries(res.headers) };
}

async function fetchViaProxyBuffer(url, headers) {
  const res = await fetch(url, {
    dispatcher: proxyAgent,
    redirect: 'follow',
    headers,
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buffer, contentType: res.headers.get('content-type') || 'image/jpeg' };
}

// Images fetched directly — CDN is public
function fetchImageDirect(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': rWeb(), 'Referer': 'https://www.instagram.com/' } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchProfile(username) {
  const cached = profileCache.get(username);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchViaProxy(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          'User-Agent': rWeb(),
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://www.instagram.com/${username}/`,
          'Origin': 'https://www.instagram.com',
          ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
        }
      );

      if (r.status === 200) {
        const json = extractJson(r.body);
        if (json?.data?.user) {
          const clean = JSON.stringify(json);
          profileCache.set(username, { data: clean, ts: Date.now() });
          return clean;
        }
      }

      if (r.status === 429) {
        const wait = (attempt + 1) * 3000 + Math.random() * 2000;
        console.log(`429 attempt ${attempt + 1}, waiting ${Math.round(wait/1000)}s`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      console.log(`HTTP ${r.status} for ${username}: ${r.body.substring(0, 120)}`);
      break;
    } catch(e) {
      console.log(`Error attempt ${attempt + 1}: ${e.message}`);
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const urlObj = new URL(req.url, 'http://localhost');

  if (urlObj.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', session: SESSION_ID ? 'set' : 'missing', cached: profileCache.size }));
    return;
  }

  if (urlObj.pathname === '/img') {
    const username = (urlObj.searchParams.get('u') || '').replace(/[^a-zA-Z0-9._]/g, '');
    if (!username) { res.writeHead(404); res.end(); return; }

    const cachedImg = imgCache.get(username);
    if (cachedImg && Date.now() - cachedImg.ts < IMG_TTL) {
      res.setHeader('Content-Type', cachedImg.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.writeHead(200); res.end(cachedImg.buffer); return;
    }

    let picUrl = null;
    const prof = await fetchProfile(username);
    if (prof) {
      try {
        const json = JSON.parse(prof);
        picUrl = json?.data?.user?.profile_pic_url_hd || json?.data?.user?.profile_pic_url;
      } catch(_) {}
    }
    if (!picUrl) { res.writeHead(404); res.end(); return; }

    try {
      const img = await fetchImageDirect(picUrl);
      if (img.status === 200) {
        imgCache.set(username, { buffer: img.buffer, contentType: img.contentType, ts: Date.now() });
        res.setHeader('Content-Type', img.contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.writeHead(200); res.end(img.buffer); return;
      }
    } catch(e) { console.log('Image error:', e.message); }
    res.writeHead(502); res.end(); return;
  }

  if (urlObj.pathname === '/debug') {
    res.setHeader('Content-Type', 'text/plain');
    const log = [];
    const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';
    try {
      const r = await fetchViaProxy('https://api.ipify.org?format=json', { 'User-Agent': 'test' });
      log.push(`Outbound IP: ${r.body}`);
    } catch(e) { log.push(`IP error: ${e.message}`); }
    log.push(`Session: ${session ? session.substring(0,15)+'...' : 'NOT SET'}`);
    log.push('');
    try {
      const r = await fetchViaProxy(
        'https://www.instagram.com/api/v1/users/web_profile_info/?username=cristiano',
        {
          'User-Agent': rWeb(),
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.instagram.com/cristiano/',
          'Origin': 'https://www.instagram.com',
          ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
        }
      );
      log.push(`Instagram API: HTTP ${r.status}`);
      const json = extractJson(r.body);
      if (json?.data?.user) {
        const u = json.data.user;
        log.push(`Username: ${u.username}`);
        log.push(`Full name: ${u.full_name}`);
        log.push(`Followers: ${u.edge_followed_by?.count ?? u.follower_count ?? 'N/A'}`);
        log.push('✓ WORKING');
      } else {
        log.push(`Response: ${r.body.substring(0, 200)}`);
      }
    } catch(e) { log.push(`API error: ${e.message}`); }
    res.writeHead(200); res.end(log.join('\n')); return;
  }

  res.setHeader('Content-Type', 'application/json');
  const key      = urlObj.searchParams.get('key');
  const username = (urlObj.searchParams.get('u') || '').replace(/[^a-zA-Z0-9._]/g, '');
  if (key !== SECRET_KEY) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
  if (!username)          { res.writeHead(400); res.end(JSON.stringify({ error: 'No username' })); return; }

  const data = await fetchProfile(username);
  if (data) { res.writeHead(200); res.end(data); }
  else       { res.writeHead(503); res.end(JSON.stringify({ error: 'Failed to fetch profile' })); }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT} — undici ProxyAgent`));
