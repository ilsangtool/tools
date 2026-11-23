/* ===== 부동산 대출·자금 계산기 ===== */
const KEY = 'ilsang_homeloan_v2'; // v1은 예시 기본값이 저장돼 있어 버림
const N = s => { const v = String(s == null ? '' : s).replace(/[^\d.-]/g, ''); return v && v !== '-' ? Math.round(+v) || 0 : 0; };
const fmt = n => (Math.round(n) || 0).toLocaleString('ko-KR');
const flr = x => Math.floor(x + 1e-7); // 원 단위 절사 (소수 오차 보정)
const f10 = n => Math.floor(n / 10 + 1e-7) * 10; // 소수 오차(25199.9999…) 때문에 10원 덜 나오지 않게
const pct = r => (Math.round(r * 10000) / 100) + '%';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function kor(n){ // 1,234,500,000 → 12억 3,450만원
  n = Math.round(n); if (!n) return ''; const neg = n < 0; n = Math.abs(n);
  const eok = Math.floor(n / 1e8), man = Math.floor(n % 1e8 / 1e4), won = n % 1e4;
  return (neg ? '-' : '') + [eok ? eok.toLocaleString() + '억' : '', man ? man.toLocaleString() + '만' : '', !eok && !man ? won + '' : ''].filter(Boolean).join(' ') + '원';
}
const wk = n => n >= 1e8 || n <= -1e8 ? kor(n) : fmt(n) + '원';
function moneyInput(el){
  const pos = el.value.length - el.selectionStart, n = N(el.value);
  el.value = el.value.trim() === '' ? '' : fmt(n);
  try { const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p); } catch (_) {}
}
const M = () => ruleAt(RULES.mortgage, ymd(today()));
const RT = () => ruleAt(RULES.realty, ymd(today()));

/* ---- 상환액 계산 ---- */
function pmt(P, ry, n){ const r = ry / 12; return r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n; }
// 체증식: 해마다 g만큼 늘어나는 납입액. 첫 납입액 = 원금 ÷ Σ (1+g)^(연차) ÷ (1+r)^k
function gradFirst(P, ry, n, g){ const r = ry / 12; let s = 0; for (let k = 1; k <= n; k++) s += Math.pow(1 + g, Math.floor((k - 1) / 12)) / Math.pow(1 + r, k); return P / s; }
// 첫 1년 상환액(원금+이자): DSR·DTI 계산용 (체증식은 원리금균등 기준)
function yearPay(P, ry, years, method, prinYears){
  const n = Math.max(1, Math.round(years * 12));
  if (method === 'bullet') return P / (prinYears || years) + P * ry;
  if (method === 'equal') { let s = 0, b = P; const p = P / n; for (let k = 0; k < Math.min(12, n); k++) { s += p + b * ry / 12; b -= p; } return s * (n < 12 ? 12 / n : 1); }
  return pmt(P, ry, n) * 12;
}
const ready = l => l.amount > 0 && l.months > 0 && !!l.method && (l.method !== 'grad' || l.grow > 0);
function schedule(L){ // 월별 상환표
  const n = Math.min(600, Math.max(1, Math.round(L.months))), g = Math.min(Math.max(0, Math.round(L.grace || 0)), n - 1), r = L.rate / 100 / 12, out = [];
  let b = L.amount; const rest = n - g, annu = L.method === 'annuity' ? pmt(b, L.rate / 100, rest) : 0, eqp = b / rest, gr = (L.grow || 0) / 100, g0 = L.method === 'grad' ? gradFirst(b, L.rate / 100, rest, gr) : 0;
  for (let k = 1; k <= n; k++) {
    const it = b * r; let pr = 0;
    if (k > g) pr = L.method === 'bullet' ? (k === n ? b : 0) : L.method === 'equal' ? eqp : L.method === 'grad' ? g0 * Math.pow(1 + gr, Math.floor((k - g - 1) / 12)) - it : annu - it;
    if (k === n) pr = b;
    b = Math.max(0, b - pr); out.push([k, pr, it, pr + it, b]);
  }
  return out;
}

/* ---- 지역·규제 ---- */
function regions(){
  const R = M().regulated || {}, opts = [['seoul', '서울 전 지역 (규제)']];
  (R['경기도'] || []).forEach(n => opts.push(['gg:' + n, '경기 ' + n + ' (규제)']));
  opts.push(['metro', '인천·경기 그 밖 (비규제)'], ['local', '지방 (수도권 밖)']);
  return opts;
}
function zone(code){
  code = code || $('#region').value || 'metro';
  if (code === 'seoul' || code.startsWith('gg:')) { const R = M().regulated || {}; const on = code === 'seoul' ? !!R['서울특별시'] : (R['경기도'] || []).includes(code.slice(3)); return on ? 'reg' : 'metro'; }
  return code === 'local' ? 'local' : 'metro';
}
const metroLike = z => z !== 'local';

/* ---- 스트레스 금리 ---- */
function stressOf(z, rtype, fyears, term){
  const S = M().stress, base = metroLike(z) ? S.metroMortgage : S.localMortgage;
  const stage = metroLike(z) || S.localMortgage >= S.other ? 'stage3' : 'stage2', R = M().stressRatio[stage];
  if (rtype === 'var') return { rate: base, ratio: 1, base };
  const fy = rtype === 'fixed' ? term : Math.min(fyears, term), share = fy / term;
  let i = fy < 5 ? 0 : share < 0.3 ? 1 : share < 0.5 ? 2 : share < 0.7 ? 3 : 4;
  const ratio = (rtype === 'periodic' ? R.periodic : R.mixed)[i];
  return { rate: base * ratio, ratio, base };
}

