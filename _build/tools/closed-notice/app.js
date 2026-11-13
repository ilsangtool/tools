const KEY = 'ilsang_closed_v1';
const TYPES = {
  temp:         { title:'임시휴무 안내', body:'매장 사정으로 아래 기간 동안 쉬어갑니다.\n이용에 불편을 드려 죄송합니다.', label:'휴무 기간', range:true, reopen:'정상 영업합니다' },
  vacation:     { title:'휴가 안내', body:'재충전을 위해 잠시 쉬어갑니다.\n더 좋은 모습으로 돌아오겠습니다.', label:'휴가 기간', range:true, reopen:'정상 영업합니다' },
  holiday:      { title:'연휴 휴무 안내', body:'연휴 동안 쉬어갑니다.\n가족과 함께 따뜻한 연휴 보내세요.', label:'휴무 기간', range:true, reopen:'정상 영업합니다' },
  construction: { title:'내부 공사 안내', body:'더 나은 공간을 위해 내부 공사를 진행합니다.\n공사 기간에는 영업을 쉽니다.', label:'공사 기간', range:true, reopen:'새 단장 후 다시 문을 엽니다' },
  hours:        { title:'영업시간 변경 안내', body:'아래 날짜부터 영업시간이 바뀝니다.\n변경 영업시간: 오전 11시 ~ 오후 9시', label:'시행일', range:false },
  move:         { title:'매장 이전 안내', body:'그동안 찾아주셔서 감사합니다.\n새 주소: ○○시 ○○로 00 (○○건물 1층)', label:'이전 영업 시작일', range:false },
  closing:      { title:'영업 종료 안내', body:'그동안 보내주신 사랑에 깊이 감사드립니다.\n아래 날짜를 끝으로 영업을 마칩니다.', label:'마지막 영업일', range:false }
};
const THEMES = {
  plain: { bg:'#ffffff', ink:'#1d1f22', sub:'#5b6068', accent:'#0f5c4a', band:'#e7f1ee' },
  dark:  { bg:'#1d1f22', ink:'#ffffff', sub:'#c9ccd1', accent:'#f2c94c', band:'#2d3036' },
  warm:  { bg:'#fbf3e4', ink:'#4a2f17', sub:'#7a5a3c', accent:'#c2410c', band:'#f4e2c4' }
};
const SIZES = { a4:[1240,1754], sq:[1080,1080], a4l:[1754,1240] };
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const cv = $('#cv'), ctx = cv.getContext('2d');
let edited = { title:false, body:false };

function fields(){ return $$('#f input, #f select, #f textarea'); }
function save(){ const s = { edited }; fields().forEach(el => { if (el.type === 'radio') { if (el.checked) s['r_'+el.name] = el.value; } else s[el.id] = el.type === 'checkbox' ? el.checked : el.value; }); store.set(KEY, s); }
function load(){
  const s = store.get(KEY); if (!s) return false;
  fields().forEach(el => { if (el.type === 'radio') { if (s['r_'+el.name]) el.checked = s['r_'+el.name] === el.value; } else if (el.id in s) { if (el.type === 'checkbox') el.checked = s[el.id]; else el.value = s[el.id]; } });
  edited = s.edited || edited; return true;
}

function applyType(force){
  const T = TYPES[$('#type').value];
  if (force || !edited.title) { $('#title').value = T.title; edited.title = false; }
  if (force || !edited.body) { $('#body').value = T.body; edited.body = false; }
}

// 줄바꿈: 띄어쓰기 단위로 자르고, 한 단어가 너무 길면 글자 단위
function wrap(text, maxW){
  const out = [];
  text.split('\n').forEach(par => {
    if (!par.trim()) { out.push(''); return; }
    let line = '';
    par.split(' ').forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; return; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; return; }
      line = '';
      for (const ch of word) { if (ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
    });
    if (line) out.push(line);
  });
  return out;
}

function info(){
  const T = TYPES[$('#type').value];
  const s = parseDate($('#start').value), e = T.range ? parseDate($('#end').value) : null;
  let period = '', days = '', reopenLine = '';
  if (s) {
    if (T.range && e && dayDiff(s, e) > 0) {
      period = `${kDate(s)} ~ ${kDate(e)}`;
      days = `(${dayDiff(s, e) + 1}일간)`;
    } else period = kDate(s, s.getFullYear() !== today().getFullYear());
    if (T.range && $('#reopen').checked) reopenLine = `${kDate(addDays(e && dayDiff(s, e) >= 0 ? e : s, 1))}부터 ${T.reopen}`;
  }
  return { T, period, days, reopenLine };
}

