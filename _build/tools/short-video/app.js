const KEY = 'ilsang_shortvideo_v1';
const ST = { step: 1, type: 'promo', fields: {}, feats: [], plan: 'A', pal: null, ph: { hook: 0, end: 0 }, scenes: [], plans: null, media: [], bgm: null, voice: null };
const PLAN_INFO = {
  A: ['A 첫마디형', '짧은 문구로 시작해 한 화면에 하나씩 빠르게 넘깁니다. 처음 보는 사람에게 알릴 때'],
  B: ['B 정보형', '가격·날짜·시간·위치를 한 화면에 모아 차례로 보여 줍니다. 단골·주민에게 소식 전할 때'],
  C: ['C 이야기형', '가운데 정렬, 느린 호흡으로 그림을 크게 보여 줍니다. 사진이 3장 이상일 때 잘 어울림']
};
const DEF_PAL = { A: 'ink', B: 'cream', C: 'white' };
const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const ratio = () => radio('ratio'), len = () => +radio('len'), mood = () => radio('mood');
const pal = () => PALETTES.find(p => p.id === (ST.pal || DEF_PAL[ST.plan])) || PALETTES[0];

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
});
$('#mediaList').addEventListener('click', e => {
  const i = e.target.dataset.del; if (i == null) return;
  URL.revokeObjectURL(ST.media[i].url); ST.media.splice(+i, 1); mediaHtml(); ST.plans = null;
});

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
$$('input[name=mood]').forEach(r => r.addEventListener('change', () => ST.plans = null));

/* ---- 3단계: 구성안 ---- */
function makePlans(){
  const raw = buildPlans(ST.type, ST.fields, ST.feats, ST.media.length, mood(), ST.ph);
  ST.plans = {};
  for (const k of ['A', 'B', 'C']) ST.plans[k] = fitDurations(raw[k], len(), mood(), k);
}
$('#pals').innerHTML = PALETTES.map(p => `<button type="button" data-pal="${p.id}"><i><em style="background:${p.bg}"></em><em style="background:${p.fg}"></em><em style="background:${p.ac}"></em></i>${p.name}</button>`).join('');
$('#pals').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (!b) return; ST.pal = b.dataset.pal; markPal(); drawPlanThumbs(); save(); });
const markPal = () => $$('#pals button').forEach(b => b.classList.toggle('on', b.dataset.pal === pal().id));

