const http       = require('http');
const https      = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const PROXY_URL  = process.env.PROXY_URL || 'http://zlctqejf:nj9krjaky77g@216.98.249.90:7071';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

const agent = new HttpsProxyAgent(PROXY_URL);

const MOBILE_UAS = [
  'Instagram 279.0.0.20.119 Android (33/13; 420dpi; 1080x2400; samsung; SM-S908B; b0s; exynos2200; en_US; 458617916)',
  'Instagram 302.0.0.36.111 Android (34/14; 480dpi; 1080x2316; OnePlus; CPH2449; OnePlus11; qcom; en_US; 510310000)',
];
const WEB_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];
const rMobile = () => MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
const rWeb    = () => WEB_UAS[Math.floor(Math.random() * WEB_UAS.length)];

function fetchUrl(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchProfile(username) {
  const session = decodeURIComponent(SESSION_ID);

  // Method 1: Web API with CSRF + session
  try {
    // Get CSRF token first
    const home = await fetchUrl('https://www.instagram.com/', {
      'User-Agent': rWeb(),
      'Accept':     'text/html',
      ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
    });
    const setCookie = home.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    const csrf      = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || 'csrf';
    const cookies   = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;

    const r = await fetchUrl(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        'User-Agent':       rWeb(),
        'x-ig-app-id':      '936619743392459',
        'x-csrftoken':      csrf,
        'x-requested-with': 'XMLHttpRequest',
        'Cookie':           cookies,
        'Accept':           '*/*',
        'Accept-Language':  'en-US,en;q=0.9',
        'Referer':          `https://www.instagram.com/${username}/`,
        'Origin':           'https://www.instagram.com',
      }
    );
    if (r.status === 200) {
      const json = JSON.parse(r.body);
      if (json?.data?.user) return r.body;
    }
  } catch(_) {}

  // Method 2: Mobile API with session
  try {
    const r = await fetchUrl(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        'User-Agent':           rMobile(),
        'X-IG-App-ID':          '567067343352427',
        'X-IG-Capabilities':    '3brTvw==',
        'X-IG-Connection-Type': 'WIFI',
        'Accept':               '*/*',
        ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
      }
    );
    if (r.status === 200) {
      const json = JSON.parse(r.body);
      if (json?.data?.user) return r.body;
    }
  } catch(_) {}

  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const urlObj = new URL(req.url, `http://localhost`);

  // Health check
  if (urlObj.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', proxy: PROXY_URL.split('@')[1] }));
    return;
  }

  const key      = urlObj.searchParams.get('key');
  const username = (urlObj.searchParams.get('u') || '').replace(/[^a-zA-Z0-9._]/g, '');

  // Auth check
  if (key !== SECRET_KEY) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (!username) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'No username' }));
    return;
  }

  const data = await fetchProfile(username);
  if (data) {
    res.writeHead(200);
    res.end(data);
  } else {
    res.writeHead(503);
    res.end(JSON.stringify({ error: 'Failed to fetch profile' }));
  }
});

server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
