// Backstage: where Neeff writes the surprises. Everything saves to the backend;
// nothing secret is ever written into this public site.

const API = window.FOR_YOU.api;
const $ = (id) => document.getElementById(id);
const KIND_ART = { letter: 'envelope', place: 'compass', gift: 'gift' };
let key = localStorage.getItem('fy_admin') || '';
let data = { items: [], opened: {}, notes: [], subscribers: 0 };
let editing = null; // item id, or null for a new one
let pendingAudio = null; // Blob recorded or picked, uploaded on save
let pendingPhoto = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = { 'x-key': key };
  if (body && !raw) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = body.type || 'application/octet-stream';
  const res = await fetch(API + path, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || res.status), { status: res.status });
  return out;
}

// ------------------------------------------------------------ time zones --
const ZONES = ['America/Denver', 'America/Los_Angeles', 'America/Chicago', 'America/New_York', 'America/Mexico_City',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
$('tz').innerHTML = ZONES.map((z) => `<option>${z}</option>`).join('');
$('tz').value = localStorage.getItem('fy_tz') || 'America/Denver';

// Wall-clock parts of an instant in a zone.
function partsIn(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, asUtc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) };
}
// "2026-10-29" "09:00" in tz → the real instant.
function zonedToUtc(date, time, tz) {
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const wall = Date.UTC(Y, M - 1, D, h, m);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - (partsIn(guess, tz).asUtc - guess);
  return new Date(guess);
}
function describeWhen() {
  if (!$('date').value || !$('time').value) return ($('when').textContent = '');
  const at = zonedToUtc($('date').value, $('time').value, $('tz').value);
  const mine = at.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('when').textContent = `That's ${mine} your time.`;
}
['date', 'time', 'tz'].forEach((id) => $(id).addEventListener('change', describeWhen));
$('tz').addEventListener('change', () => localStorage.setItem('fy_tz', $('tz').value));

// ------------------------------------------------------------------ gate --
async function start() {
  if (!key) return ($('gate').hidden = false);
  try {
    data = await api('/api/admin/items');
    $('gate').hidden = true;
    $('main').hidden = false;
    renderList();
    renderNotes();
  } catch (e) {
    $('gate').hidden = false;
    $('gatemsg').textContent = e.status === 401 ? 'That key didn’t fit.' : 'Couldn’t reach the backend.';
  }
}
$('keygo').onclick = () => { key = $('key').value.trim(); localStorage.setItem('fy_admin', key); start(); };

// ------------------------------------------------------------------ list --
function status(it) {
  if (data.opened[it.id]) return `<span class="pill opened">opened ${new Date(data.opened[it.id]).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>`;
  if (Date.parse(it.unlockAt) <= Date.now()) return '<span class="pill ready">ready, not opened yet</span>';
  return '<span class="pill">locked</span>';
}
function renderList() {
  $('list').innerHTML = data.items.length ? data.items.map((it) => `
    <div class="item"><img src="art/items/${KIND_ART[it.type]}.png" alt="">
      <div class="tx"><b>${esc(it.title)}</b>${status(it)}<br>
        <span class="muted">${new Date(it.unlockAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} your time
        ${it.hasPhoto ? ' · photo' : ''}${it.hasAudio ? ' · voice note' : ''}</span></div>
      <button class="plain" data-edit="${it.id}">edit</button></div>`).join('')
    : '<p class="muted">No surprises yet. The first one is the hardest ♥</p>';
  $('subs').textContent = data.subscribers
    ? `Her phone is signed up for the bells (${data.subscribers} device${data.subscribers > 1 ? 's' : ''}).`
    : 'Her phone hasn’t turned the bells on yet. She does that from the app once it’s on her home screen.';
}
$('list').onclick = (e) => { const id = e.target.dataset.edit; if (id) openEditor(data.items.find((i) => i.id === id)); };

// ---------------------------------------------------------------- editor --
function setType(t) { $('editor').dataset.type = t; $('type').value = t; }
$('type').onchange = () => setType($('type').value);

function mediaUrl(kind, id) { return `${API}/api/${kind}/${id}?k=${encodeURIComponent(key)}&v=${Date.now()}`; }

function openEditor(it) {
  editing = it ? it.id : null;
  pendingAudio = pendingPhoto = null;
  $('recPreview').innerHTML = '';
  $('photo').value = $('audio').value = '';
  $('edtitle').textContent = it ? 'Edit surprise' : 'New surprise';
  $('del').hidden = !it;
  setType(it ? it.type : 'letter');
  $('title').value = it ? it.title : '';
  const tz = $('tz').value;
  const p = it ? partsIn(Date.parse(it.unlockAt), tz) : null;
  $('date').value = p ? p.date : '';
  $('time').value = p ? p.time : '09:00';
  $('body').value = it ? it.body : '';
  $('signoff').value = it ? it.signoff : '';
  $('pname').value = it?.place?.name || ''; $('paddr').value = it?.place?.address || ''; $('purl').value = it?.place?.url || '';
  $('gurl').value = it?.gift?.url || ''; $('glabel').value = it?.gift?.label || ''; $('gcode').value = it?.gift?.code || '';
  $('photoNow').innerHTML = it?.hasPhoto ? `<img class="thumb" src="${mediaUrl('photo', it.id)}"> <button class="plain danger" data-rm="photo">remove</button>` : '';
  $('audioNow').innerHTML = it?.hasAudio ? `<audio controls src="${mediaUrl('audio', it.id)}"></audio> <button class="plain danger" data-rm="audio">remove</button>` : '';
  $('edmsg').textContent = '';
  $('editor').hidden = false;
  describeWhen();
  $('editor').scrollIntoView({ behavior: 'smooth' });
}
$('new').onclick = () => openEditor(null);
$('cancel').onclick = () => ($('editor').hidden = true);

