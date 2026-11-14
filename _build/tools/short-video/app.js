const KEY = 'ilsang_shortvideo_v1';
const ST = { step: 1, type: 'promo', fields: {}, feats: [], plan: 'A', pal: null, ph: { hook: 0, end: 0 }, scenes: [], plans: null, media: [], bgm: null, voice: null };
const PLAN_INFO = {
  A: ['A 첫마디형', '짧은 문구로 시작해 한 화면에 하나씩 빠르게 넘깁니다. 처음 보는 사람에게 알릴 때'],
  B: ['B 정보형', '가격·날짜·시간·위치를 한 화면에 모아 차례로 보여 줍니다. 단골·주민에게 소식 전할 때'],
  C: ['C 이야기형', '가운데 정렬, 느린 호흡으로 그림을 크게 보여 줍니다. 사진이 3장 이상일 때 잘 어울림']
};
const DEF_PAL = { A: 'p0', B: 'p8', C: 'p9' }; // 먹색·크림·흰색
const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const ratio = () => radio('ratio'), len = () => +radio('len'), mood = () => radio('mood');
const pal = () => ST.pal === 'custom' && ST.custom ? makePalette('custom', '직접', ST.custom.bg, ST.custom.fg, ST.custom.ac) : (PALETTES.find(p => p.id === (ST.pal || DEF_PAL[ST.plan])) || PALETTES[0]);

/* ---- 1단계 ---- */
$('#types').innerHTML = Object.entries(TYPES).map(([k, v]) => `<label><input type="radio" name="type" value="${k}"${k === 'promo' ? ' checked' : ''}><span>${v.name}</span></label>`).join('');
const TYPE_HINT = {
  promo: '가게·상품·메뉴·서비스를 알릴 때', event: '날짜와 장소가 있는 행사를 알릴 때', recruit: '사람을 모집할 때 (대상·기간·지원 방법)',
  org: '기관·단체의 안내·캠페인', free: '위 네 가지에 맞지 않을 때. 입력한 문장 한 줄이 장면 하나가 되고, 빠진 항목은 묻지 않습니다.'
};
const showTypeHint = () => { ST.type = radio('type'); $('#typeHint').textContent = TYPE_HINT[ST.type]; };
$$('input[name=type]').forEach(r => r.addEventListener('change', showTypeHint));

