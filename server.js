const http  = require('http');
const https = require('https');
const net   = require('net');

const PORT       = process.env.PORT || 3000;
const SESSION_ID = process.env.IG_SESSION_ID || '';
const SECRET_KEY = process.env.SECRET_KEY || 'spyxsocial2024';

const PROXY_HOST = 'geo.iproyal.com';
const PROXY_PORT = 12321;
const PROXY_AUTH = Buffer.from('cL4V8BOGtvcFAyMi_session-spyxsocial:kAQNBxVBdKYg9T8r').toString('base64');

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

function fetchUrl(targetUrl, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const targetHost = parsed.hostname;
    const targetPort = 443;
    const path = parsed.pathname + (parsed.search || '');

    // Step 1: Connect to proxy
    const socket = net.connect(PROXY_PORT, PROXY_HOST, () => {
      // Step 2: Send CONNECT request
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        `Proxy-Authorization: Basic ${PROXY_AUTH}\r\n` +
        `Proxy-Connection: Keep-Alive\r\n\r\n`
      );
    });

    socket.setTimeout(25000, () => { socket.destroy(); reject(new Error('proxy timeout')); });
    socket.on('error', reject);

    // Step 3: Wait for 200 Connection established
    let connectBuf = '';
    socket.on('data', function onData(chunk) {
      connectBuf += chunk.toString();
      if (!connectBuf.includes('\r\n\r\n')) return;
      socket.removeListener('data', onData);

      if (!connectBuf.startsWith('HTTP/1.1 200') && !connectBuf.startsWith('HTTP/1.0 200')) {
        socket.destroy();
        return reject(new Error(`Proxy CONNECT failed: ${connectBuf.split('\r\n')[0]}`));
      }

      // Step 4: Upgrade to TLS
      const tlsSocket = require('tls').connect({
        socket,
        servername: targetHost,
        rejectUnauthorized: false,
      }, () => {
        // Step 5: Send HTTP request
        tlsSocket.write(
          `GET ${path} HTTP/1.1\r\n` +
          `Host: ${targetHost}\r\n` +
          `Connection: close\r\n` +
          Object.entries({ 'User-Agent': rWeb(), ...headers })
            .map(([k, v]) => `${k}: ${v}`).join('\r\n') +
          '\r\n\r\n'
        );
      });

      tlsSocket.on('error', reject);

      // Step 6: Read response
      const chunks = [];
      let headersParsed = false;
      let statusCode = 0;
      let resHeaders = {};
      let headerBuf = '';

      tlsSocket.on('data', (chunk) => {
        if (!headersParsed) {
          headerBuf += chunk.toString('binary');
          const headerEnd = headerBuf.indexOf('\r\n\r\n');
          if (headerEnd === -1) return;
          headersParsed = true;
          const headerPart = headerBuf.substring(0, headerEnd);
          const bodyPart = headerBuf.substring(headerEnd + 4);
          const lines = headerPart.split('\r\n');
          statusCode = parseInt(lines[0].split(' ')[1]);
          lines.slice(1).forEach(line => {
            const idx = line.indexOf(': ');
            if (idx > 0) resHeaders[line.substring(0, idx).toLowerCase()] = line.substring(idx + 2);
          });
          if (bodyPart) chunks.push(Buffer.from(bodyPart, 'binary'));
        } else {
          chunks.push(chunk);
        }
      });

      tlsSocket.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        resolve({ status: statusCode, body: rawBody.toString('utf8'), rawBody, resHeaders });
      });
    });
  });
}

function extractJson(body) {
  try { return JSON.parse(body); } catch(_) {}
  const m = body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (m) { try { return JSON.parse(m[1]); } catch(_) {} }
  const j = body.match(/(\{[\s\S]*\})/);
  if (j) { try { return JSON.parse(j[1]); } catch(_) {} }
  return null;
}

async function fetchProfile(username) {
  const cached = profileCache.get(username);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const home = await fetchUrl('https://www.instagram.com/', {
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(session ? { 'Cookie': `sessionid=${session}` } : {}),
      });
      const cookieStr = Array.isArray(home.resHeaders['set-cookie'])
        ? home.resHeaders['set-cookie'].join('; ')
        : (home.resHeaders['set-cookie'] || '');
      const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || 'csrf';
      const cookies = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;

      await new Promise(r => setTimeout(r, 800 + Math.random() * 800));

      const r = await fetchUrl(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        {
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
        const json = extractJson(r.body);
        if (json?.data?.user) {
          const clean = JSON.stringify(json);
          profileCache.set(username, { data: clean, ts: Date.now() });
          return clean;
        }
      }

      if (r.status === 429) {
        const wait = (attempt + 1) * 4000 + Math.random() * 2000;
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
      const img = await fetchUrl(picUrl, {
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.instagram.com/',
      });
      if (img.status === 200) {
        const ct = img.resHeaders['content-type'] || 'image/jpeg';
        imgCache.set(username, { buffer: img.rawBody, contentType: ct, ts: Date.now() });
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.writeHead(200); res.end(img.rawBody); return;
      }
    } catch(e) { console.log('Image error:', e.message); }
    res.writeHead(502); res.end(); return;
  }

  if (urlObj.pathname === '/debug') {
    res.setHeader('Content-Type', 'text/plain');
    const log = [];
    const session = SESSION_ID ? decodeURIComponent(SESSION_ID) : '';

    try {
      const r = await fetchUrl('https://api.ipify.org?format=json', {});
      log.push(`Outbound IP: ${r.body}`);
    } catch(e) { log.push(`IP error: ${e.message}`); }

    log.push(`Session: ${session ? session.substring(0,15)+'...' : 'NOT SET'}`);
    log.push('');

    try {
      const home = await fetchUrl('https://www.instagram.com/', {
        'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9',
      });
      const cookieStr = home.resHeaders['set-cookie'] || '';
      const csrf = cookieStr.match(/csrftoken=([^;,\s]+)/)?.[1] || '';
      const cookies = session ? `csrftoken=${csrf}; sessionid=${session}` : `csrftoken=${csrf}`;
      log.push(`Homepage: HTTP ${home.status}, csrf: ${csrf || 'NOT FOUND'}`);

      await new Promise(r => setTimeout(r, 800));

      const r = await fetchUrl(
        'https://www.instagram.com/api/v1/users/web_profile_info/?username=cristiano',
        {
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
      const json = extractJson(r.body);
      if (json?.data?.user) {
        const u = json.data.user;
        log.push(`Username: ${u.username}`);
        log.push(`Full name: ${u.full_name}`);
        log.push(`Followers: ${u.edge_followed_by?.count ?? u.follower_count ?? 'N/A'}`);
        log.push('✓ WORKING');
      } else {
        log.push(`Response: ${r.body.substring(0, 300)}`);
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

server.listen(PORT, () => console.log(`Server running on port ${PORT} — raw CONNECT tunnel, zero dependencies`));