/* ---- 기존 대출 (대출 계산기에서 DSR 체크) ---- */
let S = store.get(KEY) || {};
S.loans = S.loans || [];
// 아무것도 넣지 않은 빈 대출은 정리 (하나도 안 남으면 renderLoans가 빈 칸 하나를 다시 만듦)
S.loans = S.loans.filter(l => l.name || l.kind || l.amount || l.rate || l.months || l.method);
function existing(z){
  const D = M(), credTot = S.loans.filter(l => l.dsr && (l.kind === 'credit' || l.kind === 'minus')).reduce((s, l) => s + l.amount, 0);
  let pay = 0, interest = 0, bal = 0; const rows = [];
  S.loans.filter(l => l.dsr && ready(l)).forEach(l => {
    const ry = l.rate / 100; let p = 0, note = '';
    if (l.kind === 'credit' || l.kind === 'minus') {
      const st = credTot > D.stress.creditThreshold ? D.stress.other * (l.fixed && l.months >= 60 ? 0 : l.fixed && l.months >= 36 ? 0.6 : 1) : 0;
      p = l.amount / D.creditYears + l.amount * ry; note = `원금 ÷ ${D.creditYears}년 + 이자` + (st ? ` (스트레스 ${pct(st)}는 새 한도 심사 때 반영)` : '');
    } else if (l.kind === 'jeonse') { p = $('#jeonseDsr') && $('#jeonseDsr').checked ? l.amount * ry : 0; note = p ? '이자만' : '제외'; }
    else if (l.kind === 'mortgage') { p = yearPay(l.amount, ry, l.months / 12, l.method); note = '실제 상환액'; }
    else if (l.kind === 'secured') { p = l.amount / D.otherSecuredYears + l.amount * ry; note = `원금 ÷ ${D.otherSecuredYears}년 + 이자`; }
    else { p = yearPay(l.amount, ry, l.months / 12, l.method); note = '실제 상환액'; }
    pay += p; interest += l.amount * ry; bal += l.kind === 'jeonse' && !p ? 0 : l.amount; rows.push([l.name, p, note]);
  });
  const manual = val('other');
  const P = plusPart(z);
  if (manual !== '') return { pay: N(manual) + P.pay, interest: N(manual) * 0.5 + P.interest, bal: N(manual) * 5 + P.bal, rows: [['직접 입력한 기존 대출', N(manual), '']].concat(P.rows), manual: true, plus: P };
  return { pay: pay + P.pay, interest: interest + P.interest, bal: bal + P.bal, rows: rows.concat(P.rows), plus: P };
}
/* ---- 대출 한도 탭: 주담대와 함께 받을 대출 (신용대출 등) ---- */
const PKIND = { credit: '신용대출', minus: '마이너스통장', etc: '기타 대출 (사업자·자동차 등)' };
const PMET = { bullet: '만기일시 (이자만)', annuity: '원리금균등', equal: '원금균등' };
const pReady = l => l.amount > 0 && l.years > 0 && !!l.method && !!l.kind && l.rate !== '' && l.rate != null;
function plusPart(z){
  const D = M(); S.plus = S.plus || [];
  const credOld = S.loans.filter(l => l.dsr && (l.kind === 'credit' || l.kind === 'minus')).reduce((s, l) => s + l.amount, 0);
  const credNew = S.plus.filter(l => pReady(l) && l.kind !== 'etc').reduce((s, l) => s + l.amount, 0);
  const credSt = metroLike(z) && credOld + credNew > D.stress.creditThreshold ? D.stress.other : 0; // 신용대출 합계 1억 초과면 새 신용대출에 스트레스 금리
  let pay = 0, interest = 0, bal = 0, month = 0; const rows = [], list = [];
  S.plus.filter(pReady).forEach((l, i) => {
    const ry = l.rate / 100, n = Math.round(l.years * 12); let p, note;
    if (l.kind === 'etc') { p = yearPay(l.amount, ry, l.years, l.method); note = '실제 상환액'; }
    else { p = l.amount / D.creditYears + l.amount * (ry + credSt); note = `원금 ÷ ${D.creditYears}년 + 이자` + (credSt ? ` (스트레스 ${pct(credSt)})` : ''); }
    const m = l.method === 'bullet' ? l.amount * ry / 12 : l.method === 'equal' ? l.amount / n + l.amount * ry / 12 : pmt(l.amount, ry, n);
    pay += p; interest += l.amount * ry; bal += l.amount; month += m;
    const name = (PKIND[l.kind] || '대출').replace(/\s*\(.*\)/, '');
    rows.push(['함께 받을 ' + name, p, note]); list.push({ l, p, m, note, name });
  });
  return { pay, interest, bal, month, rows, list, credNew, sum: bal };
}