function mediaHtml(){
  $('#mediaList').innerHTML = ST.media.map((m, i) => `<div class="m">${m.type === 'video' ? `<video src="${m.url}" muted playsinline></video>` : `<img src="${m.url}" alt="">`}<b>${i + 1}</b><button type="button" data-del="${i}" aria-label="${i + 1}번 빼기">×</button></div>`).join('');
}
$('#mediaIn').addEventListener('change', async e => {
  const files = Array.from(e.target.files).filter(f => /^(image|video)\//.test(f.type));
  for (const f of files) {
    if (ST.media.length >= 8) { toast('최대 8개까지 넣을 수 있습니다'); break; }
    const url = URL.createObjectURL(f), type = f.type.startsWith('video') ? 'video' : 'image';
    const el = type === 'video' ? Object.assign(document.createElement('video'), { src: url, muted: true, playsInline: true, preload: 'auto', loop: true }) : new Image();
    if (type === 'image') el.src = url;
    await new Promise(ok => { if (type === 'video') { el.onloadeddata = ok; el.onerror = ok; } else { el.onload = ok; el.onerror = ok; } });
    ST.media.push({ name: f.name, type, url, el });
  }
  e.target.value = ''; mediaHtml(); ST.plans = null;
  readAllText();
});
$('#mediaList').addEventListener('click', e => {
  const i = e.target.dataset.del; if (i == null) return;
  URL.revokeObjectURL(ST.media[i].url); ST.media.splice(+i, 1); mediaHtml(); ST.plans = null;
});

/* 사진 속 글자 읽기: 순서대로 하나씩, 끝나면 구성안을 다시 짬 */
let reading = false;
async function readAllText(){
  if (reading) return; reading = true;
  const todo = () => ST.media.filter(m => m.type === 'image' && !m.lines && !m.failed);
  let m;
  while ((m = todo()[0])) {
    $('#mediaHint').textContent = `사진 속 글자를 읽는 중입니다 (${ST.media.indexOf(m) + 1}번). 처음에는 글자 인식 자료를 받느라 조금 걸립니다.`;
    try { m.lines = await readMediaText(m); } catch (_) { m.failed = true; }
    if (ST.step < 4) ST.plans = null;
  }
  const n = ST.media.filter(x => x.lines && x.lines.length).length;
  $('#mediaHint').textContent = n ? `사진 ${n}장에서 글자를 읽었습니다. 장면 글과 같은 낱말이 있는 곳을 가까이 보여 줍니다.` : '사진을 넣었습니다.';
  reading = false;
}
/* 사진을 넣었을 때 구성안 손보기
   - 휴대폰 화면 캡처가 있으면 첫 장면과 누리집 주소 장면을 '손에 든 휴대폰'으로
   - 사진을 가까이 보여 주는 장면은 장면 글과 같은 낱말이 있는 곳으로 */
const bgOf = () => /소방|화재|119|출동|구조|구급|안전/.test(val('text') + ' ' + Object.values(ST.fields).join(' ')) ? 'fire' : 'city';
const sceneText = sc => sc.kind === 'list' ? '' : sc.lines.map(l => l.t).join(' ');
function adaptToMedia(list){
  const tall = ST.media.map((m, i) => isTallShot(m) ? i : -1).filter(i => i >= 0), used = [];
  list.forEach(sc => {
    const urlish = sc.lines && sc.lines.some(l => /https?:|\.(io|com|kr|net|org|me)(\/|$|\s)/.test(l.t));
    if (tall.length && sc.role === 'hook') { sc.visual = { g: 'handheld', media: tall[0], bg: bgOf() }; return; }
    if (tall.length && urlish) { sc.visual = { g: 'handheld', media: tall[tall.length - 1], bg: bgOf() }; return; }
    if (sc.visual && sc.visual.detail != null) {
      const a = aimAt(sceneText(sc), ST.media, used);
      if (a) { Object.assign(sc.visual, { media: a.k, fx: a.fx, fy: a.fy }); used.push(a); }
    }
  });
  return list;
}

/* ---- 2단계: 항목 확인 ---- */
function buildFieldForm(){
  const T0 = TYPES[ST.type], text = val('text');
  const ex = extractFields(ST.type, text);
  T0.fields.forEach(([k]) => { if (!ST.fields[k] && ex[k]) ST.fields[k] = ex[k]; });
  const missing = T0.fields.filter(([k]) => !ST.fields[k]).length;
  $('#askHint').textContent = ST.type === 'free' ? '직접 구성은 빠진 항목을 묻지 않습니다. 마지막 장면에 넣을 이름만 필요하면 적으세요.'
    : missing ? `${T0.name} 영상에 보통 들어가는 항목 중 ${missing}개가 비어 있습니다. 넣을 것만 채우세요. 비워 두면 영상에서 뺍니다.` : '필요한 항목을 모두 찾았습니다. 틀린 곳만 고치세요.';
  $('#fieldList').innerHTML = T0.fields.map(([k, lab, ph]) => {
    const v = ST.fields[k] || '', cls = v ? '' : (T0.must.includes(k) ? 'ask must' : 'ask');
    return `<div class="fld ${cls}" data-f="${k}"><label for="f_${k}">${lab}</label><input type="text" id="f_${k}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  }).join('');
  if (!ST.featsTouched) {
    ST.feats = ST.type === 'free' ? text.split(/\n+|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).slice(0, 10) : featureLines(text, ST.fields);
    $('#feats').value = ST.feats.join('\n');
  }
  $('#featTitle').textContent = ST.type === 'free' ? '장면 글 (한 줄 = 한 장면)' : '강조할 문장';
}
$('#fieldList').addEventListener('input', e => {
  const box = e.target.closest('.fld'); if (!box) return;
  ST.fields[box.dataset.f] = e.target.value.trim();
  box.classList.toggle('ask', !e.target.value.trim()); if (e.target.value.trim()) box.classList.remove('must');
  ST.plans = null;
});
$('#feats').addEventListener('input', () => { ST.featsTouched = true; ST.feats = $('#feats').value.split('\n').map(s => s.trim()).filter(Boolean); ST.plans = null; });
$$('input[name=mood]').forEach(r => r.addEventListener('change', () => { ST.plans = null; if (!ST.trackPicked) ST.track = null; }));

/* ---- 3단계: 구성안 ---- */
function makePlans(){
  const raw = buildPlans(ST.type, ST.fields, ST.feats, ST.media.length, mood(), ST.ph);
  ST.plans = {};
  for (const k of ['A', 'B', 'C']) ST.plans[k] = fitDurations(adaptToMedia(raw[k]), len(), mood(), k, false);
}
$('#pals').innerHTML = PAL_GROUPS.map(([g]) => `<p class="pg">${g}</p><div class="pgl">` + PALETTES.filter(p => p.group === g).map(p => `<button type="button" data-pal="${p.id}"><i><em style="background:${p.bg}"></em><em style="background:${p.fg}"></em><em style="background:${p.ac}"></em></i>${p.name}</button>`).join('') + '</div>').join('') +
  `<p class="pg">직접 고르기</p><div class="custom"><button type="button" data-pal="custom">직접 만든 색 쓰기</button><label>배경<input type="color" id="cBg" value="#151515"></label><label>글자<input type="color" id="cFg" value="#FFFFFF"></label><label>강조<input type="color" id="cAc" value="#E8B04B"></label></div><p class="warn-line hidden" id="cWarn"></p>`;
function readCustom(){
  ST.custom = { bg: $('#cBg').value.toUpperCase(), fg: $('#cFg').value.toUpperCase(), ac: $('#cAc').value.toUpperCase() };
  const c1 = contrast(ST.custom.bg, ST.custom.fg), c2 = contrast(ST.custom.bg, ST.custom.ac), w = $('#cWarn');
  const msg = c1 < 4.5 ? `배경과 글자색 차이가 작아 글이 잘 안 보일 수 있습니다 (대비 ${c1.toFixed(1)}, 4.5 이상 권장).` : c2 < 3 ? `강조색이 배경과 비슷해 눈에 잘 띄지 않습니다 (대비 ${c2.toFixed(1)}, 3 이상 권장).` : '';
  w.textContent = msg; w.classList.toggle('hidden', !msg);
}
['cBg', 'cFg', 'cAc'].forEach(id => $('#' + id).addEventListener('input', () => { readCustom(); ST.pal = 'custom'; ST.palPicked = true; markPal(); drawPlanThumbs(); save(); }));
readCustom();
$('#pals').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (!b) return; ST.pal = b.dataset.pal; markPal(); drawPlanThumbs(); save(); });
const markPal = () => $$('#pals button').forEach(b => b.classList.toggle('on', b.dataset.pal === pal().id));

const thumbs = {};
function renderPlans(){
  $('#plans').innerHTML = ['A', 'B', 'C'].map(k => `<div class="plan${ST.plan === k ? ' on' : ''}" data-plan="${k}"><canvas data-th="${k}"></canvas><h3>${PLAN_INFO[k][0]}</h3><p>${PLAN_INFO[k][1]} · ${ST.plans[k].length}장면</p></div>`).join('');
  ['A', 'B', 'C'].forEach(k => { const st = new Stage($(`[data-th="${k}"]`)); st.media = ST.media; st.setup(ratio(), 0.22); thumbs[k] = { st, t: 0, playing: false }; });
  drawPlanThumbs(); markPal();
}
function drawPlanThumbs(){
  ['A', 'B', 'C'].forEach(k => { const th = thumbs[k]; if (!th) return; const sc = ST.plans[k], { i, local } = sceneAt(sc, th.t || 0.9); th.st.idx = i; th.st.draw(sc[i], th.playing ? local : 1.6, pal()); });
}
let thumbRAF = null;
$('#plans').addEventListener('click', e => {
  const card = e.target.closest('[data-plan]'); if (!card) return;
  const k = card.dataset.plan;
  if (ST.plan !== k) { ST.plan = k; if (!ST.palPicked) ST.pal = null; }
  $$('.plan').forEach(p => p.classList.toggle('on', p.dataset.plan === k)); markPal();
  // 누른 구성안 미리보기 재생
  Object.values(thumbs).forEach(t => t.playing = false);
  const th = thumbs[k]; th.playing = true; const t0 = performance.now();
  cancelAnimationFrame(thumbRAF);
  const loop = () => { if (!th.playing) return; th.t = (performance.now() - t0) / 1000; if (th.t > totalOf(ST.plans[k])) { th.playing = false; th.t = 0; } drawPlanThumbs(); thumbRAF = requestAnimationFrame(loop); };
  loop();
});
$('#pals').addEventListener('click', () => ST.palPicked = true);

/* ---- 4단계: 다듬기 ---- */
const stage = new Stage($('#stage'));
const player = { t: 0, playing: false, raf: null, onEnd: null, lastI: -1 };
function stageSetup(){
  stage.media = ST.media;
  const [W, H] = RATIOS[ratio()];
  stage.setup(ratio(), Math.min(1, 720 / Math.max(W, H)));
}
function syncMedia(sc, local, playing){
  ST.media.forEach((m, i) => {
    if (m.type !== 'video') return;
    const on = sc.visual && sc.visual.media === i;
    if (!on) { if (!m.el.paused) m.el.pause(); return; }
    if (playing) { if (m.el.paused) { try { m.el.currentTime = local % (m.el.duration || 1e9); } catch (_) {} m.el.play().catch(() => {}); } }
    else { m.el.pause(); if (Math.abs(m.el.currentTime - local) > 0.3) try { m.el.currentTime = local % (m.el.duration || 1e9); } catch (_) {} }
  });
}
function drawAt(t){
  const sc = ST.scenes; if (!sc.length) return;
  const { i, local } = sceneAt(sc, t);
  if (i !== player.lastI) { $$('#sceneList .sc').forEach((el, k) => el.classList.toggle('cur', k === i)); player.lastI = i; }
  syncMedia(sc[i], local, player.playing);
  stage.idx = i; stage.prog = t / totalOf(sc); stage.draw(sc[i], local, pal());
  const tot = totalOf(sc);
  $('#seek').max = tot; $('#seek').value = t; $('#tm').textContent = `${fmt(t)} / ${fmt(tot)}`;
}
function play(from, onEnd){
  player.playing = true; player.onEnd = onEnd || null; $('#play').textContent = '멈춤';
  const t0 = performance.now() - (from || 0) * 1000;
  ST.media.forEach(m => m.type === 'video' && m.el.pause());
  const loop = () => {
    if (!player.playing) return;
    player.t = (performance.now() - t0) / 1000;
    if (player.t >= totalOf(ST.scenes)) { pause(); player.t = 0; drawAt(totalOf(ST.scenes) - 0.01); const cb = player.onEnd; player.onEnd = null; if (cb) cb(); return; }
    drawAt(player.t); player.raf = requestAnimationFrame(loop);
  };
  loop();
}
function pause(){ player.playing = false; cancelAnimationFrame(player.raf); $('#play').textContent = '재생'; ST.media.forEach(m => m.type === 'video' && m.el.pause()); }
$('#play').addEventListener('click', () => player.playing ? pause() : play(player.t >= totalOf(ST.scenes) - 0.05 ? 0 : player.t));
$('#seek').addEventListener('input', () => { pause(); player.t = +$('#seek').value; drawAt(player.t); });

function visOptions(s){
  const auto = s.autoVisual ? '<option value="auto">자동 그림</option>' : '';
  const media = ST.media.map((m, i) => `<option value="m${i}">${m.type === 'video' ? '영상' : '사진'} ${i + 1}</option>` + (isTallShot(m) ? `<option value="h${i}">손에 든 휴대폰 ${i + 1}</option>` : '')).join('');
  const cur = !s.visual ? 'none' : s.visual.g === 'handheld' ? 'h' + s.visual.media : s.visual.media != null ? 'm' + s.visual.media : 'auto';
  return `<select data-k="vis" aria-label="그림">${auto}${media}<option value="none">그림 없음</option></select>`.replace(`value="${cur}"`, `value="${cur}" selected`);
}
/* ---- 만들기 전 점검: 글 넘침·읽을 시간·사진 위치·같은 그림 반복·색 대비·전체 길이 ---- */
const sameVis = (a, b) => a && b && a.g === b.g && a.media === b.media && a.topic === b.topic && a.shot === b.shot && a.detail === b.detail && a.fx === b.fx;
function reviewIssues(){
  const out = [], P = pal(), S = ST.scenes;
  const c = contrast(P.bg, P.fg); if (c < 4.5) out.push({ i: -1, bad: 1, m: `글자색과 배경색 차이가 작아 글이 잘 안 보입니다 (대비 ${c.toFixed(1)}). 색 조합을 바꾸세요.` });
  S.forEach((s, i) => {
    const n = i + 1;
    if (s.kind !== 'list' && !s.lines.some(l => l.t.trim())) out.push({ i, bad: 1, m: `${n}번 장면에 글이 없습니다.` });
    const r = stage.measure(s);
    if (!r.fit) out.push({ i, bad: 1, m: `${n}번 장면: 글이 칸을 넘쳐 잘립니다. 글을 줄이세요.` });
    else if (r.k < 0.6) out.push({ i, m: `${n}번 장면: 글이 길어 글자가 작게 나옵니다. 줄이면 더 잘 보입니다.` });
    const need = needOf(s) * 0.8; if (s.d < need) out.push({ i, bad: 1, m: `${n}번 장면: ${s.d}초는 글을 다 읽기에 짧습니다 (${need.toFixed(1)}초 이상).` });
    const v = s.visual, m = v && v.media != null ? ST.media[v.media] : null;
    if (v && v.media != null && !m) out.push({ i, bad: 1, m: `${n}번 장면: 쓰던 사진이 빠졌습니다. 그림을 다시 고르세요.` });
    if (m && m.type === 'image' && v.detail != null && v.fx == null) out.push({ i, m: `${n}번 장면: 사진의 어느 부분을 보여 줄지 자동으로 정하지 못했습니다. '위치'로 확인하세요.` });
    if (i && sameVis(S[i - 1].visual, v)) out.push({ i, m: `${n}번 장면: 앞 장면과 같은 그림입니다.` });
  });
  const off = totalOf(S) - len(); if (Math.abs(off) >= 1.5) out.push({ i: -1, m: `전체 ${totalOf(S).toFixed(1)}초로 목표 ${len()}초와 ${Math.abs(off).toFixed(1)}초 차이 납니다. '시간 다시 나누기'를 누르세요.` });
  return out;
}
function showReview(){
  if (!ST.scenes.length) return;
  const L = reviewIssues(), box = $('#review');
  box.innerHTML = L.length ? `<b>만들기 전 점검 ${L.length}건</b><ul>` + L.map(x => `<li class="${x.bad ? 'bad' : ''}" data-i="${x.i}">${esc(x.m)}</li>`).join('') + '</ul>' : '<b class="ok">만들기 전 점검: 고칠 곳이 없습니다</b>';
}
$('#review').addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li || +li.dataset.i < 0) return;
  const b = $(`#sceneList .sc[data-i="${li.dataset.i}"] .hd b`); if (b) { b.click(); b.closest('.sc').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
});
function sumInfo(){
  const tot = totalOf(ST.scenes), tg = len(), off = tot - tg;
  $('#sumInfo').textContent = `전체 ${tot.toFixed(1)}초 · 목표 ${tg}초` + (Math.abs(off) < 1 ? '' : off > 0 ? ` (${off.toFixed(1)}초 김)` : ` (${(-off).toFixed(1)}초 짧음)`) + (Math.abs(off) >= 1 ? ' · 시간 다시 나누기를 누르면 맞춰집니다' : '');
}
$('#refit').addEventListener('click', () => {
  if (!ST.scenes.length) return;
  fitDurations(ST.scenes, len(), mood(), ST.plan, true);
  renderScenes(); toast(`글 길이에 맞춰 ${totalOf(ST.scenes).toFixed(1)}초로 나눴습니다`);
});
function renderScenes(){
  $('#sceneList').innerHTML = ST.scenes.map((s, i) => {
    const inputs = s.kind === 'list'
      ? s.rows.map((r, j) => `<input type="text" data-row="${j}" value="${esc(r[0] + ' | ' + r[1])}" aria-label="정보 ${j + 1}">`).join('') + '<p class="hint" style="margin:0">"이름 | 내용" 형식</p>'
      : s.lines.map((l, j) => `<input type="text" data-line="${j}" value="${esc(l.t)}" aria-label="장면 ${i + 1} 글 ${j + 1}">`).join('');
    return `<div class="sc" data-i="${i}"><div class="hd"><b>장면 ${i + 1}</b><span class="dur"><button type="button" data-a="dm" aria-label="짧게">−</button>${s.d.toFixed(1)}초<button type="button" data-a="dp" aria-label="길게">+</button></span><span class="sp"></span>${s.kind === 'list' ? '' : visOptions(s)}${s.visual && s.visual.media != null && ST.media[s.visual.media] && ST.media[s.visual.media].type === 'image' ? '<button type="button" class="aim" data-a="aim">위치</button>' : ''}<button type="button" data-a="up" aria-label="위로">↑</button><button type="button" data-a="dn" aria-label="아래로">↓</button><button type="button" data-a="del" aria-label="삭제">×</button></div>${inputs}</div>`;
  }).join('');
  player.lastI = -1; drawAt(Math.min(player.t, totalOf(ST.scenes) - 0.01)); sumInfo(); showReview();
  save();
}
$('#sceneList').addEventListener('input', e => {
  const box = e.target.closest('.sc'); if (!box) return; const s = ST.scenes[+box.dataset.i];
  if (e.target.dataset.line != null) s.lines[+e.target.dataset.line].t = e.target.value;
  if (e.target.dataset.row != null) { const [a, ...b] = e.target.value.split('|'); s.rows[+e.target.dataset.row] = [a.trim(), b.join('|').trim()]; }
  if (!player.playing) drawAt(player.t); save();
});
$('#sceneList').addEventListener('change', e => {
  if (e.target.dataset.k !== 'vis') return;
  const s = ST.scenes[+e.target.closest('.sc').dataset.i], v = e.target.value;
  s.visual = v === 'none' ? null : v === 'auto' ? s.autoVisual : v[0] === 'h' ? { g: 'handheld', media: +v.slice(1), bg: bgOf() } : { media: +v.slice(1) };
  renderScenes();
});
$('#sceneList').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) { const box = e.target.closest('.sc'); if (box && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { pause(); let acc = 0; for (let k = 0; k < +box.dataset.i; k++) acc += ST.scenes[k].d; player.t = acc + Math.min(1.6, ST.scenes[+box.dataset.i].d - 0.1); drawAt(player.t); } return; }
  const i = +b.closest('.sc').dataset.i, S0 = ST.scenes, a = b.dataset.a;
  if (a === 'aim') { openPick(i); return; }
  if (a === 'dm') S0[i].d = Math.max(1.5, S0[i].d - 0.5);
  if (a === 'dp') S0[i].d = Math.min(15, S0[i].d + 0.5);
  if (a === 'up' && i > 0) [S0[i - 1], S0[i]] = [S0[i], S0[i - 1]];
  if (a === 'dn' && i < S0.length - 1) [S0[i + 1], S0[i]] = [S0[i], S0[i + 1]];
  if (a === 'del') { if (S0.length <= 1) { toast('장면이 하나는 있어야 합니다'); return; } S0.splice(i, 1); }
  pause(); renderScenes();
  const tot = totalOf(S0); if (a === 'dm' || a === 'dp' || a === 'del') toast(`전체 ${tot.toFixed(1)}초${tot > 60 ? ' (60초를 넘었습니다)' : tot < 15 ? '' : ''}`);
});
$('#addScene').addEventListener('click', () => {
  const s = { d: 3, kind: 'text', lines: [{ t: '새 글', role: 'main' }], visual: null };
  ST.scenes.splice(Math.max(0, ST.scenes.length - 1), 0, s); renderScenes();
  $$('#sceneList .sc')[ST.scenes.length - 2].querySelector('input').select();
});
function swapPhrase(which){
  const P = PHRASES[ST.type][which][mood()]; if (!P || P.length < 2) { toast('바꿀 문구가 없습니다'); return; }
  const old = fillPhrase(P[ST.ph[which] % P.length], ST.fields);
  ST.ph[which]++;
  const nu = fillPhrase(P[ST.ph[which] % P.length], ST.fields);
  let hit = false;
  ST.scenes.forEach(s => s.lines && s.lines.forEach(l => { if (l.t === old) { l.t = nu; hit = true; } }));
  if (!hit) toast('직접 고친 문구는 바꾸지 않습니다'); renderScenes();
}
$('#hookAlt').addEventListener('click', () => swapPhrase('hook'));
$('#endAlt').addEventListener('click', () => swapPhrase('end'));

