const KEY = 'ilsang_weeklypay_v1';
// 최저시급·보험료율은 RULES(data/rules.json)에서 연도별로 읽음
let MIN = {};
const RATE = y => { const r = ruleAt(RULES.insurance, y + '-01-01'); return { np: r.np, hi: r.hi, ltc: r.ltcRatio, ei: r.ei }; };
function buildYears(){
  const cy = today().getFullYear(), sel = radio('year');
  MIN = {};
  RULES.minWage.forEach(x => { const y = +x.from.slice(0, 4); if (y >= cy) MIN[y] = x.hourly; });
  const ys = Object.keys(MIN).map(Number).sort();
  $('#years').innerHTML = ys.map(y => `<label><input type="radio" name="year" value="${y}"><span>${y}년 최저 ${MIN[y].toLocaleString()}원${y > cy ? ' (예정)' : ''}</span></label>`).join('');
  const pick = sel && MIN[sel] ? sel : String(MIN[cy] ? cy : ys[ys.length - 1]);
  $$('input[name=year]').forEach(r => { r.checked = r.value === pick; r.addEventListener('change', onYear); r.addEventListener('click', onYear); });
}
function onYear(){
  const w = +val('wage'), y = radio('year');
  $('#wage').placeholder = `예: ${MIN[y].toLocaleString()} (${y}년 최저시급)`;
  if (!w || Object.values(MIN).includes(w)) $('#wage').value = MIN[y];
}
const ORDER = [1,2,3,4,5,6,0];
$('#days').innerHTML = ORDER.map(d =>
  `<div><label for="d${d}" class="${d===0?'sun':d===6?'sat':''}">${WD[d]}</label><input type="number" id="d${d}" min="0" max="24" step="0.5" inputmode="decimal" placeholder="0"></div>`).join('');

const f10 = n => Math.floor(n / 10 + 1e-7) * 10; // 소수 오차(25199.9999…) 때문에 10원 덜 나오지 않게
const h = n => (Math.round(n * 100) / 100).toLocaleString('ko-KR') + '시간';

function save(){ const s = { year: radio('year'), wage: val('wage'), five: $('#five').checked, tax: radio('tax'), q: val('qHours') }; ORDER.forEach(d => s['d'+d] = val('d'+d)); store.set(KEY, s); }
function load(){
  const s = store.get(KEY);
  if (s && s.year && MIN[s.year]) $$('input[name=year]').forEach(r => r.checked = r.value === s.year);
  const y = radio('year');
  $('#wage').value = s && s.wage || '';
  $('#wage').placeholder = `예: ${MIN[y].toLocaleString()} (${y}년 최저시급)`;
  if (!s) return; // 처음엔 빈칸 + 회색 예시만 (연도를 누르면 그해 최저시급이 들어감)
  $('#five').checked = !!s.five; $$('input[name=tax]').forEach(r => r.checked = r.value === s.tax); if (s.q) $('#qHours').value = s.q;
  ORDER.forEach(d => $('#d'+d).value = s['d'+d] || '');
}

