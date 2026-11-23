const KEY = 'ilsang_datecalc_v1';
const T0 = today();
function addMonths(d, n){
  const y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, last));
}
const dd = n => n === 0 ? 'D-Day' : n > 0 ? 'D-' + n.toLocaleString() : 'D+' + (-n).toLocaleString();
const n0 = n => n.toLocaleString('ko-KR');
let cur = 'dday'; const out = {};

function dday(){
  const t = parseDate($('#ddTarget').value), b = parseDate($('#ddBase').value) || T0;
  if (!t) { $('#ddOut').innerHTML = '<small>목표 날짜를 고르세요</small>'; $('#ddStat').innerHTML = ''; return; }
  const n = dayDiff(b, t), span = Math.abs(n) + ($('#ddBoth').checked ? 1 : 0);
  $('#ddOut').innerHTML = `${dd(n)}<small>${kDate(t, true)}까지 ${n >= 0 ? n0(n) + '일 남음' : n0(-n) + '일 지남'}</small>`;
  $('#ddStat').innerHTML =
    `<div><small>기간 (일)</small><b>${n0(span)}일</b></div>` +
    `<div><small>주 단위</small><b>${Math.floor(span / 7)}주 ${span % 7}일</b></div>` +
    `<div><small>평일만 (월~금)</small><b>${n0(weekdays(n >= 0 ? b : t, span))}일</b></div>`;
  out.dday = `${kDate(t, true)} ${dd(n)} (${n0(span)}일)`;
}
function weekdays(from, span){ let c = 0; for (let i = 0; i < span; i++) { const w = addDays(from, i + ($('#ddBoth').checked ? 0 : 1)).getDay(); if (w && w !== 6) c++; } return c; }

function anniv(){
  const s = parseDate($('#anStart').value), one = $('#anOne').checked;
  if (!s) { $('#anOut').innerHTML = '<small>시작일을 고르세요</small>'; $('#anTable').innerHTML = ''; return; }
  const nth = dayDiff(s, T0) + (one ? 1 : 0);
  $('#anOut').innerHTML = `오늘은 ${n0(nth)}일째<small>${kDate(s, true)}부터</small>`;
  const list = [];
  for (let k = 50; k <= 1000; k += (k < 100 ? 50 : 100)) list.push([`${n0(k)}일`, addDays(s, k - (one ? 1 : 0))]);
  for (const k of [2000, 3000]) list.push([`${n0(k)}일`, addDays(s, k - (one ? 1 : 0))]);
  for (let y = 1; y <= 10; y++) list.push([`${y}주년`, addMonths(s, y * 12)]);
  list.sort((a, b) => a[1] - b[1]);
  const nextIdx = list.findIndex(([, d]) => d >= T0);
  $('#anTable').innerHTML = '<tr><th>기념일</th><th>날짜</th><th style="text-align:right">D-day</th></tr>' +
    list.map(([k, d], i) => `<tr class="${d < T0 ? 'past' : i === nextIdx ? 'next' : ''}"><td>${k}</td><td>${kDate(d, true)}</td><td class="n">${dd(dayDiff(T0, d))}</td></tr>`).join('');
  out.anniv = `${kDate(s, true)}부터 오늘 ${n0(nth)}일째` + (nextIdx >= 0 ? `\n다음 기념일: ${list[nextIdx][0]} ${kDate(list[nextIdx][1], true)} (${dd(dayDiff(T0, list[nextIdx][1]))})` : '');
}

function add(){
  const b = parseDate($('#adBase').value) || T0, n = parseInt(val('adN'), 10) || 0, u = $('#adUnit').value;
  if (val('adN') === '') { $('#adOut').innerHTML = '<small>더할 값을 넣으세요 (빼려면 −)</small>'; out.add = ''; return; }
  const r = u === 'd' ? addDays(b, n) : u === 'w' ? addDays(b, n * 7) : addMonths(b, u === 'm' ? n : n * 12);
  if (isNaN(r) || r.getFullYear() < 1 || r.getFullYear() > 9999) { $('#adOut').innerHTML = '<small>결과가 1년~9999년 사이를 벗어납니다. 더 작은 값을 넣으세요.</small>'; out.add = ''; return; }
  const ul = { d:'일', w:'주', m:'개월', y:'년' }[u];
  $('#adOut').innerHTML = `${kDate(r, true)}<small>${kDate(b, true)}${n >= 0 ? '부터 ' + n0(n) + ul + ' 뒤' : '부터 ' + n0(-n) + ul + ' 전'} · 오늘 기준 ${dd(dayDiff(T0, r))}</small>`;
  out.add = `${kDate(b, true)} ${n >= 0 ? '+' : ''}${n}${ul} = ${kDate(r, true)}`;
}