/* ---- 소리: 배경음·녹음 ---- */
const MOOD_KO = { bright: '밝게', calm: '차분하게', strong: '힘 있게', season: '계절·명절' };
function fillBgm(){
  $('#bgmSel').innerHTML = '<option value="">배경음 없음</option>' + (ST.bgm ? `<option value="file">내 음악: ${esc(ST.bgm.name)}</option>` : '') +
    Object.keys(MOOD_KO).map(m => `<optgroup label="${MOOD_KO[m]}">` + TRACKS.filter(t => t.mood === m).map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('') + '</optgroup>').join('');
  $('#bgmSel').value = ST.track || '';
}
// 고르지 않았으면 영상 분위기에 맞는 첫 곡 (12월·1월·2월 행사는 겨울 곡)
function autoTrack(){
  if (ST.trackPicked) return;
  const winter = /(^|[^0-9])(12|1|2)월/.test(ST.fields.date || '') && /성탄|크리스마스|연말/.test(val('text'));
  const list = TRACKS.filter(t => t.mood === (winter ? 'season' : mood()));
  ST.track = (list[(ST.plan.charCodeAt(0) - 65) % list.length] || TRACKS[0]).id;
}
let bgmAudio = null;
function stopBgm(){ if (bgmAudio) { bgmAudio.pause(); bgmAudio = null; } $('#bgmPlay').textContent = '듣기'; }
$('#bgmSel').addEventListener('change', () => { stopBgm(); ST.track = $('#bgmSel').value; ST.trackPicked = true; save(); });
$('#bgmPlay').addEventListener('click', () => {
  if (bgmAudio) { stopBgm(); return; }
  const v = $('#bgmSel').value; if (!v) { toast('배경음 없음을 골랐습니다'); return; }
  bgmAudio = new Audio(v === 'file' ? URL.createObjectURL(ST.bgm.file) : 'music/' + TRACKS.find(t => t.id === v).file);
  bgmAudio.volume = +$('#bgmVol').value / 100; bgmAudio.onended = stopBgm;
  bgmAudio.play().then(() => $('#bgmPlay').textContent = '멈춤').catch(() => { stopBgm(); toast('음악을 불러오지 못했습니다'); });
});
$('#bgmVol').addEventListener('input', () => { $('#bgmVolV').textContent = $('#bgmVol').value; if (bgmAudio) bgmAudio.volume = +$('#bgmVol').value / 100; ST.vol = +$('#bgmVol').value; save(); });
$('#bgmIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  ST.bgm = { file: f, name: f.name }; ST.track = 'file'; ST.trackPicked = true; stopBgm();
  $('#bgmName').textContent = f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name; $('#bgmDel').classList.remove('hidden'); e.target.value = ''; fillBgm();
});
$('#bgmDel').addEventListener('click', () => { ST.bgm = null; if (ST.track === 'file') { ST.trackPicked = false; autoTrack(); } stopBgm(); $('#bgmName').textContent = '파일 넣기'; $('#bgmDel').classList.add('hidden'); fillBgm(); });
async function bgmBlob(){
  const v = ST.track; if (!v) return null;
  if (v === 'file') return ST.bgm ? ST.bgm.file : null;
  const t = TRACKS.find(x => x.id === v); if (!t) return null;
  const r = await fetch('music/' + t.file); if (!r.ok) throw new Error('bgm'); return r.blob();
}
let recorder = null;
$('#recBtn').addEventListener('click', async () => {
  if (recorder) { recorder.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (_) { toast('마이크를 쓸 수 없습니다. 브라우저 권한을 확인하세요'); return; }
  pause();
  for (let n = 3; n > 0; n--) { $('#recHint').textContent = `${n}초 뒤 녹음 시작`; await new Promise(r => setTimeout(r, 1000)); }
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop()); pause();
    ST.voice = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); recorder = null;
    $('#recBtn').textContent = '다시 녹음'; $('#recDel').classList.remove('hidden'); $('#recHint').textContent = '녹음했습니다. 영상 만들기를 누르면 함께 들어갑니다.';
  };
  recorder.start(); $('#recBtn').textContent = '녹음 멈추기'; $('#recHint').textContent = '녹음 중… 미리보기를 보며 말하세요.';
  play(0, () => recorder && recorder.stop());
});
$('#recDel').addEventListener('click', () => { ST.voice = null; $('#recDel').classList.add('hidden'); $('#recBtn').textContent = '녹음하기'; $('#recHint').textContent = '녹음을 지웠습니다.'; });

