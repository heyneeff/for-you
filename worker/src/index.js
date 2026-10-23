// For You — backend. Holds every surprise and only hands one over once its
// unlock time has passed, so nothing can be read early from the public app.
//
// KV layout (binding DATA):
//   items        JSON array of surprises (no photo bytes)
//   photo:<id>   image bytes, metadata { type }
//   notes        JSON array of little notes she leaves
//   opened       JSON object { <itemId>: isoTime } — when she first opened each
//   subs         JSON array of web-push subscriptions
//
// Secrets: RECIPIENT_KEY (her secret word), ADMIN_KEY (yours),
//          VAPID_PRIVATE_JWK (JSON). Var: VAPID_PUBLIC (base64url raw key).

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });

const norm = (s) => (s || '').trim().toLowerCase();

async function load(env, key, fallback) {
  const v = await env.DATA.get(key, 'json');
  return v ?? fallback;
}
const save = (env, key, value) => env.DATA.put(key, JSON.stringify(value));

const isUnlocked = (item, now = Date.now()) => Date.parse(item.unlockAt) <= now;

// What she can see about an item before it opens: enough to wonder, no more.
function teaser(item, opened) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    unlockAt: item.unlockAt,
    unlocked: isUnlocked(item),
    opened: Boolean(opened[item.id]),
  };
}

function cors(req, env) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const ok = allowed.includes(origin) || origin.startsWith('http://localhost');
  return ok
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'content-type, x-key',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        vary: 'origin',
      }
    : {};
}

export default {
  async fetch(req, env) {
    const c = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { headers: c });
    try {
      const res = await route(req, env);
      for (const [k, v] of Object.entries(c)) res.headers.set(k, v);
      return res;
    } catch (err) {
      return json({ error: String(err?.message || err) }, 500, c);
    }
  },

  // Every minute: notify for anything that just unlocked.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(notifyUnlocked(env));
  },
};

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const key = req.headers.get('x-key') || '';
  const isHer = env.RECIPIENT_KEY && norm(key) === norm(env.RECIPIENT_KEY);
  const isAdmin = env.ADMIN_KEY && key === env.ADMIN_KEY;

  // <img>/<audio> can't send headers, so media URLs carry the key as ?k=.
  const qKey = url.searchParams.get('k') || '';
  const herViaQuery = env.RECIPIENT_KEY && norm(qKey) === norm(env.RECIPIENT_KEY);
  const adminViaQuery = env.ADMIN_KEY && qKey === env.ADMIN_KEY;

  if (path === '/api/vapid') return json({ key: env.VAPID_PUBLIC || '' });

  // ---- admin ----
  if (path.startsWith('/api/admin')) {
    if (!(isAdmin || (adminViaQuery && req.method === 'GET'))) return json({ error: 'nope' }, 401);
    const vn = path.match(/^\/api\/admin\/voice\/([\w-]+)$/);
    if (vn && req.method === 'GET') return serveMedia(req, env, `vnote:${vn[1]}`);
    return adminRoute(req, env, path);
  }

  // ---- her ----
  const media = path.match(/^\/api\/(photo|audio)\/([\w-]+)$/);
  if (media && req.method === 'GET') {
    if (!(isHer || isAdmin || herViaQuery || adminViaQuery)) return json({ error: 'nope' }, 401);
    const items = await load(env, 'items', []);
    const item = items.find((i) => i.id === media[2]);
    const adminPeek = isAdmin || adminViaQuery;
    if (!item || (!adminPeek && !isUnlocked(item))) return json({ error: 'not yet' }, 403);
    return serveMedia(req, env, `${media[1]}:${item.id}`);
  }

  if (!isHer) return json({ error: 'nope' }, 401);

  if (path === '/api/hello') return json({ ok: true });

  if (path === '/api/items' && req.method === 'GET') {
    const [items, opened] = await Promise.all([load(env, 'items', []), load(env, 'opened', {})]);
    items.sort((a, b) => Date.parse(a.unlockAt) - Date.parse(b.unlockAt));
    return json({ items: items.map((i) => teaser(i, opened)), now: new Date().toISOString() });
  }

  const one = path.match(/^\/api\/items\/([\w-]+)$/);
  if (one && req.method === 'GET') {
    const [items, opened] = await Promise.all([load(env, 'items', []), load(env, 'opened', {})]);
    const item = items.find((i) => i.id === one[1]);
    if (!item) return json({ error: 'not found' }, 404);
    if (!isUnlocked(item)) return json({ ...teaser(item, opened), locked: true }, 403);
    if (!opened[item.id]) {
      opened[item.id] = new Date().toISOString();
      await save(env, 'opened', opened);
    }
    return json({ ...item, unlocked: true, opened: true });
  }

  if (path === '/api/notes' && req.method === 'POST') {
    const { itemId, text } = await req.json();
    const t = String(text || '').trim().slice(0, 2000);
    if (!t) return json({ error: 'empty' }, 400);
    const notes = await load(env, 'notes', []);
    notes.push({ itemId: itemId || null, text: t, at: new Date().toISOString() });
    await save(env, 'notes', notes);
    return json({ ok: true });
  }

  if (path === '/api/notes/voice' && req.method === 'POST') {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 15e6) return json({ error: 'too big' }, 400);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const type = req.headers.get('content-type') || 'audio/mp4';
    await env.DATA.put(`vnote:${id}`, buf, { metadata: { type } });
    const notes = await load(env, 'notes', []);
    notes.push({ itemId: url.searchParams.get('itemId') || null, voice: id, at: new Date().toISOString() });
    await save(env, 'notes', notes);
    return json({ ok: true });
  }

  if (path === '/api/push/subscribe' && req.method === 'POST') {
    const sub = await req.json();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: 'bad sub' }, 400);
    const subs = (await load(env, 'subs', [])).filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: sub.keys, at: new Date().toISOString() });
    await save(env, 'subs', subs);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