function calc(){
  const year = +radio('year'), wage = +val('wage') || 0, R = RATE(year);
  const hrs = ORDER.map(d => Math.max(0, Math.min(24, +val('d'+d) || 0)));
  const H = hrs.reduce((a, b) => a + b, 0);
  const dailyOT = hrs.reduce((a, x) => a + Math.max(0, x - 8), 0);
  const weeklyOT = Math.max(0, (H - dailyOT) - 40);
  const OT = dailyOT + weeklyOT, reg = H - OT;
  const jhH = reg >= 15 ? Math.min(reg, 40) / 40 * 8 : 0;
  const jhPay = jhH * wage, base = H * wage, prem = $('#five').checked ? OT * wage * 0.5 : 0;
  const week = base + prem + jhPay, W = 365 / 7 / 12;
  const month = Math.round(week * W);

  const ww = $('#wageWarn');
  if (wage && wage < MIN[year]) { ww.textContent = `${year}년 최저시급(${won(MIN[year])})보다 낮습니다. 최저임금법 위반이 될 수 있습니다.`; ww.classList.remove('hidden'); }
  else ww.classList.add('hidden');

  $('#jh').className = 'notice' + (jhH ? ' ok' : '');
  $('#jh').innerHTML = !wage ? '시급을 넣어 주세요. 위 연도를 누르면 그해 최저시급이 들어갑니다.' : !H ? '요일별 근무시간을 넣어 주세요. 빠른 입력 버튼을 써도 됩니다.'
    : jhH ? `1주 소정근로 <b>${h(reg)}</b> → 주휴수당 대상입니다. (그 주 정해진 근무일을 모두 나와야 받습니다)`
    : `1주 소정근로 <b>${h(reg)}</b> → 15시간 미만이라 주휴수당 대상이 아닙니다. ${h(15 - reg)} 더 일하면 대상이 됩니다.`;

  if (!wage || !H) { $('#stat').innerHTML = ''; $('#detail').innerHTML = ''; calc.text = ''; save(); return; } // 시급·근무시간을 넣기 전엔 0원 결과를 보이지 않음
  const ded = [];
  const tax = radio('tax');
  if (tax === 'biz') {
    const it = f10(month * 0.03), lt = f10(it * 0.1);
    ded.push(['사업소득세 3%', it], ['지방소득세 0.3%', lt]);
  } else if (tax === 'ins') {
    const hi = f10(month * R.hi);
    ded.push([`국민연금 ${(R.np*100).toFixed(2)}%`, f10(month * R.np)], [`건강보험 ${(R.hi*100).toFixed(3)}%`, hi],
             [`장기요양보험 (건강보험료의 ${(R.ltc*100).toFixed(2)}%)`, f10(hi * R.ltc)], ['고용보험 0.9%', f10(month * R.ei)]);
  }
  const dsum = ded.reduce((a, [, v]) => a + v, 0), net = month - dsum;

  $('#stat').innerHTML =
    `<div><small>주휴수당 (1주)</small><b>${won(jhPay)}</b></div>` +
    `<div><small>주급 (주휴 포함)</small><b>${won(week)}</b></div>` +
    `<div class="${ded.length ? '' : 'main'}"><small>월 예상 급여</small><b>${won(month)}</b></div>` +
    (ded.length ? `<div class="main"><small>공제 후 실수령 (월)</small><b>${won(net)}</b></div>` : '');

  const rows = [
    ['1주 근무시간', h(H)],
    ...(OT ? [['└ 연장근로 (하루 8시간·주 40시간 초과)', h(OT)]] : []),
    ['주휴 시간', h(jhH)],
    ['기본급 (근무시간 × 시급)', won(base)],
    ...(prem ? [['연장근로 가산 (0.5배)', won(prem)]] : []),
    ['주휴수당', won(jhPay)],
    ['월 환산 유급시간 (× 4.345주)', h((reg + jhH + OT) * W)],
    ['월 예상 급여', won(month)],
    ...ded.map(([k, v]) => [k, '−' + won(v)]),
    ...(ded.length ? [['실수령액', won(net)]] : [])
  ];
  $('#detail').innerHTML = '<tr><th>항목</th><th style="text-align:right">금액·시간</th></tr>' + rows.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('') +
    (tax === 'ins' ? `<tr><td colspan="2" class="hint" style="font-size:12.5px">소득세는 빼지 않았습니다. ${!RULES.insurance.some(x => x.from.startsWith(String(year)) && x.ltcRatio != null) && year > 2026 ? year + '년 장기요양보험료율은 공식 고시 전이라 직전 비율로 계산했습니다. ' : ''}월 60시간 미만 근로자는 일부 보험 가입이 제외될 수 있습니다.</td></tr>` : '');

  calc.text = `[주휴수당·월급 계산 결과]\n시급 ${won(wage)} / 1주 ${h(H)} 근무\n주휴수당(1주) ${won(jhPay)}\n주급 ${won(week)}\n월 예상 급여 ${won(month)}` +
    (ded.length ? `\n공제 ${won(dsum)} → 실수령 ${won(net)}` : '') + `\n\n${location.href}`;
  save();
}

$$('[data-q]').forEach(b => b.addEventListener('click', () => {
  const v = +val('qHours') || 0;
  ORDER.forEach(d => $('#d'+d).value = b.dataset.q.includes(String(d)) ? v : '');
  calc();
}));
$('#f').addEventListener('input', calc);
$('#f').addEventListener('change', calc);
$('#copyBtn').addEventListener('click', () => copy(calc.text));
buildYears(); load(); calc();
onRulesLoaded(() => { const w = val('wage'); buildYears(); if (w) onYear(); else $('#wage').placeholder = `예: ${MIN[radio('year')].toLocaleString()} (${radio('year')}년 최저시급)`; calc(); });