/* ---- 저장: 캔버스를 실시간으로 녹화 ---- */
let outBlob = null;
$('#exportBtn').addEventListener('click', async () => {
  const mime = pickMime();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) { toast('이 브라우저에서는 영상 저장이 되지 않습니다. 크롬·엣지·사파리 최신판을 써 주세요'); return; }
  pause(); stopBgm();
  const btn = $('#exportBtn'); btn.disabled = true; $('#exp').classList.remove('hidden'); $('#outBox').classList.add('hidden');
  const scale = +radio('q') || 1, cv = document.createElement('canvas'), st = new Stage(cv);
  st.media = ST.media; st.setup(ratio(), scale);
  const stream = cv.captureStream(30);
  let ac = null;
  const audioSrc = [];
  try {
    const bgm = await bgmBlob().catch(() => { toast('배경음을 불러오지 못해 빼고 만듭니다'); return null; });
    if (bgm || ST.voice) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const add = async (blob, gain, loop) => { const buf = await ac.decodeAudioData(await blob.arrayBuffer()); const s = ac.createBufferSource(); s.buffer = buf; s.loop = loop; const g = ac.createGain(); g.gain.value = gain; s.connect(g).connect(dest); audioSrc.push({ s, g }); };
      if (bgm) await add(bgm, (ST.vol ?? 60) / 100 * (ST.voice ? 0.4 : 1), true);
      if (ST.voice) await add(ST.voice, 1, false);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
  } catch (_) { toast('소리 파일을 읽지 못해 소리 없이 만듭니다'); }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: scale >= 1 ? 16000000 : 9000000, audioBitsPerSecond: 128000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);
  const sc = ST.scenes, tot = totalOf(sc);
  ST.media.forEach(m => m.type === 'video' && (m.el.pause(), m.el.currentTime = 0));
  // 페이드아웃: 끝 1초 동안 배경음 줄이기
  rec.start(250);
  const t0 = performance.now();
  if (ac) { const now = ac.currentTime; audioSrc.forEach(a => { a.s.start(now); a.g.gain.setValueAtTime(a.g.gain.value, now + Math.max(0, tot - 1)); a.g.gain.linearRampToValueAtTime(0, now + tot); }); }
  let lastI = -1;
  await new Promise(resolve => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= tot) { st.prog = 1; st.draw(sc[sc.length - 1], sc[sc.length - 1].d, pal()); resolve(); return; }
      const { i, local } = sceneAt(sc, t);
      if (i !== lastI) { ST.media.forEach((m, k) => { if (m.type !== 'video') return; if (sc[i].visual && sc[i].visual.media === k) { m.el.currentTime = 0; m.el.play().catch(() => {}); } else m.el.pause(); }); lastI = i; }
      st.idx = i; st.prog = t / tot; st.draw(sc[i], local, pal());
      $('#expBar').style.width = (t / tot * 100).toFixed(1) + '%';
      $('#expMsg').textContent = `영상 만드는 중 ${fmt(t)} / ${fmt(tot)}`;
      if (document.hidden) setTimeout(tick, 33); else requestAnimationFrame(tick);
    };
    tick();
  });
  await new Promise(r => setTimeout(r, 300));
  rec.stop(); await done;
  ST.media.forEach(m => m.type === 'video' && m.el.pause());
  if (ac) ac.close();
  outBlob = new Blob(chunks, { type: mime.split(';')[0] });
  $('#outVideo').src = URL.createObjectURL(outBlob);
  $('#expMsg').textContent = `완성했습니다 (${(outBlob.size / 1048576).toFixed(1)}MB, ${mime.startsWith('video/mp4') ? 'MP4' : 'WebM'})`;
  $('#expBar').style.width = '100%';
  $('#outBox').classList.remove('hidden'); btn.disabled = false; btn.textContent = '다시 만들기';
  // 만든 영상 점검: 길이가 맞는지, 비어 있지 않은지
  const ov = $('#outVideo'); ov.onloadedmetadata = () => {
    const d = ov.duration, probs = [];
    if (outBlob.size < 200000) probs.push('파일이 너무 작습니다');
    if (isFinite(d) && Math.abs(d - tot) > 1) probs.push(`영상 길이가 ${d.toFixed(1)}초로 계획(${tot.toFixed(1)}초)과 다릅니다`);
    $('#expMsg').textContent += probs.length ? ` · 확인 필요: ${probs.join(', ')}. 화면을 켜 둔 채 다시 만들어 보세요.` : ' · 길이 확인 완료';
  };
  if (!mime.startsWith('video/mp4')) toast('이 브라우저는 WebM으로 저장합니다. 유튜브·인스타에 그대로 올릴 수 있습니다');
});
$('#dl').addEventListener('click', () => {
  if (!outBlob) return;
  const ext = outBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const nm = (ST.fields.name || ST.fields.item || '숏폼').replace(/[\\/:*?"<>|\s]+/g, '_');
  download(outBlob, `${nm}_${ratio().replace(':', 'x')}.${ext}`);
});

/* ---- 단계 이동 ---- */
function go(n){
  if (n === 2) {
    if (!val('text') && !ST.media.length) { toast('알리고 싶은 내용을 적어 주세요'); $('#text').focus(); return; }
    if (ST.type !== radio('type') || ST.lastText !== val('text')) { ST.type = radio('type'); ST.fields = {}; ST.featsTouched = false; ST.plans = null; ST.lastText = val('text'); }
    buildFieldForm();
  }
  if (n === 3) {
    const miss = TYPES[ST.type].must.filter(k => !ST.fields[k]);
    if (miss.length) { toast(`${TYPES[ST.type].fields.find(f => f[0] === miss[0])[1]}을(를) 넣어 주세요`); $('#f_' + miss[0]).focus(); return; }
    if (!ST.plans) makePlans();
    renderPlans();
  }
  if (n === 4) {
    if (!ST.plans) makePlans();
    // 구성안에서 고친 장면은 유지, 구성안을 바꿨으면 새로
    if (ST.sceneFrom !== ST.plan + JSON.stringify(ST.plans[ST.plan].map(s => s.lines))) {
      ST.scenes = JSON.parse(JSON.stringify(ST.plans[ST.plan])).map(s => ({ ...s, autoVisual: s.visual && s.visual.media == null ? s.visual : (s.visual ? fallbackVisual(s) : null) }));
      ST.sceneFrom = ST.plan + JSON.stringify(ST.plans[ST.plan].map(s => s.lines));
    }
    autoTrack(); fillBgm(); $('#bgmVol').value = ST.vol ?? 60; $('#bgmVolV').textContent = $('#bgmVol').value;
    stageSetup(); player.t = 1.6; renderScenes();
    if (!radio('q')) $$('input[name=q]').forEach(r => r.checked = r.value === (innerWidth < 760 ? '0.6667' : '1'));
  }
  Object.values(thumbs).forEach(t => t.playing = false);
  if (n !== 4) pause();
  ST.step = n;
  $$('[data-step]').forEach(el => el.classList.toggle('hidden', +el.dataset.step !== n));
  $$('#steps i').forEach((el, i) => el.classList.toggle('on', i < n));
  $('#prev').classList.toggle('hidden', n === 1);
  $('#next').classList.toggle('hidden', n === 4);
  $('#next').textContent = n === 3 ? `${ST.plan}안으로 다듬기` : '다음';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  save();
}
// 사진을 넣은 장면에서 '자동 그림'으로 되돌릴 때 쓸 그림
function fallbackVisual(s){
  const t = (s.lines.find(l => l.role !== 'sub') || s.lines[0] || { t: '' }).t;
  const kw = keywordOf(t, ST.fields.item || ST.fields.name || ''), topic = artTopic([ST.fields.item, ST.fields.name, ST.feats.join(' ')].join(' '));
  return topic ? { g: 'hero', topic, shot: 1, chip: kw } : { g: 'poster', text: kw };
}
$('#next').addEventListener('click', () => go(ST.step + 1));
$('#prev').addEventListener('click', () => go(ST.step - 1));
$('#plans').addEventListener('click', () => { if (ST.step === 3) $('#next').textContent = `${ST.plan}안으로 다듬기`; });

/* ---- 저장해 두기 (사진·영상·소리 파일은 저장하지 않음) ---- */
function save(){
  store.set(KEY, { ratio: ratio(), type: radio('type'), text: val('text'), len: radio('len'), mood: mood(), fields: ST.fields, feats: ST.feats, featsTouched: ST.featsTouched, plan: ST.plan, pal: ST.pal, palPicked: ST.palPicked, custom: ST.custom, track: ST.track, trackPicked: ST.trackPicked, vol: ST.vol, ph: ST.ph });
}
(() => {
  const s = store.get(KEY); if (!s) { showTypeHint(); return; }
  $$('input[name=ratio]').forEach(r => r.checked = r.value === s.ratio);
  $$('input[name=type]').forEach(r => r.checked = r.value === s.type);
  $$('input[name=len]').forEach(r => r.checked = r.value === s.len);
  $$('input[name=mood]').forEach(r => r.checked = r.value === s.mood);
  $('#text').value = s.text || '';
  Object.assign(ST, { fields: s.fields || {}, feats: s.feats || [], featsTouched: s.featsTouched, plan: s.plan || 'A', pal: s.pal || null, palPicked: s.palPicked, ph: s.ph || { hook: 0, end: 0 }, lastText: s.text, type: s.type || 'promo', custom: s.custom, track: s.track === 'file' ? null : s.track, trackPicked: s.track !== 'file' && s.trackPicked, vol: s.vol });
  if (ST.custom) { $('#cBg').value = ST.custom.bg; $('#cFg').value = ST.custom.fg; $('#cAc').value = ST.custom.ac; readCustom(); }
  if (ST.pal && ST.pal !== 'custom' && !PALETTES.some(p => p.id === ST.pal)) ST.pal = null;
  if (ST.featsTouched) $('#feats').value = ST.feats.join('\n');
  showTypeHint();
})();
['text'].forEach(id => $('#' + id).addEventListener('input', save));
$$('input[name=ratio], input[name=len]').forEach(r => r.addEventListener('change', () => { ST.plans = null; save(); }));
if (document.fonts) document.fonts.load(`700 40px "Noto Sans KR"`).then(() => document.fonts.load(`400 40px "Noto Sans KR"`)).catch(() => {});
go(1);

/* ---- 가까이 볼 위치 고르기 ---- */
let pickI = -1;
function openPick(i){
  const v = ST.scenes[i].visual, m = ST.media[v.media]; pickI = i;
  $('#pickImg').src = m.url; $('#pickHand').classList.toggle('hidden', !isTallShot(m));
  const dot = $('#pickDot'); dot.style.display = v.fx != null ? '' : 'none'; if (v.fx != null) { dot.style.left = v.fx * 100 + '%'; dot.style.top = v.fy * 100 + '%'; }
  $('#pick').classList.remove('hidden'); pause();
}
$('#pickImg').addEventListener('click', e => {
  const r = e.target.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height, sc = ST.scenes[pickI];
  sc.visual = { media: sc.visual.media, detail: sc.visual.detail || 0, fx, fy };
  const dot = $('#pickDot'); dot.style.display = ''; dot.style.left = fx * 100 + '%'; dot.style.top = fy * 100 + '%';
  let acc = 0; for (let k = 0; k < pickI; k++) acc += ST.scenes[k].d; player.t = acc + Math.min(1.6, sc.d - 0.1); drawAt(player.t); save();
});
$('#pickAll').addEventListener('click', () => { const sc = ST.scenes[pickI]; sc.visual = { media: sc.visual.media }; $('#pick').classList.add('hidden'); renderScenes(); });
$('#pickHand').addEventListener('click', () => { const sc = ST.scenes[pickI]; sc.visual = { g: 'handheld', media: sc.visual.media, bg: bgOf() }; $('#pick').classList.add('hidden'); renderScenes(); });
$('#pickClose').addEventListener('click', () => { $('#pick').classList.add('hidden'); renderScenes(); });
$('#pick').addEventListener('click', e => { if (e.target.id === 'pick') { $('#pick').classList.add('hidden'); renderScenes(); } });