async function adminRoute(req, env, path) {
  if (path === '/api/admin/items' && req.method === 'GET') {
    const [items, opened, notes, subs] = await Promise.all([
      load(env, 'items', []),
      load(env, 'opened', {}),
      load(env, 'notes', []),
      load(env, 'subs', []),
    ]);
    items.sort((a, b) => Date.parse(a.unlockAt) - Date.parse(b.unlockAt));
    return json({ items, opened, notes, subscribers: subs.length });
  }

  const m = path.match(/^\/api\/admin\/items\/([\w-]+)$/);
  if (m && req.method === 'PUT') {
    const body = await req.json();
    const type = ['letter', 'place', 'gift'].includes(body.type) ? body.type : 'letter';
    if (!body.title || Number.isNaN(Date.parse(body.unlockAt))) return json({ error: 'need title + unlockAt' }, 400);
    const items = await load(env, 'items', []);
    const prev = items.find((i) => i.id === m[1]);
    const item = {
      id: m[1],
      type,
      title: String(body.title).slice(0, 120),
      unlockAt: new Date(body.unlockAt).toISOString(),
      body: String(body.body || ''),
      signoff: String(body.signoff || ''),
      place: body.place || null,
      gift: body.gift || null,
      hasPhoto: prev?.hasPhoto || false,
      hasAudio: prev?.hasAudio || false,
      // Moving the time later re-arms the notification.
      notified: prev && prev.unlockAt === new Date(body.unlockAt).toISOString() ? prev.notified : false,
    };
    await save(env, 'items', [...items.filter((i) => i.id !== m[1]), item]);
    return json({ ok: true, item });
  }

  if (m && req.method === 'DELETE') {
    const items = await load(env, 'items', []);
    await save(env, 'items', items.filter((i) => i.id !== m[1]));
    await env.DATA.delete(`photo:${m[1]}`);
    await env.DATA.delete(`audio:${m[1]}`);
    const opened = await load(env, 'opened', {});
    if (opened[m[1]]) (delete opened[m[1]], await save(env, 'opened', opened));
    return json({ ok: true });
  }

  const p = path.match(/^\/api\/admin\/(photo|audio)\/([\w-]+)$/);
  if (p && (req.method === 'PUT' || req.method === 'DELETE')) {
    const [, kind, id] = p;
    const flag = kind === 'photo' ? 'hasPhoto' : 'hasAudio';
    const items = await load(env, 'items', []);
    const item = items.find((i) => i.id === id);
    if (!item) return json({ error: 'save the surprise first' }, 404);
    if (req.method === 'PUT') {
      const type = req.headers.get('content-type') || (kind === 'photo' ? 'image/jpeg' : 'audio/mp4');
      await env.DATA.put(`${kind}:${id}`, await req.arrayBuffer(), { metadata: { type } });
      item[flag] = true;
    } else {
      await env.DATA.delete(`${kind}:${id}`);
      item[flag] = false;
    }
    await save(env, 'items', items);
    return json({ ok: true });
  }

  if (path === '/api/admin/test-push' && req.method === 'POST') {
    const sent = await pushAll(env, { title: 'para ti', body: 'Just testing the little bells ✨', url: './' });
    return json({ ok: true, sent });
  }

  return json({ error: 'not found' }, 404);
}

// Serves a stored photo or voice note. Honors Range requests: Safari on iPhone
// refuses to play <audio> from a server that can't answer bytes=0-1 with 206.
async function serveMedia(req, env, key) {
  const { value, metadata } = await env.DATA.getWithMetadata(key, 'arrayBuffer');
  if (!value) return json({ error: 'nothing here' }, 404);
  const type = metadata?.type || 'application/octet-stream';
  const size = value.byteLength;
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=86400' };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!range) return new Response(value, { headers: { ...base, 'content-length': String(size) } });
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start < 0) start = 0;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  return new Response(value.slice(start, end + 1), {
    status: 206,
    headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
  });
}

// ---------------------------------------------------------------- push ----

async function notifyUnlocked(env) {
  const items = await load(env, 'items', []);
  const due = items.filter((i) => isUnlocked(i) && !i.notified);
  if (!due.length) return;
  for (const i of due) i.notified = true;
  await save(env, 'items', items);
  const what = { letter: 'A letter', place: 'A special place', gift: 'A little gift' };
  const body = due.length === 1 ? `${what[due[0].type]} is ready for you ✨` : 'New surprises are ready for you ✨';
  await pushAll(env, { title: 'para ti', body, url: './' });
}

async function pushAll(env, payload) {
  const subs = await load(env, 'subs', []);
  if (!subs.length || !env.VAPID_PRIVATE_JWK) return 0;
  const keep = [];
  let sent = 0;
  for (const sub of subs) {
    try {
      const res = await sendPush(env, sub, JSON.stringify(payload));
      if (res.status === 404 || res.status === 410) continue; // gone for good
      keep.push(sub);
      if (res.ok) sent++;
    } catch {
      keep.push(sub);
    }
  }
  if (keep.length !== subs.length) await save(env, 'subs', keep);
  return sent;
}

const enc = new TextEncoder();
const b64u = {
  encode(buf) {
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
  },
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// RFC 8291 (aes128gcm) payload encryption + RFC 8292 VAPID.
async function sendPush(env, sub, payload) {
  const uaPublic = b64u.decode(sub.keys.p256dh);
  const authSecret = b64u.decode(sub.keys.auth);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  const body = concat(header, asPublic, cipher);

  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'high',
    },
    body,
  });
}

async function vapidJwt(env, aud) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })),
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64u.encode(sig)}`;
}