function army(){
  const s = parseDate($('#arIn').value), months = +$('#arType').value, label = $('#arType').selectedOptions[0].text.split(' (')[0];
  if (!s) { $('#arOut').innerHTML = '<small>입대일을 고르세요</small>'; $('#arStat').innerHTML = ''; $('#arBar').style.width = 0; return; }
  const end = addDays(addMonths(s, months), -1);
  const total = dayDiff(s, end) + 1, done = Math.min(total, Math.max(0, dayDiff(s, T0) + 1)), left = Math.max(0, dayDiff(T0, end));
  const pct = total ? done / total * 100 : 0;
  $('#arOut').innerHTML = `${kDate(end, true)} 전역<small>${label} ${months}개월 · ${dd(dayDiff(T0, end))}</small>`;
  $('#arBar').style.width = pct.toFixed(1) + '%';
  $('#arStat').innerHTML =
    `<div class="main"><small>복무 진행률</small><b>${pct.toFixed(1)}%</b></div>` +
    `<div><small>복무한 날</small><b>${n0(done)}일</b></div>` +
    `<div><small>남은 날</small><b>${n0(left)}일</b></div>` +
    `<div><small>총 복무일</small><b>${n0(total)}일</b></div>`;
  out.army = `${label} ${kDate(s, true)} 입대 → ${kDate(end, true)} 전역 (${dd(dayDiff(T0, end))}, 진행률 ${pct.toFixed(1)}%)`;
}

function age(){
  const b = parseDate($('#agBirth').value), base = parseDate($('#agBase').value) || T0;
  if (!b) { $('#agOut').innerHTML = '<small>생년월일을 고르세요</small>'; $('#agStat').innerHTML = ''; return; }
  if (b > base) { $('#agOut').innerHTML = '<small>생년월일이 기준 날짜보다 늦습니다</small>'; $('#agStat').innerHTML = ''; return; }
  let man = base.getFullYear() - b.getFullYear();
  const passed = base.getMonth() > b.getMonth() || (base.getMonth() === b.getMonth() && base.getDate() >= b.getDate());
  if (!passed) man--;
  let next = addMonths(b, (man + 1) * 12);
  const toNext = dayDiff(base, next);
  $('#agOut').innerHTML = `만 ${man}세<small>${kDate(b, true)}생 · ${kDate(base, true)} 기준</small>`;
  $('#agStat').innerHTML =
    `<div><small>연 나이 (올해 − 출생연도)</small><b>${base.getFullYear() - b.getFullYear()}세</b></div>` +
    `<div><small>세는 나이 (참고)</small><b>${base.getFullYear() - b.getFullYear() + 1}세</b></div>` +
    `<div><small>다음 생일까지</small><b>${toNext === 0 ? '오늘!' : n0(toNext) + '일'}</b></div>` +
    `<div><small>태어난 지</small><b>${n0(dayDiff(b, base) + 1)}일째</b></div>`;
  out.age = `${kDate(b, true)}생 → 만 ${man}세 (${kDate(base, true)} 기준)`;
}

const RUN = { dday, anniv, add, army, age };
function save(){ const s = { tab: cur, arType: $('#arType').selectedIndex }; $$('input[type=date], input[type=number], select').forEach(e => s[e.id] = e.value); $$('input[type=checkbox]').forEach(e => s[e.id] = e.checked); store.set(KEY, s); }
function load(){
  const s = store.get(KEY);
  if (!s) { $('#adBase').value = ymd(T0); return; } // 목표일·더할 값은 빈칸으로 시작
  $$('input[type=date], input[type=number], select').forEach(e => { if (s[e.id] != null) e.value = s[e.id]; });
  $$('input[type=checkbox]').forEach(e => { if (s[e.id] != null) e.checked = s[e.id]; });
  if (s.arType != null) $('#arType').selectedIndex = s.arType;
  if (s.tab && s.tab !== 'dday') $(`#mainTabs [data-tab=${s.tab}]`).click();
}
function all(){ Object.values(RUN).forEach(f => f()); save(); }

bindTabs();
$('#mainTabs').onTab = t => { cur = t; save(); };
document.addEventListener('input', all);
document.addEventListener('change', all);
$('#copyBtn').addEventListener('click', () => copy((out[cur] || '') + '\n' + location.href));
function milOptions(){
  const M = ruleAt(RULES.military);
  $$('#arType option').forEach(o => { const n = M[o.dataset.k]; if (n) { o.value = n; o.textContent = o.textContent.replace(/\(\d+개월\)/, `(${n}개월)`); } });
}
milOptions(); load(); all();
onRulesLoaded(() => { milOptions(); all(); });