/* ---- 한도 계산 ---- */
function capOf(price, z){ if (!metroLike(z)) return Infinity; const c = M().cap.find(([lim]) => lim == null || price <= lim); return c ? c[1] : Infinity; }
function maxBy(limitPay, ry, years, method){ // 연 상환액 limitPay 안에서 빌릴 수 있는 원금
  if (limitPay <= 0) return 0;
  let lo = 0, hi = 5e10; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (yearPay(m, ry, years, method) <= limitPay) lo = m; else hi = m; }
  return Math.floor(lo / 1e5) * 1e5;
}
function inputs(){
  const z = zone(), D = M(); let term = Math.max(1, +val('term') || 30);
  const termCut = metroLike(z) && term > D.maxTermMetro; if (termCut) term = D.maxTermMetro;
  const miss = [];
  if (!N(val('price'))) miss.push('주택 가격'); if (!radio('owner')) miss.push('주택 보유 (생애최초·무주택 등)'); if (!N(val('income'))) miss.push('연소득');
  if (!$('#region').value) miss.push('주택 소재지'); if (!$('#sector').value) miss.push('대출 받을 곳');
  if (val('rate') === '') miss.push('대출 금리'); if (!$('#term').value) miss.push('만기'); if (!$('#method').value) miss.push('상환 방식');
  if ($('#method').value === 'grad' && val('grow') === '') miss.push('체증률'); if (['mixed', 'periodic'].includes($('#rtype').value) && !$('#fyears').value) miss.push('고정 기간·변동 주기');
  return { price: N(val('price')), z, owner: radio('owner') || 'none', income: N(val('income')), sector: $('#sector').value || 'bank', rate: (+val('rate') || 0) / 100,
    term, termCut, method: $('#method').value || 'annuity', rtype: $('#rtype').value || 'var', grow: (+val('grow') || 0) / 100, fyears: Math.max(1, +val('fyears') || 5), miss };
}
function limitCalc(I, priceOverride){
  const D = M(), price = priceOverride != null ? priceOverride : I.price;
  const ltvRate = D.ltv[I.z][I.owner], ltv = Math.floor(price * ltvRate / 1e5) * 1e5, cap = capOf(price, I.z);
  const st = stressOf(I.z, I.rtype, I.fyears, I.term), ex = existing(I.z);
  const dsrLim = D.dsr[I.sector], dsrMax = maxBy(I.income * dsrLim - ex.pay, I.rate + st.rate, I.term, I.method);
  const dtiLim = D.dti[I.z], dtiMax = maxBy(I.income * dtiLim - ex.interest, I.rate, I.term, I.method);
  const pre = Math.min(ltv, cap, dtiMax);
  const dsrApplies = pre + ex.bal > D.dsr.threshold;
  const final = Math.max(0, dsrApplies ? Math.max(Math.min(pre, dsrMax), Math.min(pre, Math.max(0, D.dsr.threshold - ex.bal))) : pre);
  return { price, ltvRate, ltv, cap, st, ex, dsrLim, dsrMax, dtiLim, dtiMax, dsrApplies, final };
}
const ZN = { reg: '규제지역 (투기과열·조정대상)', metro: '수도권 비규제', local: '지방 비규제' };
const OWN = { first: '생애최초', none: '무주택', oneSell: '처분조건부 1주택', multi: '추가 구입(다주택)' };
let lastLimit = null;
function renderLimit(){
  const I = inputs(), r = limitCalc(I); lastLimit = r;
  $('#regionTag').innerHTML = !$('#region').value ? '' : `<b class="${I.z === 'reg' ? '' : 'ok'}">${ZN[I.z]}</b>${radio('owner') ? ' LTV ' + pct(r.ltvRate) + ' · ' : ' '}${metroLike(I.z) ? '총액 한도 적용 · 6개월 안 전입' : '총액 한도 없음'}`;
  $('#termTag').innerHTML = I.termCut ? `<b>${M().maxTermMetro}년 적용</b> ${I.z === 'metro' ? '수도권은 비규제 지역도' : '수도권·규제지역은'} 주담대 만기가 최대 ${M().maxTermMetro}년입니다 (2025.6.28 시행)` : '';
  renderPlus(I, r);
  $('#lMiss').classList.toggle('on', I.miss.length > 0);
  $('#lMiss').innerHTML = I.miss.length ? '<b>「내 조건 입력」에서 아래 항목을 넣으면 한도가 계산됩니다</b><ul>' + I.miss.map(x => `<li>${x}</li>`).join('') + '</ul><button type="button" class="ghost sm goIn" style="margin-top:10px">조건 입력하러 가기</button>' : '';
  if (I.miss.length) { lastLimit = null; $('#lStat').innerHTML = $('#lBars').innerHTML = $('#lTbl').innerHTML = $('#lNotes').innerHTML = ''; updateBar(); return; }
  const items = [['LTV ' + pct(r.ltvRate), r.ltv], metroLike(I.z) ? ['수도권·규제 총액', r.cap] : null, ['DSR ' + pct(r.dsrLim) + (r.dsrApplies ? '' : ' (미적용)'), r.dsrApplies ? r.dsrMax : null], ['DTI ' + pct(r.dtiLim), r.dtiMax]].filter(x => x && x[1] != null);
  const mx = Math.max(...items.map(x => x[1]), 1), lowV = Math.min(...items.map(x => x[1]));
  const bind = items.find(x => x[1] === lowV)[0].split(' ')[0];
  const monthly = I.method === 'equal' ? r.final / (I.term * 12) + r.final * I.rate / 12 : I.method === 'grad' ? gradFirst(r.final, I.rate, I.term * 12, I.grow) : pmt(r.final, I.rate, I.term * 12);
  $('#lStat').innerHTML = statBox([['대출 가능 금액', wk(r.final), 'main'], ['한도를 정한 조건', bind], ['첫 달 상환액 (실제 금리)', fmt(monthly) + '원'], ['필요한 자기자금 (집값 − 대출)', wk(Math.max(0, I.price - r.final))]]);
  $('#lBars').innerHTML = items.map(([n, v]) => `<div class="${v === lowV ? 'min' : ''}"><span>${n}</span><i><span style="width:${Math.min(100, v / mx * 100)}%"></span></i><em>${wk(v)}</em></div>`).join('');
  const D = M(), dsrPay = yearPay(r.final, I.rate + r.st.rate, I.term, I.method) + r.ex.pay;
  $('#lTbl').innerHTML = rows([
    ['LTV 한도 <small>(' + fmt(I.price) + ' × ' + pct(r.ltvRate) + ', ' + ZN[I.z] + ' · ' + OWN[I.owner] + ')</small>', r.ltv],
    metroLike(I.z) ? ['수도권·규제지역 주담대 총액 한도 <small>(시가 15억 이하 6억 · 25억 이하 4억 · 초과 2억)</small>', r.cap] : '-',
    ['스트레스 금리 <small>(' + (metroLike(I.z) ? '수도권·규제' : '지방') + ' ' + pct(r.st.base) + ' × 반영 ' + Math.round(r.st.ratio * 100) + '%)</small>', pct(r.st.rate)],
    ['DSR 계산 금리 <small>(실제 ' + pct(I.rate) + ' + 스트레스)</small>', pct(I.rate + r.st.rate)],
    ['기존 대출 연간 원리금 <small>(' + (r.ex.rows.map(x => x[0]).join(', ') || '없음') + ')</small>', r.ex.pay],
    ['DSR 한도 <small>(연소득 × ' + pct(r.dsrLim) + ' − 기존 원리금, ' + I.term + '년)</small>', r.dsrApplies ? r.dsrMax : '총대출 1억 이하라 미적용'],
    ['DTI 한도 <small>(연소득 × ' + pct(r.dtiLim) + ', 스트레스 없음)</small>', r.dtiMax],
    ['= 대출 가능 금액 (가장 작은 값)', r.final, 'sum'],
    ['이 금액일 때 DSR', pct(I.income ? dsrPay / I.income : 0)]
  ]);
  const notes = [];
  if (I.owner === 'multi' && metroLike(I.z)) notes.push('수도권·규제지역에서 집을 더 사는 다주택자는 주택구입 목적 주담대가 막혀 있습니다(LTV 0%).');
  if (I.owner === 'oneSell') notes.push('처분조건부 1주택자는 기존 주택을 정해진 기간(보통 6개월) 안에 팔아야 합니다.');
  if (I.owner === 'first') notes.push('생애최초 LTV 우대는 세대 전원 무주택이 조건이며, 수도권·규제지역은 6개월 안에 전입해야 합니다.');
  if (I.method === 'grad') notes.push('체증식은 첫해 상환액이 적고 해마다 늘어납니다. DSR은 은행 관행대로 원리금균등 기준으로 계산했으며, 실제 심사 방식은 금융회사마다 다를 수 있습니다.');
  if (I.termCut) notes.push(`수도권(비규제 지역 포함)·규제지역 주담대 만기는 최대 ${D.maxTermMetro}년이라 ${D.maxTermMetro}년으로 계산했습니다 (2025.6.28 시행).`);
  if (I.z === 'reg') notes.push('규제지역에서는 전세대출이 있는 사람이 3억 넘는 아파트를 사기 어렵고, 1억 넘는 신용대출을 받은 뒤 1년 동안은 규제지역 주택 구입이 제한됩니다.');
  if (!metroLike(I.z) && M().stress.localMortgage < M().stress.other) notes.push(`지방 주담대 스트레스 금리는 ${pct(M().stress.localMortgage)}(유예)입니다. 유예가 끝나면 ${pct(M().stress.other)}로 오릅니다.`);
  notes.push('정책대출(디딤돌·보금자리론)은 소득·집값 요건과 한도가 따로 있으며 DSR 대신 DTI(60%)를 적용합니다.');
  $('#lNotes').innerHTML = notes.map(n => `<p>· ${n}</p>`).join('') + `<p class="hint">규제 기준: ${esc(RULES.mortgage.filter(x => x.from <= ymd(today())).map(x => x.source).filter(Boolean).join(' / '))}</p>`;
  updateBar();
  $('#otherInfo').textContent = r.ex.manual ? '직접 입력한 기존 대출 원리금을 씁니다.' : r.ex.rows.length ? `기존 대출 ${r.ex.rows.length}건(대출 계산기 탭에서 DSR 체크)의 연간 원리금 ${fmt(r.ex.pay)}원을 반영했습니다.` : '';
}
const rows = L => L.map(r => r === '-' ? '' : `<tr class="${r[2] || ''}"><td>${r[0]}</td><td class="n">${typeof r[1] === 'number' ? fmt(r[1]) + '원' : r[1]}</td></tr>`).join('');
const statBox = L => L.map(([l, v, c]) => `<div class="${c || ''}"><small>${l}</small><b>${v}</b></div>`).join('');