$('editor').addEventListener('click', async (e) => {
  const kind = e.target.dataset.rm;
  if (!kind || !editing) return;
  await api(`/api/admin/${kind}/${editing}`, { method: 'DELETE' });
  $(kind === 'photo' ? 'photoNow' : 'audioNow').innerHTML = '<span class="muted">removed</span>';
  data = await api('/api/admin/items');
  renderList();
});

// Photos go up as JPEG, longest side 1600px.
$('photo').onchange = async () => {
  const f = $('photo').files[0];
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    pendingPhoto = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    $('photoNow').innerHTML = `<img class="thumb" src="${URL.createObjectURL(pendingPhoto)}"> <span class="muted">ready to upload</span>`;
  } catch {
    pendingPhoto = null;
    $('photoNow').innerHTML = '<span class="muted">This browser can’t read that image. Try a JPG, or use Safari.</span>';
  }
};

$('audio').onchange = () => {
  const f = $('audio').files[0];
  if (!f) return;
  pendingAudio = f;
  $('recPreview').innerHTML = `<audio controls src="${URL.createObjectURL(f)}"></audio> <span class="muted">ready to upload</span>`;
};

// Record a voice note right here. mp4/AAC when the browser can, since older
// iPhones can't play the webm that Chrome makes otherwise.
let recorder = null, recClock = null;
$('rec').onclick = async () => {
  if (recorder && recorder.state === 'recording') return recorder.stop();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(recClock);
      pendingAudio = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
      $('rec').textContent = '● Record again';
      $('rec').classList.remove('rec-on');
      const warn = /webm|ogg/.test(pendingAudio.type) ? ' <b>Heads up:</b> this browser recorded webm, which older iPhones can’t play. Record in Safari or upload a Voice Memo.' : '';
      $('recPreview').innerHTML = `<audio controls src="${URL.createObjectURL(pendingAudio)}"></audio> <span class="muted">ready to upload.${warn}</span>`;
    };
    recorder.start();
    const t0 = Date.now();
    $('rec').textContent = '■ Stop';
    $('rec').classList.add('rec-on');
    recClock = setInterval(() => ($('rectime').textContent = `${Math.floor((Date.now() - t0) / 1000)}s`), 250);
  } catch {
    $('rectime').textContent = 'No microphone access.';
  }
};

$('save').onclick = async () => {
  const title = $('title').value.trim();
  if (!title || !$('date').value || !$('time').value) return ($('edmsg').textContent = 'Needs a title, a date and a time.');
  const id = editing || `${$('type').value}-${Date.now().toString(36)}`;
  const body = {
    type: $('type').value,
    title,
    unlockAt: zonedToUtc($('date').value, $('time').value, $('tz').value).toISOString(),
    body: $('body').value,
    signoff: $('signoff').value,
    place: $('type').value === 'place' ? { name: $('pname').value, address: $('paddr').value, url: $('purl').value } : null,
    gift: $('type').value === 'gift' ? { url: $('gurl').value, label: $('glabel').value, code: $('gcode').value } : null,
  };
  $('save').disabled = true;
  $('edmsg').textContent = 'Saving…';
  try {
    await api(`/api/admin/items/${id}`, { method: 'PUT', body });
    if (pendingPhoto) { $('edmsg').textContent = 'Uploading photo…'; await api(`/api/admin/photo/${id}`, { method: 'PUT', body: pendingPhoto, raw: true }); }
    if (pendingAudio) { $('edmsg').textContent = 'Uploading voice note…'; await api(`/api/admin/audio/${id}`, { method: 'PUT', body: pendingAudio, raw: true }); }
    data = await api('/api/admin/items');
    renderList();
    openEditor(data.items.find((i) => i.id === id));
    $('edmsg').textContent = 'Saved ♥';
  } catch (e) {
    $('edmsg').textContent = `Didn’t save: ${e.message}`;
  } finally {
    $('save').disabled = false;
  }
};

$('del').onclick = async () => {
  if (!editing || !confirm('Delete this surprise for good?')) return;
  await api(`/api/admin/items/${editing}`, { method: 'DELETE' });
  $('editor').hidden = true;
  data = await api('/api/admin/items');
  renderList();
};

// ----------------------------------------------------------------- notes --
function renderNotes() {
  const titles = Object.fromEntries(data.items.map((i) => [i.id, i.title]));
  const notes = [...data.notes].reverse();
  $('notes').innerHTML = notes.length ? notes.map((n) => `
    <div class="note"><span class="muted">${new Date(n.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      ${n.itemId && titles[n.itemId] ? ` · on “${esc(titles[n.itemId])}”` : ''}</span>
      ${n.text ? `<div class="t">${esc(n.text)}</div>` : ''}
      ${n.voice ? `<div class="media"><audio controls preload="none" src="${API}/api/admin/voice/${n.voice}?k=${encodeURIComponent(key)}"></audio></div>` : ''}
    </div>`).join('') : '<p class="muted">Nothing yet.</p>';
}

$('testpush').onclick = async () => {
  try {
    const r = await api('/api/admin/test-push', { method: 'POST' });
    $('pushmsg').textContent = r.sent ? 'Rang ♥' : 'No phone signed up yet.';
  } catch (e) { $('pushmsg').textContent = e.message; }
};

start();
