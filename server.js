const http  = require('http');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

const STICKY_PROXIES = [
  'http://zlctqejfresidential-877088:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877089:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877090:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877091:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877092:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877093:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877094:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877095:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877096:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877097:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877098:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877099:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877100:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877101:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877102:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877103:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877104:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877105:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877106:nj9krjaky77g@p.webshare.io:80',
  'http://zlctqejfresidential-877107:nj9krjaky77g@p.webshare.io:80',
];

// Track which proxies are rate limited and when they recover
const proxyStatus = STICKY_PROXIES.map(() => ({ blocked: false, until: 0 }));
let proxyIndex = 0;

function getNextProxy() {
  const now = Date.now();
  // unblock any proxies whose cooldown has expired
  proxyStatus.forEach(s => { if (s.blocked && now > s.until) s.blocked = false; });

  // find next available proxy
  for (let i = 0; i < STICKY_PROXIES.length; i++) {
    const idx = (proxyIndex + i) % STICKY_PROXIES.length;
    if (!proxyStatus[idx].blocked) {
      proxyIndex = (idx + 1) % STICKY_PROXIES.length;
      return { proxy: STICKY_PROXIES[idx], idx };
    }
  }

  // all blocked — return the one closest to recovery
  const soonest = proxyStatus.reduce((a, b, i) =>
    proxyStatus[i].until < proxyStatus[a].until ? i : a, 0);
  return { proxy: STICKY_PROXIES[soonest], idx: soonest };
}

function markProxyBlocked(idx, ms = 60000) {
  proxyStatus[idx].blocked = true;
  proxyStatus[idx].until = Date.now() + ms;
  console.log(`Proxy ${idx} blocked for ${ms/1000}s`);
}

const WEB_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];
const rWeb = () => WEB_UAS[Math.floor(Math.random() * WEB_UAS.length)];

function fetchUrl(url, headers, proxyUrl) {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent(proxyUrl);
    const req = https.get(url, { agent, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchProfile(username) {
  const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const { proxy, idx } = getNextProxy();
    try {
      // Step 1: fetch homepage for CSRF
      const home = await fetchUrl('https://www.instagram.com/', {
        'User-Agent': rWeb(),
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
      }, proxy);

      const setCookie = home.headers['set-cookie'] || [];
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
      const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || '';
      if (!csrf) {
        console.log(`No CSRF on attempt ${attempt + 1}, proxy ${idx}`);
        continue;
      }
      const cookies = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;

      // Step 2: small delay
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));

      // Step 3: API call
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
        }, proxy
      );

      if (r.status === 200) {
        const json = JSON.parse(r.body);
        if (json?.data?.user) return r.body;
      }

      if (r.status === 429) {
        markProxyBlocked(idx, 60000); // cool down 60s
        console.log(`429 on proxy ${idx}, attempt ${attempt + 1}, trying next...`);
        continue;
      }

      console.log(`HTTP ${r.status} for ${username} via proxy ${idx}: ${r.body.substring(0, 100)}`);
      break;

    } catch(e) {
      console.log(`Error on proxy ${idx}: ${e.message}`);
      markProxyBlocked(idx, 30000);
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const urlObj = new URL(req.url, 'http://localhost');

  if (urlObj.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    const now = Date.now();
    res.end(JSON.stringify({
      status: 'ok',
      session: SESSION_ID ? 'set' : 'missing',
      proxies: {
        total: STICKY_PROXIES.length,
        available: proxyStatus.filter(s => !s.blocked || now > s.until).length,
        blocked: proxyStatus.filter(s => s.blocked && now <= s.until).length,
      }
    }));
    return;
  }

  if (urlObj.pathname === '/debug') {
    res.setHeader('Content-Type', 'text/plain');
    const log = [];
    const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';
    log.push(`Session: ${session ? session.substring(0, 15) + '...' : 'NOT SET'}`);
    log.push(`Total proxies: ${STICKY_PROXIES.length}`);
    log.push('');
    log.push('--- Testing all proxies ---');

    for (let i = 0; i < STICKY_PROXIES.length; i++) {
      const proxy = STICKY_PROXIES[i];
      try {
        // get IP
        const ipR = await fetchUrl('https://api.ipify.org?format=json', { 'User-Agent': 'test' }, proxy);

        // get csrf
        const homeR = await fetchUrl('https://www.instagram.com/', {
          'User-Agent': rWeb(),
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        }, proxy);
        const cookieStr = (homeR.headers['set-cookie'] || []).join('; ');
        const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || '';
        const cookies = session
          ? `csrftoken=${csrf}; sessionid=${session}`
          : `csrftoken=${csrf}`;

        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

        const igR = await fetchUrl(
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
          }, proxy
        );

        const status = igR.status === 200 ? '✓ OK' : `✗ ${igR.status}`;
        log.push(`[${i}] ${ipR.body} → ${status}`);
        if (igR.status === 429) markProxyBlocked(i, 60000);
      } catch(e) {
        log.push(`[${i}] Error: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    log.push('');
    log.push('--- Proxy status ---');
    const now = Date.now();
    proxyStatus.forEach((s, i) => {
      if (s.blocked && now <= s.until) {
        log.push(`[${i}] blocked for ${Math.round((s.until - now)/1000)}s more`);
      } else {
        log.push(`[${i}] available`);
      }
    });

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