function plusRow(l, n){
  const opt = (o, v, ph) => `<option value="" disabled${v ? '' : ' selected'}>${ph}</option>` + Object.entries(o).map(([k, x]) => `<option value="${k}"${v === k ? ' selected' : ''}>${x}</option>`).join('');
  return `<div class="loan" data-pid="${l.id}"><div class="loan-h"><b>추가 대출 ${n}</b><button type="button" class="ghost sm" data-pact="del">지우기</button></div><div class="loan-g">
    <div><label class="f">종류</label><select data-p="kind">${opt(PKIND, l.kind, '종류 선택')}</select></div>
    <div><label class="f">대출 금액 (원)</label><input type="text" class="n" data-p="amount" inputmode="numeric" value="${l.amount ? fmt(l.amount) : ''}" placeholder="예: 50,000,000"><div class="kor">${l.amount ? kor(l.amount) : ''}</div></div>
    <div><label class="f">금리 (연 %)</label><input type="number" class="n" data-p="rate" step="0.01" min="0" max="30" inputmode="decimal" value="${l.rate === '' || l.rate == null ? '' : l.rate}" placeholder="예: 5.5"></div>
    <div><label class="f">기간</label><select data-p="years">${opt({ 1: '1년', 2: '2년', 3: '3년', 5: '5년', 7: '7년', 10: '10년', 20: '20년', 30: '30년' }, l.years ? String(l.years) : '', '기간 선택')}</select></div>
    <div><label class="f">상환 방식</label><select data-p="method">${opt(PMET, l.method, '상환 방식 선택')}</select></div>
  </div></div>`;
}
function renderPlus(I, r){
  S.plus = S.plus || [];
  const box = $('#plusList');
  if (!box.contains(document.activeElement)) box.innerHTML = S.plus.map((l, i) => plusRow(l, i + 1)).join('');
  const P = r.ex.plus || { list: [] };
  if (I.miss.length || !P.list.length) { $('#plusSum').innerHTML = S.plus.length && !I.miss.length ? '<p class="hint">종류·금액·금리·기간·상환 방식을 모두 넣으면 합산됩니다.</p>' : ''; return; }
  const mainM = I.method === 'equal' ? r.final / (I.term * 12) + r.final * I.rate / 12 : I.method === 'grad' ? gradFirst(r.final, I.rate, I.term * 12, I.grow) : pmt(r.final, I.rate, I.term * 12);
  const tot = r.final + P.sum, totM = mainM + P.month;
  const dsrPay = yearPay(r.final, I.rate + r.st.rate, I.term, I.method) + r.ex.pay;
  const warn = [];
  if (P.credNew > I.income) warn.push('신용대출은 연소득 이내로 제한됩니다 (2025.6.28 시행). 넣은 신용대출 합계가 연소득을 넘습니다.');
  if (r.final === 0) warn.push('추가 대출의 원리금만으로 DSR 한도가 차서 주택담보대출을 받을 수 없습니다.');
  $('#plusSum').innerHTML = `<div class="stat">${statBox([['총 대출 (합산)', wk(tot), 'main'], ['월 상환액 합계 (첫 달)', fmt(totM) + '원'], ['합산 DSR', pct(I.income ? dsrPay / I.income : 0)]])}</div>
  <div class="t-scroll"><table class="t">` + rows([
    ['주택담보대출 <small>(위 한도, ' + pct(I.rate) + ', ' + I.term + '년)</small>', r.final],
    ...P.list.map(x => [x.name + ' <small>(' + pct(x.l.rate / 100) + ', ' + x.l.years + '년, ' + PMET[x.l.method].split(' ')[0] + ')</small>', x.l.amount]),
    ['= 총 대출', tot, 'sum'],
    ['월 상환액 <small>(주담대 ' + fmt(mainM) + '원 + 추가 대출 ' + fmt(P.month) + '원)</small>', Math.round(totM)],
    ['추가 대출 DSR 연간 원리금 <small>(' + P.list.map(x => x.name + ': ' + x.note).join(' / ') + ')</small>', P.pay],
    ['필요한 자기자금 <small>(집값 − 총 대출)</small>', Math.max(0, I.price - tot)]
  ]) + `</table></div>` + (warn.length ? warn.map(w => `<p class="bad">${w}</p>`).join('') : '') +
  '<p class="hint">추가 대출의 원리금이 DSR에 먼저 들어가므로, 추가 대출이 클수록 위 주택담보대출 한도가 줄어듭니다.</p>';
}
$('#plusAdd').onclick = () => { S.plus = S.plus || []; const l = { id: uid(), kind: '', amount: 0, rate: '', years: 0, method: '' }; S.plus.push(l); saveS(); renderAll(); const el = $(`#plusList [data-pid="${l.id}"] select`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } };
$('#plusList').addEventListener('input', ev => {
  ev.stopPropagation(); const t = ev.target, row = t.closest('[data-pid]'), l = row && S.plus.find(x => x.id === row.dataset.pid); if (!l) return;
  const k = t.dataset.p;
  if (k === 'amount') { moneyInput(t); l.amount = Math.min(1e12, N(t.value)); row.querySelector('.kor').textContent = l.amount ? kor(l.amount) : ''; }
  else if (k === 'rate') l.rate = t.value === '' ? '' : clampIn(t, 0, 30); else if (k === 'years') l.years = +t.value; else l[k] = t.value;
  renderAll();
});
$('#plusList').addEventListener('change', ev => { ev.stopPropagation(); if (ev.target.tagName === 'SELECT') ev.target.dispatchEvent(new Event('input', { bubbles: true })); });
$('#plusList').addEventListener('click', ev => { const b = ev.target.closest('[data-pact=del]'); if (!b) return; const id = b.closest('[data-pid]').dataset.pid; b.blur(); S.plus = S.plus.filter(x => x.id !== id); saveS(); renderAll(); });

/* ---- 필요 연봉·살 수 있는 집값 ---- */
function renderIncome(){
  const I = inputs(), D = M(), want = N(val('want'));
  const st = stressOf(I.z, I.rtype, I.fyears, I.term), ex = existing(I.z);
  if (lastLimit) $('#wantQuick').innerHTML = [['LTV 최대', lastLimit.ltv], metroLike(I.z) ? ['총액 한도', Math.min(lastLimit.ltv, lastLimit.cap)] : null].filter(Boolean).map(([n, v]) => `<button type="button" class="ghost" data-v="${v}">${n} ${wk(v)}</button>`).join('');
  const need0 = I.miss.filter(x => !['주택 가격', '주택 보유 (생애최초·무주택 등)', '연소득'].includes(x));
  if (!want || need0.length) { $('#iStat').innerHTML = ''; $('#iTbl').innerHTML = want ? `<tr><td class="hint">「내 조건 입력」에서 채울 칸: ${need0.join(', ')}</td></tr>` : ''; } else {
    const payS = yearPay(want, I.rate + st.rate, I.term, I.method), pay0 = yearPay(want, I.rate, I.term, I.method);
    const need = lim => (payS + ex.pay) / lim, needDti = (pay0 + ex.interest) / D.dti[I.z];
    const main = Math.max(need(D.dsr[I.sector]), (want + ex.bal > D.dsr.threshold) ? 0 : 0, needDti);
    const ltvOk = !I.price || want <= Math.min(Math.floor(I.price * D.ltv[I.z][I.owner]), capOf(I.price, I.z));
    $('#iStat').innerHTML = statBox([['필요한 연소득', wk(Math.ceil(main / 1e5) * 1e5), 'main'], ['월 소득으로', wk(Math.ceil(main / 12 / 1e4) * 1e4)], ['연간 원리금 (스트레스 반영)', wk(payS)]]);
    $('#iTbl').innerHTML = rows([
      ['은행 DSR 40% 기준 필요 연봉', Math.ceil(need(D.dsr.bank) / 1e5) * 1e5],
      ['2금융 DSR 50% 기준 필요 연봉', Math.ceil(need(D.dsr.nonbank) / 1e5) * 1e5],
      ['DTI ' + pct(D.dti[I.z]) + ' 기준 필요 연봉 <small>(스트레스 없음)</small>', Math.ceil(needDti / 1e5) * 1e5],
      ['계산 조건 <small>(' + pct(I.rate) + ' + 스트레스 ' + pct(st.rate) + ', ' + I.term + '년' + (I.termCut ? ' (' + $('#term').value + '년 선택 → ' + (I.z === 'metro' ? '수도권 비규제도' : '수도권·규제지역') + ' 최대 ' + I.term + '년)' : '') + ', ' + $('#method').selectedOptions[0].text + ')</small>', ''],
      ex.pay ? ['기존 대출 연간 원리금 포함', ex.pay] : '-',
      !ltvOk ? ['<span class="bad">주의: 이 금액은 지금 집값의 LTV·총액 한도를 넘습니다</span>', ''] : '-',
      want + ex.bal <= D.dsr.threshold ? ['총대출이 1억 이하라 실제로는 DSR이 적용되지 않습니다', ''] : '-'
    ]);
  }
  // 살 수 있는 집값
  const cash = N(val('cash'));
  if (!cash || !I.income || I.miss.length) { $('#aStat').innerHTML = ''; $('#aNote').textContent = '연소득과 현금을 넣으면 살 수 있는 최대 집값을 찾습니다.'; return; }
  const costOf = p => $('#cashCost').checked ? acqCost(p, null).total : 0;
  let lo = 0, hi = 1e11;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2, L = limitCalc(I, m).final; if (m - L + costOf(m) <= cash) lo = m; else hi = m; }
  const p = Math.floor(lo / 1e6) * 1e6, L = limitCalc(I, p);
  $('#aStat').innerHTML = statBox([['살 수 있는 최대 집값', wk(p), 'main'], ['그때 대출', wk(L.final)], ['현금 사용', wk(p - L.final + costOf(p))]]);
  $('#aNote').textContent = `${ZN[I.z]} · ${OWN[I.owner]} 조건입니다.` + ($('#cashCost').checked ? ` 부대비용 약 ${wk(costOf(p))}을 포함했습니다.` : '');
}

