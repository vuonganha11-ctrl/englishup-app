/* EnglishUp · lõi dùng chung cho mọi trang */
export const SUPABASE_URL = 'https://fyglubimflzsetcovgqx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_';

/* Lịch giãn cách CỐ ĐỊNH. Kim & Webb (2022) meta-analysis 48 thí nghiệm:
   equal spacing ≈ expanding spacing, không khác biệt thống kê -> không cần SM-2/FSRS. */
export const LADDER = [1, 3, 7, 14, 30, 60, 120];

export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const today  = () => new Date().toISOString().slice(0, 10);
export const addDays = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
export const esc = s => String(s ?? '').replace(/[<>&"]/g,
  c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

export async function api(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
               'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? null : r.json();
}

/* ── Hồ sơ: không mật khẩu, chỉ tách dữ liệu ── */
const PKEY = 'englishup_profile';
export const getProfile = () => JSON.parse(localStorage.getItem(PKEY) || 'null');
export const setProfile = p => localStorage.setItem(PKEY, JSON.stringify(p));
export const clearProfile = () => localStorage.removeItem(PKEY);

export function requireProfile() {
  const p = getProfile();
  if (!p) { location.href = 'index.html'; return null; }
  return p;
}

/* ── Đọc to. Dùng chung mọi trang. ── */
export function speak(text, rate = 0.8) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = rate;
  const v = speechSynthesis.getVoices().find(v => /^en[-_]US/.test(v.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ── Bấm tra từ: lưu vào sổ của người đang dùng ──
   Đây là trung tâm của cả app. Từ do người học TỰ CHỌN lúc họ đang cần,
   trong ngữ cảnh thật -> đúng trình độ, đúng động lực. NGSL chỉ là từ điển. */
export async function lookup(term, { source = '', context = '', topic = '' } = {}) {
  const p = getProfile();
  if (!p) return null;
  const clean = term.toLowerCase().replace(/[^a-z'-]/g, '');
  if (!clean) return null;

  // tra trong NGSL
  let w = null;
  try {
    const r = await api(`words?select=id,term,phonetic,definition_vi,part_of_speech,word_family`
      + `&term=ilike.${encodeURIComponent(clean)}&limit=1`);
    w = r[0] || null;
  } catch (e) { /* ngoại tuyến -> vẫn lưu được, thiếu nghĩa thôi */ }

  const row = {
    profile_id: p.id, term: clean,
    phonetic: w?.phonetic || null, definition_vi: w?.definition_vi || null,
    word_id: w?.id || null, topic: topic || null,
    source, context: context.slice(0, 200),
  };
  try {
    await api('saved_words', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) { console.warn('luu that bai', e.message); }
  return { ...row, ...(w || {}) };
}

/* ── Chấm SRS. q: 0=Quên 1=Khó 2=Được 3=Dễ ── */
export function nextState(c, q) {
  const s = { step: c.step ?? -1, reps: c.reps ?? 0, lapses: c.lapses ?? 0 };
  if (q === 0)      { s.step = -1; s.lapses++; }
  else if (q === 1) { s.step = Math.max(0, s.step); }
  else              { s.step = Math.min(s.step + (q === 3 ? 2 : 1), LADDER.length - 1); }
  s.reps++;
  s.interval = q === 0 ? 1 : LADDER[Math.max(0, s.step)];
  s.due = addDays(s.interval);
  return s;
}

/* ── Biến text thành các <b> bấm được để tra ── */
export function clickable(text) {
  // Tách token TRƯỚC rồi mới escape từng mảnh.
  // Nếu escape trước, regex sẽ khớp vào trong entity: &lt; -> &<b>lt</b>;
  return String(text ?? '').replace(/[A-Za-z][A-Za-z'-]*|[^A-Za-z]+/g, tok =>
    (/^[A-Za-z]/.test(tok) && tok.length > 1)
      ? `<b class="w" data-w="${esc(tok)}">${esc(tok)}</b>`
      : esc(tok));
}
export function bindLookup(root, opts = {}) {
  root.addEventListener('click', async e => {
    const b = e.target.closest('.w');
    if (!b) return;
    b.classList.add('saved');
    const r = await lookup(b.dataset.w, { ...opts, context: root.textContent.slice(0, 200) });
    speak(b.dataset.w, 0.85);
    showPop(b, r);
  });
}
function showPop(el, r) {
  $$('.pop').forEach(p => p.remove());
  const d = document.createElement('div');
  d.className = 'pop';
  d.innerHTML = r?.definition_vi
    ? `<b>${esc(r.term)}</b> <i>${esc(r.phonetic || '')}</i><br>${esc(r.definition_vi)}
       <small>đã lưu vào sổ từ ✓</small>`
    : `<b>${esc(r?.term || '')}</b><br>Chưa có trong từ điển<small>vẫn lưu vào sổ ✓</small>`;
  el.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

/* ── Thanh điều hướng dùng chung ── */
export function nav(active) {
  const p = getProfile();
  const items = [['tuvung','📒','Từ vựng'], ['nghe','🎧','Nghe'],
                 ['noi','🗣️','Nói'], ['game','🎮','Game']];
  return `<nav class="eu-nav">
    <a class="brand" href="index.html">EnglishUp</a>
    <div class="tabs">${items.map(([k, i, l]) =>
      `<a href="${k}.html" class="${k === active ? 'on' : ''}">${i}<span>${l}</span></a>`).join('')}</div>
    <a class="who" href="index.html" title="Đổi người">${p ? p.emoji + ' ' + p.name : '👤'}</a>
  </nav>`;
}
