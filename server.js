const http  = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const PROXY_URL  = process.env.PROXY_URL || 'http://zlctqejf:nj9krjaky77g@216.98.249.90:7071';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

const agent = new HttpsProxyAgent(PROXY_URL);

function fetchUrl(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const WEB_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];
const rWeb = () => WEB_UAS[Math.floor(Math.random() * WEB_UAS.length)];

async function fetchProfile(username) {
  const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

  // Method 1: Web API with CSRF + session via proxy
  try {
    const home = await fetchUrl('https://www.instagram.com/', {
      'User-Agent': rWeb(),
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
    });

    const setCookie = home.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || 'csrf';
    const cookies = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;

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
      if (json?.data?.user) return r.body;
    }
  } catch(e) {
    console.log('Method1 error:', e.message);
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const urlObj = new URL(req.url, `http://localhost`);

  // Health check
  if (urlObj.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', proxy: PROXY_URL.split('@')[1], session: SESSION_ID ? 'set' : 'missing' }));
    return;
  }

  // Debug endpoint
  if (urlObj.pathname === '/debug') {
    res.setHeader('Content-Type', 'text/plain');
    const log = [];
    log.push('Testing proxy connection...');
    try {
      const r = await fetchUrl('https://api.ipify.org?format=json', { 'User-Agent': 'test' });
      log.push(`Your IP via proxy: ${r.body} (HTTP ${r.status})`);
    } catch(e) { log.push(`Proxy connection failed: ${e.message}`); }

    log.push('Testing Instagram homepage...');
    try {
      const r = await fetchUrl('https://www.instagram.com/', { 'User-Agent': rWeb(), 'Accept': 'text/html' });
      const csrf = (r.headers['set-cookie'] || []).join(';').match(/csrftoken=([^;,\s]+)/)?.[1];
      log.push(`Instagram homepage: HTTP ${r.status}, csrf: ${csrf || 'NOT FOUND'}`);
    } catch(e) { log.push(`Instagram homepage failed: ${e.message}`); }

    log.push('Testing Instagram API...');
    try {
      const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';
      const r = await fetchUrl(
        'https://www.instagram.com/api/v1/users/web_profile_info/?username=cristiano',
        {
          'User-Agent': rWeb(),
          'x-ig-app-id': '936619743392459',
          'x-requested-with': 'XMLHttpRequest',
          'Accept': '*/*',
          ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
        }
      );
      log.push(`Instagram API: HTTP ${r.status}`);
      log.push(`Response preview: ${r.body.substring(0, 200)}`);
    } catch(e) { log.push(`Instagram API failed: ${e.message}`); }

    res.writeHead(200);
    res.end(log.join('\n'));
    return;
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

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