/* ---- 대출 계산기 ---- */
const KIND = { mortgage: '주택담보대출', credit: '신용대출', minus: '마이너스통장', jeonse: '전세자금대출', car: '자동차 할부·대출', student: '학자금대출', biz: '사업자대출', secured: '예적금·기타 담보대출', etc: '기타' };
const MET = { annuity: '원리금균등', equal: '원금균등', grad: '체증식', bullet: '만기일시' };
let selId = S.loans[0] && S.loans[0].id;
$('#lkind').innerHTML += Object.entries(KIND).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
function saveS(){ store.set(KEY, Object.assign(S, { form: formState() })); }
// 대출 하나 = 이름표가 붙은 입력 카드 (휴대폰에서도 칸이 다 보이게)
function loanRow(l, n){
  const opt = (o, v, ph) => `<option value="" disabled${v ? '' : ' selected'}>${ph}</option>` + Object.entries(o).map(([k, x]) => `<option value="${k}"${v === k ? ' selected' : ''}>${x}</option>`).join('');
  return `<div class="loan${l.id === selId ? ' sel' : ''}" data-id="${l.id}">
  <div class="loan-h"><b>대출 ${n}</b><span><button type="button" class="ghost sm" data-act="view">상환표 보기</button> <button type="button" class="ghost sm" data-act="del" aria-label="이 대출 지우기">지우기</button></span></div>
  <div class="loan-g">
    <div><label class="f">이름 <span class="opt">선택</span></label><input type="text" data-k="name" value="${esc(l.name)}" placeholder="예: 주담대"></div>
    <div><label class="f">종류</label><select data-k="kind">${opt(KIND, l.kind, '종류 선택')}</select></div>
    <div><label class="f">대출 금액 (원)</label><input type="text" class="n" data-k="amount" inputmode="numeric" value="${l.amount ? fmt(l.amount) : ''}" placeholder="예: 300,000,000"><div class="kor">${l.amount ? wk(l.amount) : ''}</div></div>
    <div><label class="f">금리 (연 %)</label><input type="number" class="n" data-k="rate" step="0.01" min="0" max="100" inputmode="decimal" value="${l.rate || ''}" placeholder="예: 4.2"></div>
    <div><label class="f">기간 (개월)</label><input type="number" class="n" data-k="months" inputmode="numeric" min="1" max="600" value="${l.months || ''}" placeholder="예: 360 (30년)"><div class="quick">${[[120, '10년'], [240, '20년'], [360, '30년'], [480, '40년']].map(([m, t]) => `<button type="button" class="ghost" data-months="${m}">${t}</button>`).join('')}</div></div>
    <div><label class="f">상환 방식</label><select data-k="method">${opt(MET, l.method, '상환 방식 선택')}</select>${l.method === 'grad' ? `<input type="number" data-k="grow" step="0.1" value="${l.grow || ''}" placeholder="체증률(연 %) 예: 2" style="margin-top:6px">` : ''}</div>
    <div><label class="f">거치 기간 (개월) <span class="opt">선택</span></label><input type="number" class="n" data-k="grace" inputmode="numeric" value="${l.grace || ''}" placeholder="없으면 비움"></div>
    <div class="loan-c"><label class="chk"><input type="checkbox" data-k="fixed"${l.fixed ? ' checked' : ''}><span>고정금리</span></label><label class="chk"><input type="checkbox" data-k="dsr"${l.dsr ? ' checked' : ''}><span>DSR 계산에 넣기</span></label></div>
  </div></div>`;
}
// 숫자 칸 한도: 벗어나면 칸 값을 한도로 고치고 알려 줌 (아주 큰 기간을 넣으면 상환표가 끝없이 길어져 화면이 멈추는 것을 막음)
function clampIn(t, lo, hi, int){
  let v = +t.value || 0; if (int) v = Math.round(v);
  const c = Math.min(hi, Math.max(lo, v));
  if (t.value !== '' && c !== v) { t.value = c; toast(`${lo}~${hi.toLocaleString()} 사이로 넣어 주세요`); }
  return c;
}
const blankLoan = () => ({ id: uid(), name: '', kind: '', amount: 0, rate: 0, months: 0, method: '', grace: 0, dsr: false, fixed: false });
function renderLoans(){
  const q = val('lq').toLowerCase(), kd = $('#lkind').value;
  if (!S.loans.length) { const l = blankLoan(); S.loans.push(l); selId = l.id; } // 처음부터 입력칸이 보이게 빈 대출 하나
  $('#lFilters').classList.toggle('hidden', S.loans.length < 4); // 대출이 많을 때만 찾기 칸
  const list = S.loans.map((l, i) => [l, i + 1]).filter(([l]) => (!q || (l.name + (KIND[l.kind] || '')).toLowerCase().includes(q)) && (!kd || l.kind === kd));
  const hid = S.loans.length - list.length;
  $('#loanTbl').innerHTML = list.map(([l, n]) => loanRow(l, n)).join('') +
    (hid ? `<p class="hint">찾기·종류 조건 때문에 대출 ${hid}개가 숨겨져 있습니다. <button type="button" class="ghost sm" id="lReset">모두 보기</button></p>` : '');
  const T = S.loans.filter(ready).reduce((t, l) => { const s = schedule(l); t.m += s[Math.min(l.grace || 0, s.length - 1)][3]; t.i += s.reduce((a, x) => a + x[2], 0); t.b += l.amount; return t; }, { m: 0, i: 0, b: 0 });
  $('#sumStat').innerHTML = statBox([['대출 잔액 합계', wk(T.b)], ['이번 달 상환액 합계', fmt(T.m) + '원', 'main'], ['남은 이자 합계', wk(T.i)]]);
  renderSched();
}
function renderSched(){
  const L = S.loans.find(l => l.id === selId) || S.loans[0];
  const ok = !!(L && ready(L));
  $$('#schedCard .period, #schedCard .actions').forEach(e => e.classList.toggle('hidden', !ok)); // 상환표가 생기기 전엔 보기·저장 숨김
  if (!ok) { $('#schedCard').classList.toggle('hidden', !L); if (L) { $('#schedName').textContent = ''; $('#schedStat').innerHTML = '<div><small>안내</small><b style="font-size:16px">금액·금리·기간(월)·상환 방식' + (L.method === 'grad' ? '·체증률' : '') + '을 넣으면 상환표가 나옵니다</b></div>'; $('#cmpTbl').innerHTML = $('#schedTbl').innerHTML = ''; } return; }
  $('#schedCard').classList.remove('hidden'); selId = L.id;
  const s = schedule(L), tot = s.reduce((t, x) => [t[0] + x[1], t[1] + x[2]], [0, 0]);
  $('#schedName').textContent = `${L.name} · ${KIND[L.kind] || ''} ${wk(L.amount)} · 연 ${L.rate}% · ${L.months}개월 · ${MET[L.method]}${L.grace ? ` · 거치 ${L.grace}개월` : ''}`;
  $('#schedStat').innerHTML = statBox([['첫 달 납입', fmt(s[0][3]) + '원'], [L.grace ? '거치 후 첫 납입' : '마지막 달 납입', fmt(L.grace ? s[Math.min(L.grace, s.length - 1)][3] : s[s.length - 1][3]) + '원'], ['총이자', wk(tot[1]), 'main'], ['총 상환액', wk(tot[0] + tot[1])]]);
  // 상환 방식 비교
  const cmp = Object.keys(MET).filter(m => m !== 'grad' || L.grow).map(m => { const x = schedule(Object.assign({}, L, { method: m })); return [m, x[Math.min(L.grace || 0, x.length - 1)][3], x.reduce((a, y) => a + y[2], 0)]; });
  const best = Math.min(...cmp.map(c => c[2]));
  $('#cmpTbl').innerHTML = '<thead><tr><th>상환 방식 비교</th><th class="n">첫 납입</th><th class="n">총이자</th></tr></thead><tbody>' + cmp.map(([m, f, i]) => `<tr class="${i === best ? 'best' : ''}"><td>${MET[m]}${m === L.method ? ' (지금)' : ''}</td><td class="n">${fmt(f)}원</td><td class="n">${fmt(i)}원</td></tr>`).join('') + '</tbody>';
  const yr = $('#schedView').value === 'y';
  let R = s;
  if (yr) { R = []; for (let i = 0; i < s.length; i += 12) { const c = s.slice(i, i + 12); R.push([Math.floor(i / 12) + 1, c.reduce((a, x) => a + x[1], 0), c.reduce((a, x) => a + x[2], 0), c.reduce((a, x) => a + x[3], 0), c[c.length - 1][4]]); } }
  $('#schedTbl').innerHTML = `<thead><tr><th>${yr ? '연차' : '회차'}</th><th class="n">원금</th><th class="n">이자</th><th class="n">납입액</th><th class="n">잔액</th></tr></thead><tbody>${R.map(x => `<tr><td>${x[0]}${yr ? '년' : ''}</td><td class="n">${fmt(x[1])}</td><td class="n">${fmt(x[2])}</td><td class="n">${fmt(x[3])}</td><td class="n">${fmt(x[4])}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td class="n">${fmt(tot[0])}</td><td class="n">${fmt(tot[1])}</td><td class="n">${fmt(tot[0] + tot[1])}</td><td></td></tr></tbody>`;
}
$('#loanTbl').addEventListener('input', ev => {
  const tr = ev.target.closest('.loan'), l = tr && S.loans.find(x => x.id === tr.dataset.id); if (!l) return;
  const k = ev.target.dataset.k, t = ev.target;
  if (k === 'name') l.name = t.value; else if (k === 'amount') { moneyInput(t); l.amount = Math.min(1e12, N(t.value)); const kr = t.parentNode.querySelector('.kor'); if (kr) kr.textContent = l.amount ? wk(l.amount) : ''; }
  else if (k === 'rate') l.rate = clampIn(t, 0, 100); else if (k === 'months') l.months = clampIn(t, 0, 600, true); else if (k === 'grace') l.grace = clampIn(t, 0, Math.max(0, (l.months || 600) - 1), true);
  else if (k === 'grow') l.grow = clampIn(t, 0, 20); else if (k === 'kind') l[k] = t.value; else if (k === 'method') { l.method = t.value; saveS(); renderLoans(); renderLimit(); return; } else if (k === 'dsr' || k === 'fixed') l[k] = t.checked;
  selId = l.id; saveS(); $$('#loanTbl .loan').forEach(x => x.classList.toggle('sel', x.dataset.id === selId)); renderSched(); renderSum(); renderLimit(); renderIncome();
});
function renderSum(){ const T = S.loans.filter(ready).reduce((t, l) => { const s = schedule(l); t.m += s[Math.min(l.grace || 0, s.length - 1)][3]; t.i += s.reduce((a, x) => a + x[2], 0); t.b += l.amount; return t; }, { m: 0, i: 0, b: 0 }); $('#sumStat').innerHTML = statBox([['대출 잔액 합계', wk(T.b)], ['이번 달 상환액 합계', fmt(T.m) + '원', 'main'], ['남은 이자 합계', wk(T.i)]]); }
$('#loanTbl').addEventListener('change', ev => { if (ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox') ev.target.dispatchEvent(new Event('input', { bubbles: true })); });
$('#loanTbl').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.id === 'lReset') { clearLoanFilter(); renderLoans(); return; }
  const id = b.closest('.loan').dataset.id;
  if (b.dataset.months) { const inp = b.closest('.loan').querySelector('[data-k=months]'); inp.value = b.dataset.months; inp.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (b.dataset.act === 'del') { S.loans = S.loans.filter(x => x.id !== id); if (selId === id) selId = S.loans[0] && S.loans[0].id; }
  else { selId = id; $('#schedCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  saveS(); renderLoans(); renderLimit();
});
function clearLoanFilter(){ $('#lq').value = ''; $('#lkind').value = ''; }
$('#loanAdd').onclick = () => { clearLoanFilter(); const l = blankLoan(); S.loans.push(l); selId = l.id; saveS(); renderLoans(); const el = $(`#loanTbl .loan[data-id="${l.id}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.querySelector('[data-k=kind]').focus({ preventScroll: true }); } };
$('#schedCsv').onclick = () => {
  const L = S.loans.find(l => l.id === selId); if (!L || !ready(L)) return;
  const body = [['회차', '원금', '이자', '납입액', '잔액']].concat(schedule(L).map(x => x.map(Math.round))).map(r => r.join(',')).join('\r\n');
  download(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), `상환표_${L.name}.csv`);
};