const thumbs = {};
function renderPlans(){
  $('#plans').innerHTML = ['A', 'B', 'C'].map(k => `<div class="plan${ST.plan === k ? ' on' : ''}" data-plan="${k}"><canvas data-th="${k}"></canvas><h3>${PLAN_INFO[k][0]}</h3><p>${PLAN_INFO[k][1]} · ${ST.plans[k].length}장면</p></div>`).join('');
  ['A', 'B', 'C'].forEach(k => { const st = new Stage($(`[data-th="${k}"]`)); st.media = ST.media; st.setup(ratio(), 0.22); thumbs[k] = { st, t: 0, playing: false }; });
  drawPlanThumbs(); markPal();
}
function drawPlanThumbs(){
  ['A', 'B', 'C'].forEach(k => { const th = thumbs[k]; if (!th) return; const sc = ST.plans[k], { i, local } = sceneAt(sc, th.t || 0.9); th.st.draw(sc[i], th.playing ? local : 0.9, pal()); });
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
  stage.draw(sc[i], local, pal());
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
  const media = ST.media.map((m, i) => `<option value="m${i}">${m.type === 'video' ? '영상' : '사진'} ${i + 1}</option>`).join('');
  const cur = !s.visual ? 'none' : s.visual.media != null ? 'm' + s.visual.media : 'auto';
  return `<select data-k="vis" aria-label="그림">${auto}${media}<option value="none">그림 없음</option></select>`.replace(`value="${cur}"`, `value="${cur}" selected`);
}
function renderScenes(){
  $('#sceneList').innerHTML = ST.scenes.map((s, i) => {
    const inputs = s.kind === 'list'
      ? s.rows.map((r, j) => `<input type="text" data-row="${j}" value="${esc(r[0] + ' | ' + r[1])}" aria-label="정보 ${j + 1}">`).join('') + '<p class="hint" style="margin:0">"이름 | 내용" 형식</p>'
      : s.lines.map((l, j) => `<input type="text" data-line="${j}" value="${esc(l.t)}" aria-label="장면 ${i + 1} 글 ${j + 1}">`).join('');
    return `<div class="sc" data-i="${i}"><div class="hd"><b>장면 ${i + 1}</b><span class="dur"><button type="button" data-a="dm" aria-label="짧게">−</button>${s.d.toFixed(1)}초<button type="button" data-a="dp" aria-label="길게">+</button></span><span class="sp"></span>${s.kind === 'list' ? '' : visOptions(s)}<button type="button" data-a="up" aria-label="위로">↑</button><button type="button" data-a="dn" aria-label="아래로">↓</button><button type="button" data-a="del" aria-label="삭제">×</button></div>${inputs}</div>`;
  }).join('');
  player.lastI = -1; drawAt(Math.min(player.t, totalOf(ST.scenes) - 0.01));
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
  s.visual = v === 'none' ? null : v === 'auto' ? s.autoVisual : { media: +v.slice(1) };
  if (!player.playing) drawAt(player.t); save();
});
$('#sceneList').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) { const box = e.target.closest('.sc'); if (box && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { pause(); let acc = 0; for (let k = 0; k < +box.dataset.i; k++) acc += ST.scenes[k].d; player.t = acc + 0.6; drawAt(player.t); } return; }
  const i = +b.closest('.sc').dataset.i, S0 = ST.scenes, a = b.dataset.a;
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
$('#bgmIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  ST.bgm = { file: f, name: f.name }; $('#bgmName').textContent = f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name; $('#bgmDel').classList.remove('hidden'); e.target.value = '';
});
$('#bgmDel').addEventListener('click', () => { ST.bgm = null; $('#bgmName').textContent = '음악 파일 넣기'; $('#bgmDel').classList.add('hidden'); });
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
  pause();
  const btn = $('#exportBtn'); btn.disabled = true; $('#exp').classList.remove('hidden'); $('#outBox').classList.add('hidden');
  const scale = +radio('q') || 1, cv = document.createElement('canvas'), st = new Stage(cv);
  st.media = ST.media; st.setup(ratio(), scale);
  const stream = cv.captureStream(30);
  let ac = null;
  const audioSrc = [];
  try {
    if (ST.bgm || ST.voice) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const add = async (blob, gain, loop) => { const buf = await ac.decodeAudioData(await blob.arrayBuffer()); const s = ac.createBufferSource(); s.buffer = buf; s.loop = loop; const g = ac.createGain(); g.gain.value = gain; s.connect(g).connect(dest); audioSrc.push({ s, g }); };
      if (ST.bgm) await add(ST.bgm.file, ST.voice ? 0.25 : 0.7, true);
      if (ST.voice) await add(ST.voice, 1, false);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
  } catch (_) { toast('소리 파일을 읽지 못해 소리 없이 만듭니다'); }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: scale >= 1 ? 8000000 : 5000000, audioBitsPerSecond: 128000 });
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
      if (t >= tot) { st.draw(sc[sc.length - 1], sc[sc.length - 1].d, pal()); resolve(); return; }
      const { i, local } = sceneAt(sc, t);
      if (i !== lastI) { ST.media.forEach((m, k) => { if (m.type !== 'video') return; if (sc[i].visual && sc[i].visual.media === k) { m.el.currentTime = 0; m.el.play().catch(() => {}); } else m.el.pause(); }); lastI = i; }
      st.draw(sc[i], local, pal());
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
    stageSetup(); player.t = 0.9; renderScenes();
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
  return { g: 'poster', text: keywordOf(t, ST.fields.item || ST.fields.name || '') };
}
$('#next').addEventListener('click', () => go(ST.step + 1));
$('#prev').addEventListener('click', () => go(ST.step - 1));
$('#plans').addEventListener('click', () => { if (ST.step === 3) $('#next').textContent = `${ST.plan}안으로 다듬기`; });

/* ---- 저장해 두기 (사진·영상·소리 파일은 저장하지 않음) ---- */
function save(){
  store.set(KEY, { ratio: ratio(), type: radio('type'), text: val('text'), len: radio('len'), mood: mood(), fields: ST.fields, feats: ST.feats, featsTouched: ST.featsTouched, plan: ST.plan, pal: ST.pal, palPicked: ST.palPicked, ph: ST.ph });
}
(() => {
  const s = store.get(KEY); if (!s) { showTypeHint(); return; }
  $$('input[name=ratio]').forEach(r => r.checked = r.value === s.ratio);
  $$('input[name=type]').forEach(r => r.checked = r.value === s.type);
  $$('input[name=len]').forEach(r => r.checked = r.value === s.len);
  $$('input[name=mood]').forEach(r => r.checked = r.value === s.mood);
  $('#text').value = s.text || '';
  Object.assign(ST, { fields: s.fields || {}, feats: s.feats || [], featsTouched: s.featsTouched, plan: s.plan || 'A', pal: s.pal || null, palPicked: s.palPicked, ph: s.ph || { hook: 0, end: 0 }, lastText: s.text, type: s.type || 'promo' });
  if (ST.featsTouched) $('#feats').value = ST.feats.join('\n');
  showTypeHint();
})();
['text'].forEach(id => $('#' + id).addEventListener('input', save));
$$('input[name=ratio], input[name=len]').forEach(r => r.addEventListener('change', () => { ST.plans = null; save(); }));
if (document.fonts) document.fonts.load(`700 40px "Noto Sans KR"`).then(() => document.fonts.load(`400 40px "Noto Sans KR"`)).catch(() => {});
go(1);
