// Mali lažni Supabase Auth server za E2E test prijave (nikad se ne koristi van testova).
import http from 'node:http';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'user-1', email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.potpis`;
const user = (email) => ({ id: 'user-1', aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });

const server = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (status, obj) => { res.writeHead(status, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.startsWith('/auth/v1/token') && req.method === 'POST') {
      const { email, password } = JSON.parse(body || '{}');
      if (email === 'radnik@alutim.rs' && password === 'tajna123') {
        return json(200, { access_token: jwt(email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-1', user: user(email) });
      }
      if (email === 'spor@alutim.rs') return json(429, { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' });
      return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (req.url.startsWith('/auth/v1/user')) return json(200, user('radnik@alutim.rs'));
    if (req.url.startsWith('/auth/v1/logout')) { res.writeHead(204, cors); res.end(); return; }
    json(404, { msg: 'nema' });
  });
});
server.listen(18321, () => console.log('lažni Supabase na 18321'));