/* ---- 취득 비용 ---- */
function tierFee(price, tiers){ for (const [lim, r, cap] of tiers) if (lim == null || price < lim) return { fee: flr(cap ? Math.min(price * r, cap) : price * r), r, cap }; }
function acqCost(price, loan){
  const A = RT().acq, z = zone(), adj = z === 'reg', n = +$('#houses').value || 1, temp = $('#temp2').checked, big = $('#area').value === 'l';
  let rate, heavy = 0;
  if (n === 1 || (n === 2 && (!adj || temp))) {
    rate = price <= A.tiers[0] ? 0.01 : price <= A.tiers[1] ? Math.round((price * 2 / 3e8 - 3) / 100 * 1e5) / 1e5 : 0.03;
  } else if (n === 2) { rate = A.heavy2; heavy = 8; } else if (n === 3) { rate = adj ? A.heavy3 : A.heavy2; heavy = adj ? 12 : 8; } else { rate = A.heavy3; heavy = 12; }
  let tax = flr(price * rate), cut = 0;
  if ($('#firstCut').checked && n === 1 && price <= A.firstPrice) cut = Math.min(tax, A.firstCap);
  const edu = heavy ? flr(price * A.eduHeavy) : flr((tax - cut) * A.eduRate);
  const farm = big ? flr(price * (heavy === 12 ? A.farm.h12 : heavy === 8 ? A.farm.h8 : A.farm.normal)) : 0;
  const R = RT(), br = val('brokerRate') !== '' ? { fee: flr(price * (+val('brokerRate') / 100)), r: +val('brokerRate') / 100 } : tierFee(price, R.brokerSale);
  const brokerFee = flr(br.fee * ($('#vat').checked ? 1.1 : 1));
  const stamp = (R.stamp.find(([l]) => l == null || price <= l) || [0, 0])[1];
  const L = loan != null ? loan : 0, ls = flr(((R.loanStamp.find(([l]) => l == null || L <= l) || [0, 0])[1]) / 2);
  return { rate, heavy, tax, cut, edu, farm, broker: brokerFee, brR: br.r, brCap: br.cap, stamp, loanStamp: ls, total: tax - cut + edu + farm + brokerFee + stamp + ls };
}
function renderCost(){
  const price = N(val('price')), cm = [!price && '주택 가격', !$('#region').value && '주택 소재지', !$('#houses').value && '주택 수', !$('#area').value && '전용면적'].filter(Boolean);
  if (cm.length) { $('#cStat').innerHTML = `<div><small>안내</small><b style="font-size:16px">채울 칸: ${cm.join(', ')}</b></div>`; $('#cTbl').innerHTML = ''; return; }
  const loan = val('loanAmt') !== '' ? N(val('loanAmt')) : (lastLimit ? lastLimit.final : 0), c = acqCost(price, loan);
  $('#loanAmt').placeholder = lastLimit ? '한도 결과 ' + fmt(lastLimit.final) : '예: 400,000,000';
  $('#cStat').innerHTML = statBox([['부대비용 합계', wk(c.total), 'main'], ['취득세 등 세금', wk(c.tax - c.cut + c.edu + c.farm)], ['중개보수', wk(c.broker)]]);
  $('#cTbl').innerHTML = rows([
    ['취득세 <small>(' + (c.heavy ? '중과 ' : '') + (Math.round(c.rate * 100000) / 1000) + '%' + (zone() === 'reg' ? ', 조정대상지역' : '') + ')</small>', c.tax],
    c.cut ? ['− 생애최초 감면 <small>(최대 ' + fmt(RT().acq.firstCap) + '원)</small>', c.cut] : '-',
    ['지방교육세', c.edu], ['농어촌특별세 <small>(85㎡ 초과만)</small>', c.farm],
    ['중개보수 <small>(' + (Math.round(c.brR * 10000) / 100) + '%' + (c.brCap ? ', 한도 ' + fmt(c.brCap) + '원' : '') + ($('#vat').checked ? ', 부가세 포함' : '') + ' · 상한, 협의 가능)</small>', c.broker],
    ['매매계약서 인지세 <small>(1억 이하 주택 비과세)</small>', c.stamp],
    ['대출 약정 인지세 <small>(대출 ' + wk(loan) + ', 금융회사와 절반씩)</small>', c.loanStamp],
    ['= 합계', c.total, 'sum'],
    ['참고: 집값 + 부대비용 − 대출 = 필요한 현금', wk(price + c.total - loan)]
  ]);
}