function draw(){
  const [W, H] = SIZES[radio('size')], th = THEMES[radio('theme')];
  cv.width = W; cv.height = H;
  const { T, period, days, reopenLine } = info();
  const shop = val('shop'), title = val('title') || T.title, body = $('#body').value.trim();
  const note = val('note'), contact = val('contact');
  const m = W * 0.09, maxW = W - m * 2;
  const u = Math.min(W, H * 0.75) / 100;

  // 크기 s 로 배치를 계산해 높이가 맞을 때까지 줄임
  function layout(s){
    const ops = []; let y = 0;
    const add = (txt, size, weight, color, gapAfter, lh) => {
      ctx.font = `${weight} ${size}px ${FONT}`;
      const lines = wrap(txt, maxW);
      lines.forEach(l => { ops.push({ t:l, size, weight, color, y: y + size }); y += size * (lh || 1.45); });
      y += gapAfter;
    };
    if (shop) add(shop, 4.2*u*s, 700, th.accent, 3*u*s);
    add(title, 9.5*u*s, 900, th.ink, 4*u*s, 1.25);
    ops.push({ line:true, y: y }); y += 5*u*s;
    if (period) {
      add(T.label, 3.4*u*s, 500, th.sub, 1.2*u*s);
      const bandTop = y;
      add(period, 5.6*u*s, 700, th.ink, 0, 1.35);
      if (days) add(days, 3.6*u*s, 500, th.sub, 0);
      ops.splice(ops.findIndex(o => o.y > bandTop), 0, { band:true, y0: bandTop - 1.8*u*s, y1: y + 0.6*u*s });
      y += 5*u*s;
    }
    if (body) add(body, 4*u*s, 400, th.ink, 4*u*s, 1.6);
    if (reopenLine) add(reopenLine, 4.6*u*s, 700, th.accent, 4*u*s);
    if (note) add(note, 3.5*u*s, 500, th.sub, 1.5*u*s);
    if (contact) add('문의 ' + contact, 3.5*u*s, 500, th.sub, 1.5*u*s);
    add(shop ? `감사합니다. ${shop} 올림` : '감사합니다.', 3.5*u*s, 500, th.sub, 0);
    return { ops, h: y };
  }
  let s = 1, L = layout(s);
  while (L.h > H - m * 2 && s > 0.4) { s -= 0.05; L = layout(s); }

  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = th.accent; ctx.lineWidth = Math.max(4, u * 0.6);
  ctx.strokeRect(m * 0.4, m * 0.4, W - m * 0.8, H - m * 0.8);
  const top = (H - L.h) / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  L.ops.forEach(o => {
    if (o.line) { ctx.fillStyle = th.accent; ctx.fillRect(W/2 - 6*u, top + o.y, 12*u, Math.max(4, u*0.7)); return; }
    if (o.band) { ctx.fillStyle = th.band; ctx.fillRect(m, top + o.y0, maxW, o.y1 - o.y0); return; }
    ctx.font = `${o.weight} ${o.size}px ${FONT}`; ctx.fillStyle = o.color;
    ctx.fillText(o.t, W / 2, top + o.y);
  });
}

function noticeText(){
  const { T, period, days, reopenLine } = info();
  const title = val('title') || T.title;
  const lines = [`[${val('shop') ? val('shop') + ' ' : ''}${title}]`, ''];
  if ($('#body').value.trim()) lines.push($('#body').value.trim(), '');
  if (period) lines.push(`${T.label}: ${period} ${days}`.trim());
  if (reopenLine) lines.push(reopenLine);
  if (val('note')) lines.push('', val('note'));
  if (val('contact')) lines.push('문의: ' + val('contact'));
  lines.push('', '감사합니다.');
  return lines.join('\n');
}

function update(){
  const T = TYPES[$('#type').value];
  $('#endWrap').classList.toggle('hidden', !T.range);
  $('#reopenWrap').classList.toggle('hidden', !T.range);
  $('#startLbl').textContent = T.range ? '시작일' : T.label;
  $('#reopenTxt').textContent = `다음 날부터 "${T.reopen || ''}" 문구 넣기`;
  draw(); save();
}

$('#type').addEventListener('change', () => { applyType(false); update(); });
$('#title').addEventListener('input', () => edited.title = true);
$('#body').addEventListener('input', () => edited.body = true);
$('#start').addEventListener('change', () => {
  const s = parseDate($('#start').value), e = parseDate($('#end').value);
  if (s && (!e || e < s)) $('#end').value = $('#start').value;
});
$('#f').addEventListener('input', update);
$('#f').addEventListener('change', update);

$('#pngBtn').addEventListener('click', () => {
  cv.toBlob(b => download(b, `${val('shop') || '안내문'}_${val('title') || '휴무안내'}.png`.replace(/[\\/:*?"<>|]/g, '')), 'image/png');
});
$('#printBtn').addEventListener('click', () => {
  let w = $('#printWrap'); if (!w) { w = document.createElement('div'); w.id = 'printWrap'; document.body.appendChild(w); }
  const land = radio('size') === 'a4l';
  w.innerHTML = `<style>@page{size:A4 ${land ? 'landscape' : 'portrait'};margin:0}</style><img alt="" src="${cv.toDataURL('image/png')}">`;
  w.querySelector('img').decode().catch(() => {}).then(() => window.print());
});
$('#txtBtn').addEventListener('click', () => copy(noticeText()));

if (!load()) {
  const t = today();
  $('#start').value = ymd(addDays(t, 1)); $('#end').value = ymd(addDays(t, 3));
  applyType(true);
}
update();
// 웹폰트가 늦게 오면 다시 그림
if (document.fonts) {
  Promise.all([document.fonts.load(`900 40px "Noto Sans KR"`), document.fonts.load(`700 40px "Noto Sans KR"`), document.fonts.load(`400 40px "Noto Sans KR"`)]).then(draw).catch(() => {});
  document.fonts.ready.then(draw);
}
