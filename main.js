import './style.css';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';

/* ---------- helpers ---------- */
const $ = (s, e = document) => e.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};
const toast = m => { const t = $('#toast'); t.textContent = m; t.className = 's'; clearTimeout(toast.h); toast.h = setTimeout(() => t.className = '', 2600); };
const ic = (p, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg>`;
const I = { menu: 'M3 6h18M3 12h18M3 18h18', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5', back: 'M15 5l-7 7 7 7', send: 'M3 11l18-8-8 18-2-8z', x: 'M6 6l12 12M18 6L6 18', gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', out: 'M9 4H4v16h5M16 8l4 4-4 4M20 12H9', key: 'M15 7a4 4 0 11-2 7l-8 8v-3h3v-3h3l1-1' };
const GR = ['linear-gradient(#ff885e,#ff516a)', 'linear-gradient(#ffcd6a,#ffa85c)', 'linear-gradient(#82b1ff,#665fff)', 'linear-gradient(#a0de7e,#54cb68)', 'linear-gradient(#53edd6,#28c9b7)', 'linear-gradient(#72d5fd,#2a9ef1)', 'linear-gradient(#e0a2f3,#d669ed)'];
const ini = n => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const av = (d, s = 52) => {
  const bg = d.img ? `url(${d.img}) center/cover` : GR[(d.name.charCodeAt(0) || 0) % 7];
  return `<span class="av" data-av="${d.key}" style="width:${s}px;height:${s}px;background:${bg};font-size:${s * .38}px">${d.img ? '' : esc(ini(d.name))}</span>`;
};
const fmtT = s => { if (!s) return ''; const d = new Date(s * 1000), n = new Date(); return d.toDateString() == n.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const hm = s => new Date(s * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const prev = m => !m ? '' : m.message ? m.message : m.photo ? 'Photo' : m.video ? 'Video' : m.voice ? 'Voice message' : m.sticker ? 'Sticker' : m.document ? 'File' : m.media ? 'Media' : m.action ? 'Service message' : '';
const nice = e => {
  const m = String(e?.errorMessage || e?.message || e);
  if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(m)) return 'Wrong code';
  if (/PHONE_CODE_EXPIRED/.test(m)) return 'Code expired, request a new one';
  if (/PASSWORD_HASH_INVALID/.test(m)) return 'Wrong password';
  if (/PHONE_NUMBER_INVALID/.test(m)) return 'Invalid phone number';
  if (/FLOOD|wait of/i.test(m)) return 'Too many attempts. Wait a while and try again.';
  if (/API_ID_INVALID/.test(m)) return 'API ID / hash is invalid';
  return m;
};
const applyTh = () => document.documentElement.dataset.th = LS.get('tv_th') == 'dark' ? 'dark' : 'light';

/* ---------- state ---------- */
let client, me, D = [], cur = null, view = 'boot', tab = 'all', q = '', searching = false, waiter = null, curStep = '', perr = '';

/* ---------- auth screens ---------- */
function page(body) { $('#app').innerHTML = `<div class="auth"><div class="logo">T</div>${body}</div>`; }
function apiScreen(err = '') {
  return new Promise(res => {
    page(`<h2>Connect Televia</h2><p>Enter your API ID and API hash from my.telegram.org. They are saved only on this device.</p><input id="a1" class="inp" inputmode="numeric" placeholder="API ID"><input id="a2" class="inp" placeholder="API hash" autocomplete="off"><div class="err">${esc(err)}</div><button class="btn" id="go">Continue</button>`);
    $('#go').onclick = () => {
      const id = $('#a1').value.trim(), h = $('#a2').value.trim();
      if (!/^\d+$/.test(id) || !/^[a-f0-9]{32}$/i.test(h)) return apiScreen('API ID must be digits and hash must be 32 characters').then(res);
      LS.set('tv_api_id', id); LS.set('tv_api_hash', h); res();
    };
  });
}
function showAuth(step, err = '') {
  const T = {
    phone: ['Your phone', 'Use the international format, for example +8801XXXXXXXXX.', '<input id="f" class="inp" inputmode="tel" placeholder="+880…" autocomplete="tel">'],
    code: ['Enter the code', 'Telegram sent a code to your Telegram app (or SMS).', '<input id="f" class="inp" inputmode="numeric" maxlength="6" placeholder="•••••" autocomplete="one-time-code">'],
    pw: ['Two-step password', 'Enter your cloud password.', '<input id="f" class="inp" type="password" autocomplete="current-password">']
  }[step];
  page(`<h2>${T[0]}</h2><p>${T[1]}</p>${T[2]}<div class="err">${esc(err)}</div><button class="btn" id="go">Continue</button>`);
  $('#f').focus();
  $('#go').onclick = () => {
    const v = $('#f').value.trim();
    if (!v) return showAuth(step, 'This field is required');
    if (step == 'phone' && !/^\+\d{7,15}$/.test(v.replace(/\s/g, ''))) return showAuth(step, 'Start with + and country code');
    $('#go').textContent = 'Please wait…'; $('#go').disabled = true;
    waiter(step == 'phone' ? v.replace(/\s/g, '') : v);
  };
}
const ask = step => new Promise(r => { waiter = r; curStep = step; showAuth(step, perr); perr = ''; });

/* ---------- boot ---------- */
async function boot() {
  applyTh();
  if (!LS.get('tv_api_id') || !LS.get('tv_api_hash')) await apiScreen();
  client = new TelegramClient(new StringSession(LS.get('tv_sess') || ''), +LS.get('tv_api_id'), LS.get('tv_api_hash'), { connectionRetries: 5, useWSS: true });
  $('#app').innerHTML = '<div class="auth"><div class="logo">T</div><div class="spin"></div><p>Connecting…</p></div>';
  try {
    await client.start({
      phoneNumber: () => ask('phone'), phoneCode: () => ask('code'), password: () => ask('pw'),
      onError: async e => { perr = nice(e); return false; }
    });
  } catch (e) { return fail(e); }
  LS.set('tv_sess', client.session.save());
  try { me = await client.getMe(); await loadDialogs(); } catch (e) { return fail(e); }
  client.addEventHandler(onNew, new NewMessage({}));
  showList(); loadPhotos();
}
function fail(e) {
  page(`<h2>Could not connect</h2><p>${esc(nice(e))}</p><button class="btn" id="r">Try again</button><button class="btn g" id="x">Reset API keys</button>`);
  $('#r').onclick = () => location.reload();
  $('#x').onclick = () => { LS.del('tv_api_id'); LS.del('tv_api_hash'); LS.del('tv_sess'); location.reload(); };
}

/* ---------- data ---------- */
const isMuted = d => { try { return (d.dialog?.notifySettings?.muteUntil || 0) > Date.now() / 1000; } catch { return false; } };
async function loadDialogs() {
  const ds = await client.getDialogs({ limit: 80 });
  D = ds.map(d => ({
    key: String(d.id), name: d.title || d.name || 'Deleted account', entity: d.entity,
    msg: prev(d.message), out: !!d.message?.out, date: d.date || 0, unread: d.unreadCount || 0,
    pinned: !!d.pinned, archived: !!d.archived, muted: isMuted(d),
    kind: d.isUser ? (d.entity?.bot ? 'bot' : 'user') : d.isGroup ? 'group' : 'channel'
  }));
}
async function loadPhotos() {
  for (const d of D.slice(0, 30)) {
    if (d.img) continue;
    try {
      const b = await client.downloadProfilePhoto(d.entity, { isBig: false });
      if (b && b.length) {
        d.img = URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }));
        document.querySelectorAll(`[data-av="${d.key}"]`).forEach(e => { e.style.background = `url(${d.img}) center/cover`; e.textContent = ''; });
      }
    } catch {}
  }
}
function onNew(ev) {
  const m = ev.message, key = String(m.chatId), d = D.find(x => x.key == key);
  if (!d) { loadDialogs().then(() => view == 'list' && refreshList()); return; }
  d.msg = prev(m); d.date = m.date; d.out = !!m.out;
  if (cur && cur.key == key && view == 'chat') { cur.msgs.push(m); renderMsgs(); client.markAsRead(cur.entity).catch(() => {}); }
  else if (!m.out) d.unread++;
  if (view == 'list') refreshList();
}

/* ---------- chat list ---------- */
const TABS = [['all', 'All'], ['user', 'Personal'], ['unread', 'Unread'], ['group', 'Groups'], ['channel', 'Channels'], ['bot', 'Bots'], ['archive', 'Archived']];
function listItems() {
  let a = D.filter(d => tab == 'archive' ? d.archived : !d.archived);
  if (['user', 'group', 'channel', 'bot'].includes(tab)) a = a.filter(d => d.kind == tab);
  if (tab == 'unread') a = a.filter(d => d.unread);
  if (q) a = a.filter(d => d.name.toLowerCase().includes(q.toLowerCase()));
  return a.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || y.date - x.date);
}
const rowH = d => `<div class="chat" data-k="${d.key}">${av(d, 54)}<div class="m"><div class="l1"><b>${esc(d.name)}</b><time>${fmtT(d.date)}</time></div><div class="l2"><span>${d.out && d.kind != 'channel' ? 'You: ' : ''}${esc(d.msg)}</span>${d.unread ? `<span class="bd ${d.muted ? 'm' : ''}" style="flex:none">${d.unread > 999 ? '999+' : d.unread}</span>` : ''}</div></div></div>`;
function refreshList() { const a = listItems(); $('#lb').innerHTML = a.length ? a.map(rowH).join('') : '<div class="empty">No chats here</div>'; }
function showList() {
  view = 'list'; cur = null;
  $('#app').innerHTML = `<header class="bar">${searching ? `<button class="ib" data-a="unsearch" aria-label="Close search">${ic(I.back)}</button><input id="q" placeholder="Search" value="${esc(q)}">` : `<button class="ib" data-a="drawer" aria-label="Menu">${ic(I.menu)}</button><h1>Televia</h1><button class="ib" data-a="search" aria-label="Search">${ic(I.search)}</button>`}</header><nav class="tabs">${TABS.map(t => `<button class="${tab == t[0] ? 'on' : ''}" data-a="tab" data-p="${t[0]}">${t[1]}</button>`).join('')}</nav><main class="pg" id="lb"></main>`;
  refreshList();
  if (searching) { const i = $('#q'); i.focus(); i.oninput = () => { q = i.value; refreshList(); }; }
}

/* ---------- chat ---------- */
async function openChat(key) {
  const d = D.find(x => x.key == key); if (!d) return;
  cur = d; view = 'chat'; history.pushState({ v: 'chat' }, '');
  $('#app').innerHTML = `<header class="bar"><button class="ib" data-a="back" aria-label="Back">${ic(I.back)}</button>${av(d, 40)}<h1>${esc(d.name)}</h1></header><div class="msgs" id="ms"><div class="spin"></div></div><div class="comp"><textarea id="ti" rows="1" placeholder="Message" aria-label="Message"></textarea><button class="snd" data-a="send" aria-label="Send">${ic(I.send)}</button></div>`;
  const t = $('#ti'); t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; };
  try { d.msgs = (await client.getMessages(d.entity, { limit: 50 })).reverse(); } catch (e) { d.msgs = []; toast('Could not load messages: ' + nice(e)); }
  if (cur != d) return;
  renderMsgs();
  if (d.unread) { d.unread = 0; client.markAsRead(d.entity).catch(() => {}); }
}
const sn = m => { try { const s = m.sender; return s ? (s.firstName || s.title || '') : ''; } catch { return ''; } };
function renderMsgs() {
  const el = $('#ms'); if (!el || !cur) return;
  let h = '', last = '';
  if (!cur.msgs.length) h = '<div class="empty" style="margin:auto">No messages yet</div>';
  for (const m of cur.msgs) {
    const day = new Date(m.date * 1000).toDateString();
    if (day != last) { last = day; h += `<div class="svc">${new Date(m.date * 1000).toLocaleDateString([], { month: 'long', day: 'numeric' })}</div>`; }
    if (m.action && !m.message) { h += `<div class="svc">Service message</div>`; continue; }
    const media = !m.message && prev(m) ? `<div class="md">[${esc(prev(m))}]</div>` : (m.media && m.message ? `<div class="md">[${esc(prev({ ...m, message: '' }) || 'Media')}]</div>` : '');
    h += `<div class="b ${m.out ? 'me' : ''}">${cur.kind == 'group' && !m.out ? `<div class="nm">${esc(sn(m))}</div>` : ''}${media}${esc(m.message || '')}<span class="ft">${hm(m.date)}</span></div>`;
  }
  el.innerHTML = h; el.scrollTop = el.scrollHeight;
}
async function sendMsg() {
  const t = $('#ti'), v = t.value.trim(); if (!v || !cur) return;
  t.value = ''; t.style.height = 'auto';
  try {
    const m = await client.sendMessage(cur.entity, { message: v });
    cur.msgs.push(m); cur.msg = v; cur.out = true; cur.date = m.date; renderMsgs();
  } catch (e) { t.value = v; toast('Send failed: ' + nice(e)); }
}

/* ---------- drawer & settings ---------- */
function drawer() {
  const d = { key: 'me', name: [me.firstName, me.lastName].filter(Boolean).join(' ') || 'Me' };
  $('#app').insertAdjacentHTML('beforeend', `<div class="sc" data-a="close"></div><nav class="dr"><div class="hd">${av(d, 64)}<div style="font-weight:600;margin-top:8px">${esc(d.name)}</div><small>${me.username ? '@' + esc(me.username) : ''}</small></div><div class="row" data-a="settings">${ic(I.gear)}<div class="t">Settings</div></div><div class="row" data-a="logout">${ic(I.out)}<div class="t">Log out</div></div></nav>`);
}
function settings() {
  view = 'settings'; history.pushState({ v: 's' }, '');
  const dark = LS.get('tv_th') == 'dark';
  $('#app').innerHTML = `<header class="bar"><button class="ib" data-a="back" aria-label="Back">${ic(I.back)}</button><h1>Settings</h1></header><main class="pg"><div class="row" data-a="dark"><div class="t">Dark mode</div><i class="sw ${dark ? 'on' : ''}"></i></div><div class="row" data-a="reset">${ic(I.key)}<div class="t">Reset API keys<small>Log out and enter new keys</small></div></div><div class="row" data-a="logout">${ic(I.out)}<div class="t">Log out</div></div><div class="row" style="cursor:default"><div class="t"><small>Televia 1.0. Your session is stored on this device only.</small></div></div></main>`;
}
async function logout() {
  if (!confirm('Log out of Televia on this device?')) return;
  try { await client.invoke(new Api.auth.LogOut()); } catch {}
  LS.del('tv_sess'); location.reload();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const k = e.target.closest('.chat[data-k]'); if (k) return openChat(k.dataset.k);
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, p = el.dataset.p;
  if (a == 'tab') { tab = p; showList(); }
  else if (a == 'search') { searching = true; showList(); }
  else if (a == 'unsearch') { searching = false; q = ''; showList(); }
  else if (a == 'drawer') drawer();
  else if (a == 'close') { $('.sc')?.remove(); $('.dr')?.remove(); }
  else if (a == 'settings') settings();
  else if (a == 'dark') { LS.set('tv_th', LS.get('tv_th') == 'dark' ? 'light' : 'dark'); applyTh(); settings(); }
  else if (a == 'back') history.back();
  else if (a == 'send') sendMsg();
  else if (a == 'logout') logout();
  else if (a == 'reset') { if (confirm('Log out and clear API keys?')) { LS.del('tv_api_id'); LS.del('tv_api_hash'); LS.del('tv_sess'); location.reload(); } }
});
window.addEventListener('popstate', () => { if (view == 'chat' || view == 'settings') { showList(); } });
document.addEventListener('keydown', e => {
  if (e.key == 'Enter' && !e.shiftKey && e.target.id == 'ti' && !/Android|iPhone/i.test(navigator.userAgent)) { e.preventDefault(); sendMsg(); }
});
boot();