/* ---- 전월세 전환 ---- */
function renderRent(){
  const R = RT(), base = val('base') !== '' ? +val('base') / 100 : ruleAt(RULES.baseRate, ymd(today())).rate;
  if (val('base') === '') $('#base').placeholder = (base * 100).toFixed(2);
  const legal = Math.min(R.convMax, base + R.convAdd), rate = val('conv') !== '' ? +val('conv') / 100 : legal;
  $('#convInfo').textContent = `법정 전환율 상한 = min(연 ${pct(R.convMax)}, 기준금리 ${pct(base)} + ${pct(R.convAdd)}) = ${pct(legal)}. 기준금리는 ${ruleAt(RULES.baseRate, ymd(today())).source || ''}`;
  const d0 = N(val('dep0')), d1 = N(val('dep1')), r0 = N(val('rent0'));
  if (!d0) { $('#rStat').innerHTML = '<div><small>안내</small><b style="font-size:16px">지금 보증금과 바꿀 보증금을 넣고 계산하기를 누르세요</b></div>'; $('#rTbl').innerHTML = ''; return; }
  const diff = d0 - d1, rent = r0 + Math.round(diff * rate / 12);
  const lease = tierFee(d0 + r0 * (d0 < 5e7 ? 70 : 100), R.brokerLease);
  $('#rStat').innerHTML = statBox([[diff >= 0 ? '바뀐 월세' : '줄어드는 월세 후', fmt(Math.max(0, rent)) + '원', 'main'], ['보증금 변화', (diff >= 0 ? '−' : '+') + wk(Math.abs(diff))], ['적용 전환율', pct(rate)]]);
  $('#rTbl').innerHTML = rows([
    ['보증금 ' + wk(d0) + ' → ' + wk(d1), diff >= 0 ? '월세로 바꿀 금액 ' + wk(diff) : '보증금 올려 줄 금액 ' + wk(-diff)],
    ['월세 변화 <small>(금액 × ' + pct(rate) + ' ÷ 12)</small>', (diff >= 0 ? '+' : '−') + fmt(Math.abs(Math.round(diff * rate / 12))) + '원'],
    ['월세 100만원을 보증금으로 바꾸면', wk(1e6 * 12 / rate)],
    ['임대차 중개보수 상한 <small>(거래금액 = 보증금 + 월세 × 100, 5천만 미만은 × 70)</small>', lease.fee],
    rate > legal + 1e-9 ? ['<span class="bad">입력한 전환율이 법정 상한을 넘습니다 (계약 중 전환 시 상한 적용)</span>', ''] : '-'
  ]);
}

