const http  = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

// IPRoyal Web Unblocker
const PROXY_URL = 'http://Cb6Vso1398593:1lWNf7Wh8GCIEVNS@unblocker.iproyal.com:12323';

const WEB_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
];
const rWeb = () => WEB_UAS[Math.floor(Math.random() * WEB_UAS.length)];

// Simple in-memory cache
const profileCache = new Map();
const imgCache     = new Map();
const CACHE_TTL    = 6 * 60 * 60 * 1000; // 6 hours
const IMG_TTL      = 7 * 24 * 60 * 60 * 1000; // 7 days

function fetchUrl(url, headers) {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent(PROXY_URL, { rejectUnauthorized: false });
    const req = https.get(url, { agent, headers }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        rawBody: Buffer.concat(chunks),
        headers: res.headers
      }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent(PROXY_URL, { rejectUnauthorized: false });
    const req = https.get(url, { agent, headers: {
      'User-Agent': rWeb(),
      'Referer': 'https://www.instagram.com/',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    }}, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/jpeg'
      }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchProfile(username) {
  // check cache first
  const cached = profileCache.get(username);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const home = await fetchUrl('https://www.instagram.com/', {
        'User-Agent': rWeb(),
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
      });

      const setCookie = home.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
      const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || '';
      if (!csrf) { console.log(`No CSRF attempt ${attempt + 1}`); continue; }
      const cookies = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;

      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

      const r = await fetchUrl(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
          'User-Agent': rWeb(),
          'x-ig-app-id': '936619743392459',
          'x-csrftoken': csrf,
          'x-requested-with': 'XMLHttpRequest',
          'Cookie': cookies,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://www.instagram.com/${username}/`,
          'Origin': 'https://www.instagram.com',
        }
      );

      if (r.status === 200) {
        const json = JSON.parse(r.body);
        if (json?.data?.user) {
          profileCache.set(username, { data: r.body, ts: Date.now() });
          return r.body;
        }
      }

      if (r.status === 429) {
        const wait = (attempt + 1) * 3000 + Math.random() * 2000;
        console.log(`429 attempt ${attempt + 1}, waiting ${Math.round(wait/1000)}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      console.log(`HTTP ${r.status} for ${username}: ${r.body.substring(0, 150)}`);
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

  // ── HEALTH ──────────────────────────────────────────────────
  if (urlObj.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      session: SESSION_ID ? 'set' : 'missing',
      proxy: 'iproyal-unblocker',
      cached_profiles: profileCache.size,
    }));
    return;
  }

  // ── IMAGE PROXY ──────────────────────────────────────────────
  if (urlObj.pathname === '/img') {
    const username = (urlObj.searchParams.get('u') || '').replace(/[^a-zA-Z0-9._]/g, '');
    if (!username) { res.writeHead(400); res.end(); return; }

    // check image cache
    const cachedImg = imgCache.get(username);
    if (cachedImg && Date.now() - cachedImg.ts < IMG_TTL) {
      res.setHeader('Content-Type', cachedImg.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.writeHead(200);
      res.end(cachedImg.buffer);
      return;
    }

    // get pic URL from profile
    let picUrl = null;
    const prof = await fetchProfile(username);
    if (prof) {
      try {
        const json = JSON.parse(prof);
        const user = json?.data?.user;
        picUrl = user?.profile_pic_url_hd || user?.profile_pic_url;
      } catch(_) {}
    }

    if (!picUrl) { res.writeHead(404); res.end(); return; }

    try {
      const img = await fetchImage(picUrl);
      if (img.status === 200) {
        imgCache.set(username, { buffer: img.buffer, contentType: img.contentType, ts: Date.now() });
        res.setHeader('Content-Type', img.contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.writeHead(200);
        res.end(img.buffer);
        return;
      }
    } catch(e) { console.log('Image fetch error:', e.message); }

    res.writeHead(502); res.end();
    return;
  }

  // ── DEBUG ────────────────────────────────────────────────────
  if (urlObj.pathname === '/debug') {
    res.setHeader('Content-Type', 'text/plain');
    const log = [];
    const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

    try {
      const r = await fetchUrl('https://api.ipify.org?format=json', { 'User-Agent': 'test' });
      log.push(`Outbound IP: ${r.body}`);
    } catch(e) { log.push(`IP error: ${e.message}`); }

    let csrf = '';
    try {
      const r = await fetchUrl('https://www.instagram.com/', {
        'User-Agent': rWeb(),
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      });
      const cookieStr = (r.headers['set-cookie'] || []).join('; ');
      csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || '';
      log.push(`Instagram homepage: HTTP ${r.status}, csrf: ${csrf || 'NOT FOUND'}`);
    } catch(e) { log.push(`Homepage error: ${e.message}`); }

    await new Promise(r => setTimeout(r, 1000));

    try {
      const cookies = session
        ? `csrftoken=${csrf}; sessionid=${session}`
        : `csrftoken=${csrf}`;
      log.push(`Session: ${session ? session.substring(0, 15) + '...' : 'NOT SET'}`);

      const r = await fetchUrl(
        'https://www.instagram.com/api/v1/users/web_profile_info/?username=cristiano',
        {
          'User-Agent': rWeb(),
          'x-ig-app-id': '936619743392459',
          'x-csrftoken': csrf,
          'x-requested-with': 'XMLHttpRequest',
          'Cookie': cookies,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.instagram.com/cristiano/',
          'Origin': 'https://www.instagram.com',
        }
      );
      log.push(`Instagram API: HTTP ${r.status}`);
      try {
        const json = JSON.parse(r.body);
        const user = json?.data?.user;
        log.push(`Username: ${user?.username || 'N/A'}`);
        log.push(`Full name: ${user?.full_name || 'N/A'}`);
        log.push(`Followers: ${user?.edge_followed_by?.count ?? 'N/A'}`);
      } catch(_) { log.push(`Response: ${r.body.substring(0, 300)}`); }
    } catch(e) { log.push(`API error: ${e.message}`); }

    res.writeHead(200);
    res.end(log.join('\n'));
    return;
  }

  // ── PROFILE ──────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/json');
  const key      = urlObj.searchParams.get('key');
  const username = (urlObj.searchParams.get('u') || '').replace(/[^a-zA-Z0-9._]/g, '');

  if (key !== SECRET_KEY) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
  if (!username)          { res.writeHead(400); res.end(JSON.stringify({ error: 'No username' })); return; }

  const data = await fetchProfile(username);
  if (data) { res.writeHead(200); res.end(data); }
  else       { res.writeHead(503); res.end(JSON.stringify({ error: 'Failed to fetch profile' })); }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT} — IPRoyal Web Unblocker`));