/* ---- 공통 ---- */
function formState(){ const o = {}; ['price', 'region', 'income', 'sector', 'rate', 'term', 'method', 'grow', 'rtype', 'fyears', 'other', 'want', 'cash', 'houses', 'area', 'loanAmt', 'brokerRate', 'base', 'conv', 'dep0', 'dep1', 'rent0'].forEach(i => o[i] = $('#' + i).value); ['owner'].forEach(n => o[n] = radio(n)); ['temp2', 'firstCut', 'vat', 'cashCost', 'jeonseDsr'].forEach(i => o[i] = $('#' + i).checked); return o; }
function loadForm(){
  const f = S.form; if (!f) return;
  Object.keys(f).forEach(k => { const el = $('#' + k); if (el && typeof f[k] === 'boolean') el.checked = f[k]; else if (el && f[k] != null) el.value = f[k]; });
  ['owner'].forEach(n => f[n] && $$(`input[name="${n}"]`).forEach(r => r.checked = r.value === f[n]));
}
function fillRegions(){ const cur = $('#region').value; $('#region').innerHTML = '<option value="" selected disabled>선택하세요</option>' + regions().map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join(''); if (cur && regions().some(r => r[0] === cur)) $('#region').value = cur; }
function renderAll(){
  $('#fyBox').classList.toggle('hidden', !['mixed', 'periodic'].includes($('#rtype').value));
  $('#gradBox').classList.toggle('hidden', $('#method').value !== 'grad');
  ['price', 'income', 'want', 'cash'].forEach(i => $('#' + i + 'Kor').textContent = kor(N(val(i))));
  renderLimit(); renderIncome(); renderCost(); renderRent(); saveS();
}
fillRegions(); loadForm();
bindTabs();
let curTab = 'limit';
function setTab(t){
  curTab = t; const useShared = ['limit', 'income', 'cost'].includes(t);
  $('#shared').classList.toggle('hidden', !useShared); $('#main').classList.toggle('two', useShared);
  // 넓은 화면: 탭 위치로 / 휴대폰: 고른 탭의 결과(내용)가 바로 보이게 그 위치로 이동
  const tabsH = $('#tabs').offsetHeight + 60, pane = $(`[data-pane="${t}"]`);
  const goShared = useShared && sharedMissing(t); // 조건이 비어 있으면 휴대폰에서도 「내 조건 입력」부터 보이게
  const target = window.innerWidth >= 960 || !pane || goShared ? $('#tabs').getBoundingClientRect().top + window.scrollY - 60 : pane.getBoundingClientRect().top + window.scrollY - tabsH;
  $('#sharedCalc').textContent = { limit: '대출 한도 계산하기', income: '조건 입력 끝 · 연봉·집값 계산으로 ↓', cost: '조건 입력 끝 · 세금·수수료 조건으로 ↓' }[t] || '계산하기';
  if (setTab.ready) window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  setTab.ready = true;
  updateBar();
}
$('#tabs').onTab = setTab;
/* ---- 계산하기 버튼: 빠진 칸이 있으면 그 칸으로 데려가고, 다 채웠으면 결과로 이동 ---- */
const FIELD = { '주택 가격': 'price', '주택 보유 (생애최초·무주택 등)': 'owner', '연소득': 'income', '주택 소재지': 'region', '대출 받을 곳': 'sector', '대출 금리': 'rate', '만기': 'term', '상환 방식': 'method', '체증률': 'grow', '고정 기간·변동 주기': 'fyears', '주택 수': 'houses', '전용면적': 'area', '받고 싶은 대출 금액': 'want', '쓸 수 있는 현금': 'cash', '지금 보증금': 'dep0', '바꿀 보증금': 'dep1' };
const clean = x => x.replace(/\u2060/g, ''); // 가운뎃점 앞뒤 줄바꿈 방지 문자 차이를 무시하고 칸 찾기
const fid = x => { const k = Object.keys(FIELD).find(k => clean(k) === clean(x)); return k ? $('#' + FIELD[k]) : null; };
function sharedMissing(t){
  if (t === 'cost') return !N(val('price')) || !$('#region').value;
  const m = inputs().miss; return t === 'income' ? m.some(x => !['주택 가격', '주택 보유 (생애최초·무주택 등)', '연소득'].includes(x)) : m.length > 0;
}
function needFor(t){
  const m = inputs().miss;
  if (t === 'limit') return m;
  if (t === 'want') return (N(val('want')) ? [] : ['받고 싶은 대출 금액']).concat(m.filter(x => !['주택 가격', '주택 보유 (생애최초·무주택 등)', '연소득'].map(clean).includes(clean(x))));
  if (t === 'cash') return m.concat(N(val('cash')) ? [] : ['쓸 수 있는 현금']);
  if (t === 'cost') return [!N(val('price')) && '주택 가격', !$('#region').value && '주택 소재지', !$('#houses').value && '주택 수', !$('#area').value && '전용면적'].filter(Boolean);
  if (t === 'rent') return [!N(val('dep0')) && '지금 보증금', val('dep1') === '' && '바꿀 보증금'].filter(Boolean);
  return [];
}
function goField(el){
  const d = el.closest('details'); if (d) d.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { const f = el.matches('input,select') ? el : el.querySelector('input,select'); if (f) f.focus({ preventScroll: true }); }, 400);
}
function calc(t){
  $$('.need').forEach(e => e.classList.remove('need'));
  if (t === 'loans') {
    renderLoans();
    const bad = S.loans.find(l => !ready(l));
    if (bad) {
      const row = $(`.loan[data-id="${bad.id}"]`); if (!row) { clearLoanFilter(); renderLoans(); }
      const r = $(`.loan[data-id="${bad.id}"]`), keys = [['amount', !(bad.amount > 0), '대출 금액'], ['months', !(bad.months > 0), '기간'], ['method', !bad.method, '상환 방식'], ['grow', bad.method === 'grad' && !(bad.grow > 0), '체증률']].filter(k => k[1]);
      keys.forEach(([k]) => { const e = r && r.querySelector(`[data-k="${k}"]`); if (e) e.classList.add('need'); });
      const first = r && r.querySelector('.need'); if (first) goField(first);
      toast(`대출 ${S.loans.indexOf(bad) + 1}: ${keys.map(k => k[2]).join(', ')} 칸을 채워 주세요`); return;
    }
    selId = selId || S.loans[0].id; renderSched(); $('#schedCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  renderAll();
  const need = needFor(t);
  if (need.length) {
    need.forEach(x => { const e = fid(x); if (e) e.classList.add('need'); });
    const first = fid(need[0]); if (first) goField(first);
    const nm = need.map(x => x.replace(/\s*\(.*\)$/, '')); toast((nm.length > 3 ? nm.slice(0, 2).join(', ') + ` 등 ${nm.length}칸` : nm.join(', ') + ' 칸') + '을 채워 주세요'); return;
  }
  const res = { limit: '#limitCard', want: '#iStat', cash: '#aStat', cost: '#cStat', rent: '#rStat' }[t];
  $(res).scrollIntoView({ behavior: 'smooth', block: t === 'limit' ? 'start' : 'center' });
}
document.addEventListener('click', ev => { const b = ev.target.closest('button.calc'); if (!b) return; if (b.id === 'sharedCalc' && curTab !== 'limit') { // 공통 조건만 확인하고 그 탭의 입력 칸으로 이동
    $$('.need').forEach(e => e.classList.remove('need'));
    const m = curTab === 'cost' ? [!N(val('price')) && '주택 가격', !$('#region').value && '주택 소재지'].filter(Boolean) : inputs().miss.filter(x => !['주택 가격', '주택 보유 (생애최초·무주택 등)', '연소득'].map(clean).includes(clean(x)));
    if (m.length) { m.forEach(x => { const e = fid(x); if (e) e.classList.add('need'); }); goField(fid(m[0])); toast(m.map(x => x.replace(/\s*\(.*\)$/, '')).join(', ') + ' 칸을 채워 주세요'); return; }
    $(`[data-pane="${curTab}"]`).scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  calc(b.id === 'sharedCalc' ? 'limit' : b.dataset.calc); });
const unNeed = ev => { const t = ev.target; t.classList.remove('need'); const g = t.closest('#owner'); if (g) g.classList.remove('need'); };
$('#main').addEventListener('input', unNeed, true); $('#main').addEventListener('change', unNeed, true);
let barSeen = false;
function updateBar(){
  const show = curTab === 'limit' && lastLimit && !barSeen && window.innerWidth < 960;
  $('#sumbar').classList.toggle('hidden', !show);
  if (lastLimit) $('#sumText').innerHTML = `대출 가능 <b>${wk(lastLimit.final)}</b>`;
}
if ('IntersectionObserver' in window) new IntersectionObserver(es => { barSeen = es[0].isIntersecting; updateBar(); }).observe($('#limitCard'));
document.addEventListener('click', ev => { if (ev.target.closest('.goIn')) $('#shared').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#sumGo').onclick = () => $('#limitCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
$$('input[name=owner]').forEach(r => r.addEventListener('change', () => { $('#firstCut').checked = radio('owner') === 'first'; }));
$('#main').addEventListener('input', ev => { if (ev.target.closest('#loanTbl')) return; if (ev.target.classList.contains('m')) moneyInput(ev.target); renderAll(); });
$('#main').addEventListener('change', ev => { if (ev.target.closest('#loanTbl')) return; renderAll(); });
$('#wantQuick').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { $('#want').value = fmt(+b.dataset.v); renderAll(); } });
clearLoanFilter(); // 브라우저가 지난번 거르기 값을 되살려도 처음엔 항상 전체 보기
$('#lq').addEventListener('input', renderLoans); $('#lkind').addEventListener('change', renderLoans); $('#schedView').addEventListener('change', renderSched);
$('#lCopy').onclick = () => copy('주담대 한도 계산\n' + $('#lStat').innerText.replace(/\n/g, ' ') + '\n' + $('#lTbl').innerText + ($('#plusSum table') ? '\n\n함께 받을 대출 합산\n' + $('#plusSum table').innerText : ''));
$('#cCopy').onclick = () => copy('취득 비용\n' + $('#cTbl').innerText);
renderLoans(); renderAll(); setTab('limit');
onRulesLoaded(() => { fillRegions(); renderLoans(); renderAll(); });
window.addEventListener('pageshow', e => { if (e.persisted || $('#lkind').value || val('lq')) { clearLoanFilter(); renderLoans(); } }); // 뒤로 가기·새로고침으로 되살아난 거르기 값 지우기
