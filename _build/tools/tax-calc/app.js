/* ===== 세무 계산기·신고 일정 ===== */
const KEY = 'ilsang_taxcalc_v1';
const N = s => { const v = String(s == null ? '' : s).replace(/[^\d.-]/g, ''); return v && v !== '-' ? Math.round(+v) || 0 : 0; };
const fmt = n => (Math.round(n) || 0).toLocaleString('ko-KR');
const f10 = n => Math.floor(n / 10) * 10;
const pct = r => (Math.round(r * 100000) / 1000) + '%';
function progressive(base, br){ let tax = 0, prev = 0; for (const [cap, r] of br) { const top = cap == null ? Infinity : cap; if (base > prev) tax += (Math.min(base, top) - prev) * r; prev = top; if (base <= top) break; } return tax; }
function bracketOf(base, br){ let prev = 0; for (const [cap, r] of br) { if (cap == null || base <= cap) return { r, from: prev, cap }; prev = cap; } return {}; }
function moneyInput(el){
  const neg = el.value.trim().startsWith('-'), pos = el.value.length - el.selectionStart, n = N(el.value);
  el.value = el.value.trim() === '' ? '' : (neg ? '-' : '') + fmt(Math.abs(n));
  try { const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p); } catch (_) {}
}
const rows = (L) => L.map(r => r === '-' ? '' : `<tr class="${r[2] || ''}"><td>${r[0]}</td><td class="n">${typeof r[1] === 'number' ? fmt(r[1]) + '원' : r[1]}</td></tr>`).join('');
const statBox = (L) => L.map(([l, v, cls]) => `<div class="${cls || ''}"><small>${l}</small><b>${typeof v === 'number' ? fmt(v) + '원' : v}</b></div>`).join('');
const textOf = id => $(id).innerText.replace(/\t/g, ' ').replace(/⁠/g, '');

/* ---------- 신고 일정 ---------- */
const isHoliday = d => KHol.is(d);
function due(y, m, d){ let x = new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate())); const o = new Date(x); while (isHoliday(x)) x = addDays(x, 1); return { d: x, moved: +x !== +o }; }
function schedule(y, who){
  const L = [], add = (m, d, t, w, note) => { if (!w.some(k => who.includes(k))) return; const r = due(y, m, d); L.push({ ...r, t, note: note || '', w }); };
  for (let m = 1; m <= 12; m++) {
    add(m, 10, '원천세 신고·납부 (' + (m === 1 ? 12 : m - 1) + '월 지급분)', ['emp'], '반기납부 승인 사업자는 1월·7월 10일에만');
    add(m, 31, '간이지급명세서 제출 (' + (m === 1 ? 12 : m - 1) + '월 사업소득·일용근로)', ['emp'], '프리랜서·일용직에게 지급한 달의 다음 달 말일');
  }
  add(1, 25, '부가세 2기 확정신고·납부 (7~12월)', ['gen', 'corp']);
  add(1, 25, '간이과세자 부가세 신고·납부 (전년 1~12월)', ['simple'], '연 매출 4,800만원 미만은 납부 면제(신고는 함)');
  add(2, 10, '면세사업자 사업장현황신고 (전년 수입금액)', ['exempt']);
  add(3, 10, '근로·퇴직·사업소득 지급명세서 제출, 연말정산 결과 신고', ['emp']);
  add(3, 31, '법인세 신고·납부 (12월 결산법인)', ['corp'], '성실신고확인 법인은 4월 30일');
  add(4, 25, '부가세 1기 예정신고·납부 (1~3월)', ['corp'], '');
  add(4, 25, '부가세 1기 예정고지 납부 (고지서 받은 경우)', ['gen'], '직전 기 납부세액의 절반을 고지');
  add(4, 30, '법인 지방소득세 신고·납부', ['corp']);
  add(5, 31, '종합소득세·개인 지방소득세 신고·납부', ['gen', 'simple', 'exempt'], '납부세액 1,000만원 초과분은 2개월 나눠 낼 수 있음');
  add(6, 30, '성실신고확인대상 종합소득세 신고·납부', ['sincere']);
  add(7, 25, '부가세 1기 확정신고·납부 (1~6월)', ['gen', 'corp']);
  add(7, 25, '간이과세자 예정부과 납부 (고지서 받은 경우)', ['simple']);
  add(8, 31, '법인세 중간예납 신고·납부', ['corp']);
  add(10, 25, '부가세 2기 예정신고·납부 (7~9월)', ['corp']);
  add(10, 25, '부가세 2기 예정고지 납부 (고지서 받은 경우)', ['gen']);
  add(11, 30, '종합소득세 중간예납 납부 (고지서)', ['gen', 'simple', 'exempt', 'sincere']);
  return L.sort((a, b) => a.d - b.d);
}
function whoSel(){ return $$('#who input:checked').map(i => i.value); }
function renderCal(){
  const who = whoSel(), y = +$('#calYear').value, t = today();
  const L = schedule(y, who);
  const up = schedule(t.getFullYear(), who).concat(schedule(t.getFullYear() + 1, who)).filter(x => x.d >= t).slice(0, 4);
  $('#next').innerHTML = up.length ? '<div class="next">' + up.map(x => { const n = dayDiff(t, x.d); return `<div class="${n <= 7 ? 'soon' : ''}"><b class="dd">${n === 0 ? 'D-day' : 'D-' + n}</b><span>${esc(x.t)}<small>${kDate(x.d, true)}${x.moved ? ' · 휴일이라 미뤄짐' : ''}</small></span></div>`; }).join('') + '</div>' : '<p class="hint">위에서 사업 유형을 고르세요.</p>';
  const H = KHol.list(y);
  $('#holList').innerHTML = '<ul>' + Object.keys(H).sort().map(k => `<li>${kDate(parseDate(k))} ${esc(H[k])}</li>`).join('') + '</ul>';
  $('#holNote').textContent = '기한이 토·일요일이나 공휴일이면 다음 평일로 미뤘습니다. ' + (KHol.hasOfficial(y) ? `${y}년 공휴일은 한국천문연구원 특일정보(임시공휴일 포함)를 따릅니다.` : `${y}년 공휴일은 관공서 공휴일 규정과 음력 천문 계산으로 구했습니다. 임시공휴일은 지정되면 자동으로 더해집니다.`);
  $('#calTbl').innerHTML = L.length ? '<thead><tr><th>기한</th><th>할 일</th></tr></thead><tbody>' + L.map(x => `<tr class="${x.d < t ? 'past' : ''}"><td style="white-space:nowrap">${kDate(x.d)}${x.moved ? ' <span class="chip">미뤄짐</span>' : ''}</td><td>${esc(x.t)}${x.note ? `<br><small>${esc(x.note)}</small>` : ''}</td></tr>`).join('') + '</tbody>' : '';
  saveState();
}
function icsOut(){
  const y = +$('#calYear').value, L = schedule(y, whoSel()), d8 = d => ymd(d).replace(/-/g, '');
  const ev = L.map((x, i) => ['BEGIN:VEVENT', `UID:ilsang-tax-${y}-${i}@ilsangtool`, `DTSTAMP:${d8(today())}T000000Z`, `DTSTART;VALUE=DATE:${d8(x.d)}`, `DTEND;VALUE=DATE:${d8(addDays(x.d, 1))}`, `SUMMARY:[세금] ${x.t}`, x.note ? `DESCRIPTION:${x.note}` : '', 'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', 'DESCRIPTION:세금 신고 3일 전', 'END:VALARM', 'END:VEVENT'].filter(Boolean).join('\r\n'));
  download(new Blob([['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ilsangtool//tax//KO', 'CALSCALE:GREGORIAN'].concat(ev, ['END:VCALENDAR']).join('\r\n')], { type: 'text/calendar' }), `세무일정_${y}.ics`);
}

/* ---------- 부가세 ---------- */
function calcVat(){
  const type = radio('vType'), V = ruleAt(RULES.vat, ymd(today()));
  $('#vGen').classList.toggle('hidden', type !== 'general'); $('#vSim').classList.toggle('hidden', type !== 'simple'); $('#vBizBox').classList.toggle('hidden', type !== 'general');
  const ind = radio('vBiz') === 'ind';
  if (type === 'general') {
    const s1 = N(val('vS1')), s2 = N(val('vS2')), s3 = N(val('vS3')), b1 = N(val('vB1')), b2 = N(val('vB2')), b0 = N(val('vB0')), pre = N(val('vPre'));
    const outCalc = Math.round(s1 * V.rate) + Math.round(s2 / 11) + Math.round(s3 / 11), inCalc = Math.round((b1 + b2) * V.rate);
    const out = val('vOut') !== '' ? N(val('vOut')) : outCalc, inp = val('vIn') !== '' ? N(val('vIn')) : inCalc;
    const base = out - inp;
    const card = ind ? Math.min(Math.round(s2 * V.cardCredit), V.cardCreditCap, Math.max(0, base)) : 0;
    const e = ind && $('#vE').checked && base - card > 0 ? Math.min(10000, base - card) : 0;
    const pay = base - card - e - pre;
    $('#vStat').innerHTML = statBox([['매출세액', out], ['매입세액', inp], [pay < 0 ? '환급받을 세액' : '납부할 세액', Math.abs(pay), 'main']]);
    $('#vTbl').innerHTML = rows([
      ['매출세액 <small>(세금계산서 ' + fmt(s1) + ' × 10% + 카드·현금 ' + fmt(s2 + s3) + ' ÷ 11)</small>', out],
      ['− 매입세액 <small>(공제 대상 공급가액 ' + fmt(b1 + b2) + ' × 10%)</small>', inp],
      ['= 납부(환급)세액', base, 'sum'],
      ind ? ['− 신용카드매출전표 등 발행 세액공제 <small>(' + (V.cardCredit * 100).toFixed(1) + '%, 연 ' + fmt(V.cardCreditCap / 1e4) + '만원 한도)</small>', card] : '-',
      e ? ['− 전자신고 세액공제', e] : '-',
      pre ? ['− 예정고지·예정신고 세액', pre] : '-',
      [pay < 0 ? '= 환급받을 세액' : '= 차가감 납부할 세액', Math.abs(pay), 'sum'],
      b0 ? ['참고: 공제받지 못하는 매입세액 (비용 처리)', b0] : '-',
      N(val('vS0')) ? ['참고: 면세·영세율 매출 (세액 0)', N(val('vS0'))] : '-'
    ]);
    return { type, pay };
  }
  const sales = N(val('vSs')), cardS = N(val('vSc')), buy = N(val('vSb')), pre = N(val('vSp'));
  const ratio = V.simpleRatios[$('#vInd').value];
  const tax = Math.round(sales * ratio * V.rate), inCr = Math.round(buy * V.simpleInputRate), card = Math.round(cardS * V.cardCredit);
  const crTot = Math.min(tax, inCr + Math.min(card, V.cardCreditCap));
  const exempt = sales > 0 && sales < V.simpleExempt;
  const pay = exempt ? 0 : Math.max(0, tax - crTot) - pre;
  $('#vStat').innerHTML = statBox([['납부세액', tax], ['공제세액', crTot], [exempt ? '납부 면제' : pay < 0 ? '예정부과 낸 것 돌려받음' : '납부할 세액', exempt ? '0원' : Math.abs(pay), 'main']]);
  $('#vTbl').innerHTML = rows([
    ['납부세액 <small>(공급대가 ' + fmt(sales) + ' × 부가가치율 ' + pct(ratio) + ' × 10%)</small>', tax],
    ['− 매입 세금계산서 등 수취 세액공제 <small>(' + fmt(buy) + ' × 0.5%)</small>', inCr],
    ['− 신용카드매출전표 등 발행 세액공제 <small>(' + (V.cardCredit * 100).toFixed(1) + '%)</small>', Math.min(card, V.cardCreditCap)],
    ['공제는 납부세액을 넘지 못함 (간이과세자는 환급 없음)', '', ''],
    pre ? ['− 예정부과 낸 세액', pre] : '-',
    [exempt ? '연 매출 ' + fmt(V.simpleExempt) + '원 미만 → 납부 의무 면제' : '= 납부할 세액', exempt ? 0 : pay, 'sum'],
    sales >= V.simpleLimit ? ['※ 연 매출이 ' + fmt(V.simpleLimit) + '원 이상이면 다음 해 7월부터 일반과세자로 바뀝니다', '', ''] : '-'
  ]);
  return { type, pay };
}

/* ---------- 종합소득세 ---------- */
function calcInc(){
  const way = radio('iWay'), rev = N(val('iRev')), y = $('#iYear').value || String(today().getFullYear());
  const IT = ruleAt(RULES.incomeTax, y + '-12-31');
  $('#iBookBox').classList.toggle('hidden', way !== 'book'); $('#iRateBox').classList.toggle('hidden', way === 'book');
  $$('.stdOnly').forEach(e => e.classList.toggle('hidden', way !== 'std'));
  let exp = 0, bizInc = 0, how = '';
  const sr = (+val('iSr') || 0) / 100, br = (+val('iBr') || 0) / 100;
  if (way === 'book') { exp = N(val('iExp')); bizInc = rev - exp; how = '장부상 필요경비 ' + fmt(exp) + '원'; }
  else if (way === 'simple') { exp = Math.round(rev * sr); bizInc = rev - exp; how = '단순경비율 ' + (sr * 100).toFixed(1) + '%'; }
  else {
    const main = N(val('iMain')), a = rev - main - Math.round(rev * br), mult = $('#iDouble').checked ? 2.8 : 3.4, b = Math.round((rev - rev * sr) * mult);
    bizInc = sr ? Math.min(a, b) : a; exp = rev - bizInc; how = `기준경비율: 수입 − 주요경비 − 수입×${(br * 100).toFixed(1)}% = ${fmt(a)}원` + (sr ? ` / 비교: (수입 − 수입×단순율) × ${mult} = ${fmt(b)}원 → 작은 값` : '');
  }
  const other = N(val('iOther')), total = Math.max(0, bizInc) + other;
  const dep = Math.max(1, +val('iDep') || 1), ded = IT.basicDeduct * dep + N(val('iDed'));
  const base = Math.max(0, total - ded), calc = Math.floor(progressive(base, IT.brackets)), bk = bracketOf(base, IT.brackets);
  const bookCr = $('#iBook').checked && total > 0 ? Math.min(IT.bookCreditCap, Math.floor(calc * IT.bookCreditRate * Math.max(0, bizInc) / total)) : 0;
  const std = $('#iStd').checked ? IT.stdCredit : 0;
  const cr = Math.min(calc, bookCr + std + N(val('iCr')));
  const dec = calc - cr, wh = N(val('iWh')), mid = N(val('iMid')), pay = dec - wh - mid, local = f10(dec * IT.localRate);
  const localPay = local - f10(wh * 0.1);
  $('#iStat').innerHTML = statBox([['과세표준', base], ['결정세액', dec], [pay < 0 ? '환급 예상 (소득세)' : '납부할 소득세', Math.abs(pay), 'main' + (pay < 0 ? ' neg' : '')], ['지방소득세 ' + (localPay < 0 ? '환급' : '납부'), Math.abs(localPay)]]);
  $('#iTbl').innerHTML = rows([
    ['수입금액', rev], ['− 필요경비 <small>(' + how + ')</small>', exp], ['= 사업소득금액', bizInc, 'sum'],
    other ? ['+ 다른 종합소득금액', other] : '-',
    ['− 기본공제 <small>(' + dep + '명 × ' + fmt(IT.basicDeduct) + ')</small> 및 그 밖의 소득공제', ded],
    ['= 과세표준', base, 'sum'],
    ['× 세율 <small>(' + (bk.r ? pct(bk.r) + ' 구간, 누진공제 반영' : '') + ')</small> = 산출세액', calc],
    bookCr ? ['− 기장세액공제', bookCr] : '-', std ? ['− 표준세액공제', Math.min(std, calc)] : '-',
    N(val('iCr')) ? ['− 그 밖의 세액공제·감면', N(val('iCr'))] : '-',
    ['= 결정세액', dec, 'sum'],
    wh ? ['− 원천징수된 세액', wh] : '-', mid ? ['− 중간예납 세액', mid] : '-',
    [pay < 0 ? '= 환급받을 소득세' : '= 납부할 소득세', Math.abs(pay), 'sum'],
    ['지방소득세 (결정세액의 10%' + (wh ? ', 원천징수된 0.3% 뺌' : '') + ')', (localPay < 0 ? '환급 ' : '') + fmt(Math.abs(localPay)) + '원'],
    pay > 1e7 ? ['분납 가능: 1,000만원 초과분은 2개월 안에 나눠 낼 수 있습니다', '', ''] : '-'
  ]);
}

/* ---------- 원천징수 ---------- */
function calcWh(){
  const W = ruleAt(RULES.withholding, ymd(today())), type = radio('wType'), dir = radio('wDir'), amt = N(val('wAmt'));
  $('#wWageBox').classList.toggle('hidden', type !== 'wage');
  $('#wExpBox').classList.toggle('hidden', type !== 'other'); $('#wDaysBox').classList.toggle('hidden', type !== 'daily'); $('#wEiBox').classList.toggle('hidden', type !== 'daily');
  $('#wAmtL').textContent = (type === 'daily' ? '하루 일당 ' : type === 'wage' ? '월급 ' : '지급액 ') + (dir === 'gross' ? '(세전)' : '(실수령)');
  const taxOf = g => {
    if (type === 'wage') {
      const non = N(val('wNon')), r = WageTax.calc(Math.max(0, g - non), +val('wFam') || 1, +val('wKid') || 0, +radio('wRatio') || 100, ymd(today()));
      return { it: r.it, lt: r.lt, base: Math.max(0, g - non), rate: `간이세액표 ${fmt(Math.max(0, g - non))}원·가족 ${Math.max(1, +val('wFam') || 1)}명` + (r.child ? ` − 자녀 공제 ${fmt(r.child)}원` : '') + (radio('wRatio') !== '100' ? ` × ${radio('wRatio')}%` : ''), src: r.source };
    }
    if (type === 'biz') { let it = f10(g * W.biz); if (it < W.minor) it = 0; return { it, lt: f10(it * 0.1), base: g, rate: '지급액 × 3%' }; }
    if (type === 'int') { const it = f10(g * W.interest); return { it, lt: f10(it * 0.1), base: g, rate: '지급액 × 14%' }; }
    if (type === 'other') {
      const inc = $('#wExp').checked ? g * (1 - W.otherExpense) : g;
      let it = inc <= W.otherMin ? 0 : f10(inc * W.other); if (it < W.minor) it = 0;
      return { it, lt: f10(it * 0.1), base: Math.round(inc), rate: ($('#wExp').checked ? '(지급액 − 필요경비 60%) × ' : '지급액 × ') + '20%', min: inc <= W.otherMin };
    }
    const days = Math.max(1, +val('wDays') || 1);
    const per = Math.max(0, g - W.dailyDeduct) * W.dailyRate * (1 - W.dailyCredit);
    let it = f10(Math.round(per * days)); if (it < W.minor) it = 0;
    const ei = $('#wEi').checked ? f10(g * days * 0.009) : 0;
    return { it, lt: f10(it * 0.1), ei, base: g * days, days, rate: '(일당 − 15만원) × 6% × (1 − 55%)' };
  };
  let gross = amt;
  if (dir === 'net' && amt) { // 실수령액에 맞는 세전 금액 찾기
    let lo = amt, hi = amt * 2 + 1000000;
    const net = g => { const r = taxOf(g); return (type === 'daily' ? g * r.days : g) - r.it - r.lt - (r.ei || 0); };
    const target = type === 'daily' ? amt * Math.max(1, +val('wDays') || 1) : amt;
    for (let i = 0; i < 60; i++) { const m = Math.floor((lo + hi) / 2); if (net(m) < target) lo = m + 1; else hi = m; }
    gross = Math.ceil(lo / 10) * 10;
  }
  const r = taxOf(gross), pay = type === 'daily' ? gross * r.days : gross, net = pay - r.it - r.lt - (r.ei || 0);
  $('#wStat').innerHTML = statBox([['세전 지급액', pay], ['떼는 세금', r.it + r.lt + (r.ei || 0)], ['실수령액', net, 'main']]);
  $('#wTbl').innerHTML = rows([
    ['세전 지급액' + (type === 'daily' ? ` <small>(${fmt(gross)} × ${r.days}일)</small>` : ''), pay],
    type === 'other' ? ['기타소득금액 <small>(과세 대상)</small>', r.base] : '-',
    ['소득세 <small>(' + r.rate + ')</small>', r.it], ['지방소득세 <small>(소득세의 10%)</small>', r.lt],
    r.ei ? ['고용보험 <small>(0.9%)</small>', r.ei] : '-',
    ['= 실수령액', net, 'sum']
  ]);
  const notes = { wage: '4대보험(근로자 부담)은 따로 뺍니다 → 4대보험 탭. 근거: ' + (r.src || '소득세법 시행령 별표 2') + '. 연말정산 때 실제 세액과 정산합니다.', biz: '지급한 사업자는 다음 달 10일까지 원천세 신고·납부, 다음 달 말일까지 간이지급명세서를 냅니다. 받은 사람은 5월 종합소득세 신고로 정산합니다.', other: '기타소득금액이 연 300만원 이하면 분리과세(8.8%로 끝)와 종합과세 중 고를 수 있습니다.' + (r.min ? ' 지금은 기타소득금액이 5만원 이하라 세금을 떼지 않습니다(과세최저한).' : ''), daily: '일용근로소득은 원천징수로 납세가 끝나 따로 신고하지 않습니다. 소득세가 1,000원 미만이면 떼지 않습니다(소액부징수).', int: '연 이자·배당이 2,000만원을 넘으면 넘는 부분은 종합과세됩니다.' };
  $('#wNote').textContent = notes[type];
}

/* ---------- 법인세 ---------- */
function calcCorp(){
  const y = radio('cy') || '2026', CT = ruleAt(RULES.corpTax, y + '-01-01');
  const net = N(val('cNet')), adj = N(val('cAdj')), loss = N(val('cLoss')), cr = N(val('cCr')), pre = N(val('cPre'));
  const inc = net + adj, lossUsed = Math.min(Math.max(0, inc), loss), base = Math.max(0, inc - lossUsed);
  const calc = Math.floor(progressive(base, CT.brackets));
  const minRate = $('#cSme').value === 'sme' ? 0.07 : 0.10, minTax = Math.floor(base * minRate);
  const after = Math.max(calc - cr, Math.min(calc, cr ? minTax : 0));
  const pay = after - pre;
  const brs = CT.brackets.map(([c, r], i, a) => `${i ? fmt(a[i - 1][0] / 1e8) + '억 초과 ' : ''}${c ? fmt(c / 1e8) + '억 이하' : ''} ${pct(r)}`).join(' · ');
  $('#cStat').innerHTML = statBox([['과세표준', base], ['산출세액', calc], [pay < 0 ? '환급 예상' : '납부할 법인세', Math.abs(pay), 'main'], ['법인 지방소득세 (어림)', f10(after * 0.1)]]);
  $('#cTbl').innerHTML = rows([
    ['당기순이익', net], adj ? ['± 세무조정', adj] : '-', ['= 각 사업연도 소득금액', inc, 'sum'],
    lossUsed ? ['− 이월결손금', lossUsed] : '-', ['= 과세표준', base, 'sum'],
    ['× 세율 <small>(' + brs + ')</small> = 산출세액', calc],
    cr ? ['− 공제·감면세액 <small>(최저한세 ' + pct(minRate) + ' = ' + fmt(minTax) + '원까지)</small>', calc - after] : '-',
    ['= 총부담세액', after, 'sum'], pre ? ['− 중간예납·원천징수 세액', pre] : '-',
    [pay < 0 ? '= 환급 예상' : '= 납부할 법인세', Math.abs(pay), 'sum'],
    ['법인 지방소득세는 과세표준에 별도 세율(법인세율의 1/10)을 적용해 4월 30일까지 신고합니다', '', '']
  ]);
}

/* ---------- 4대보험 ---------- */
function calcIns(){
  const y = radio('sy') || String(today().getFullYear()), R = ruleAt(RULES.insurance, y + '-01-01');
  const pay = N(val('sPay')), base = Math.max(0, pay - N(val('sNon'))), stab = +$('#sSize').value, ind = (+val('sInd') || 0) / 100;
  const np = f10(base * R.np), hi = f10(base * R.hi), ltc = f10(hi * R.ltcRatio), ei = f10(base * R.ei), eiEr = f10(base * (R.ei + stab)), ia = f10(base * ind);
  const emp = np + hi + ltc + ei, er = np + hi + ltc + eiEr + ia;
  $('#sStat').innerHTML = statBox([['근로자 부담 (월)', emp], ['사업주 부담 (월)', er, 'main'], ['사업주 부담 (연)', er * 12]]);
  $('#sTbl').innerHTML = '<thead><tr><th>항목</th><th class="n">요율</th><th class="n">근로자</th><th class="n">사업주</th></tr></thead><tbody>' + [
    ['국민연금', pct(R.np) + ' + ' + pct(R.np), np, np], ['건강보험', pct(R.hi) + ' + ' + pct(R.hi), hi, hi], ['장기요양보험', '건강보험료의 ' + pct(R.ltcRatio), ltc, ltc],
    ['고용보험 (실업급여)', pct(R.ei) + ' + ' + pct(R.ei), ei, f10(base * R.ei)], ['고용보험 (고용안정·직업능력)', '사업주 ' + pct(stab), 0, eiEr - f10(base * R.ei)],
    ['산재보험', ind ? '사업주 ' + pct(ind) : '요율 입력 필요', 0, ia]
  ].map(r => `<tr><td>${r[0]}</td><td class="n"><small>${r[1]}</small></td><td class="n">${fmt(r[2])}</td><td class="n">${fmt(r[3])}</td></tr>`).join('') + `<tr class="sum"><td>합계</td><td></td><td class="n">${fmt(emp)}</td><td class="n">${fmt(er)}</td></tr></tbody>`;
}

/* ---------- 장부 의무 ---------- */
function calcDuty(){
  const D = ruleAt(RULES.bookDuty, ymd(today())), g = D.groups.find(x => x.id === $('#dGrp').value) || D.groups[0];
  const prev = N(val('dPrev')), cur = N(val('dCur')), pro = $('#dPro').checked, isNew = !prev;
  const dbl = pro || prev >= g.simple;
  const simpleRate = !pro && (isNew ? cur < g.simple : prev < g.simpleRate && cur < g.simple);
  const sincere = cur >= g.sincere;
  const v = (on, t, p) => `<div class="verdict ${on ? 'on' : ''}"><b>${t}</b><p>${p}</p></div>`;
  $('#dOut').innerHTML =
    v(true, dbl ? '복식부기의무자' : '간편장부대상자', dbl ? (pro ? '전문직 사업자는 수입금액과 관계없이 복식부기의무자입니다.' : `직전 연도 수입금액이 ${fmt(g.simple)}원 이상입니다. 복식부기로 재무제표를 만들어 신고해야 하며, 안 하면 무기장 가산세가 붙습니다.`) : `직전 연도 수입금액이 ${fmt(g.simple)}원 미만입니다. 간편장부로 충분하며, 복식부기로 신고하면 기장세액공제(20%, 100만원 한도)를 받습니다.`) +
    v(true, simpleRate ? '단순경비율 적용 가능' : '기준경비율 적용 (장부를 안 쓸 때)', simpleRate ? (isNew ? `신규 사업자로 올해 수입금액이 ${fmt(g.simple)}원 미만입니다.` : `직전 연도 수입금액이 ${fmt(g.simpleRate)}원 미만입니다.`) + ' 장부 없이 추계신고할 때 단순경비율을 씁니다.' : '장부 없이 추계신고하면 주요경비만 증빙으로 인정되는 기준경비율이 적용되어 세금이 크게 늘 수 있습니다. 장부 작성을 권합니다.') +
    v(sincere, sincere ? '성실신고확인 대상' : '성실신고확인 대상 아님', `이 업종은 올해 수입금액 ${fmt(g.sincere)}원 이상이면 세무사 확인을 받아 6월 30일까지 신고합니다.`) +
    `<p class="hint">기준: ${esc(g.name)} · 간편장부 ${fmt(g.simple / 1e4)}만원, 단순경비율 ${fmt(g.simpleRate / 1e4)}만원, 성실신고 ${fmt(g.sincere / 1e8)}억원. 업종이 여럿이면 주업종 환산 금액으로 판단합니다.</p>`;
}

/* ---------- 저장·이벤트 ---------- */
const IDS = ['vS1', 'vS2', 'vS3', 'vS0', 'vB1', 'vB2', 'vB0', 'vPre', 'vOut', 'vIn', 'vInd', 'vSs', 'vSc', 'vSb', 'vSp', 'iRev', 'iExp', 'iSr', 'iBr', 'iMain', 'iOther', 'iDep', 'iDed', 'iCr', 'iWh', 'iMid', 'wAmt', 'wDays', 'wNon', 'wFam', 'wKid', 'cNet', 'cAdj', 'cLoss', 'cCr', 'cPre', 'cSme', 'sPay', 'sNon', 'sSize', 'sInd', 'dGrp', 'dPrev', 'dCur'];
const CHK = ['vE', 'iDouble', 'iStd', 'iBook', 'wExp', 'wEi', 'dPro'];
const RAD = ['vType', 'vBiz', 'iWay', 'wType', 'wDir', 'wRatio', 'cy', 'sy'];
function saveState(){
  const s = { who: whoSel() }; IDS.forEach(i => s[i] = $('#' + i).value); CHK.forEach(i => s[i] = $('#' + i).checked); RAD.forEach(n => s[n] = radio(n));
  s.iYear = $('#iYear').value; store.set(KEY, s);
}
function loadState(){
  const s = store.get(KEY); if (!s) return;
  IDS.forEach(i => { if (s[i] != null && s[i] !== '') $('#' + i).value = s[i]; }); CHK.forEach(i => { if (s[i] != null) $('#' + i).checked = s[i]; });
  RAD.forEach(n => { if (s[n]) $$(`input[name="${n}"]`).forEach(r => r.checked = r.value === s[n]); });
  if (s.who) $$('#who input').forEach(i => i.checked = s.who.includes(i.value));
  if (s.iYear) $('#iYear').value = s.iYear;
}
function all(){ renderCal(); calcVat(); calcInc(); calcWh(); calcCorp(); calcIns(); calcDuty(); saveState(); }
function setup(){
  const y = today().getFullYear();
  const cy = $('#calYear').value;
  $('#calYear').innerHTML = Array.from({ length: 12 }, (_, i) => y - 1 + i).map(v => `<option value="${v}"${String(v) === (cy || String(y)) ? ' selected' : ''}>${v}년</option>`).join('');
  $('#iYear').innerHTML = [y - 1, y].map(v => `<option value="${v}"${v === (today().getMonth() < 5 ? y - 1 : y) ? ' selected' : ''}>${v}년 소득 (${v + 1}년 5월 신고)</option>`).join('');
  $('#cYears').innerHTML = [['2025', '2025년 이전 시작 (9·19·21·24%)'], ['2026', '2026년 이후 시작 (10·20·22·25%)']].map(([v, n]) => `<label><input type="radio" name="cy" value="${v}"${v === '2026' ? ' checked' : ''}><span>${n}</span></label>`).join('');
  const ys = [...new Set(RULES.insurance.map(x => +x.from.slice(0, 4)))].filter(v => v >= y && v <= y + 1);
  $('#sYears').innerHTML = (ys.length ? ys : [y]).map(v => `<label><input type="radio" name="sy" value="${v}"${v === y ? ' checked' : ''}><span>${v}년 요율${v > y ? ' (예정)' : ''}</span></label>`).join('');
  $('#dGrp').innerHTML = ruleAt(RULES.bookDuty, ymd(today())).groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
}
setup(); loadState();
bindTabs();
$('#tabs').onTab = t => { history.replaceState(null, '', '#' + t); };
$('#main').addEventListener('input', ev => { if (ev.target.classList.contains('m')) moneyInput(ev.target); all(); });
$('#main').addEventListener('change', all);
$('#iWh3').onclick = () => { $('#iWh').value = fmt(f10(N(val('iRev')) * 0.03)); all(); };
$('#icsBtn').onclick = icsOut;
$('#calCopy').onclick = () => copy($('#calYear').value + '년 세무 일정\n' + schedule(+$('#calYear').value, whoSel()).map(x => `${kDate(x.d)} ${x.t}`).join('\n'));
$('#vCopy').onclick = () => copy('부가세 계산\n' + textOf('#vTbl'));
$('#iCopy').onclick = () => copy('종합소득세 계산\n' + textOf('#iTbl'));
$('#wCopy').onclick = () => copy('원천징수 계산\n' + textOf('#wTbl'));
$('#cCopy').onclick = () => copy('법인세 계산\n' + textOf('#cTbl'));
$('#sCopy').onclick = () => copy('4대보험 계산\n' + textOf('#sTbl'));
$$('[data-clear]').forEach(b => b.onclick = () => { $$(`[data-pane="${b.dataset.clear}"] input.m`).forEach(i => i.value = ''); all(); toast('입력을 지웠습니다'); });

/* 주소 #탭 또는 장부 앱에서 넘겨준 #vat?out=..&in=.. 반영 */
(function fromHash(){
  const h = location.hash.slice(1); if (!h) return;
  const [tab, q] = h.split('?'), b = $$('#tabs button').find(x => x.dataset.tab === tab);
  if (q && tab === 'vat') {
    const p = new URLSearchParams(q), set = (id, v) => { if (v != null) $('#' + id).value = fmt(N(v)); };
    if (p.get('type') === 'simple') { $$('input[name=vType]').forEach(r => r.checked = r.value === 'simple'); set('vSs', p.get('sales')); set('vSb', p.get('buy')); set('vSc', p.get('card')); }
    else { $$('input[name=vType]').forEach(r => r.checked = r.value === 'general'); ['vS1', 'vS3', 'vB1', 'vB2', 'vPre'].forEach(i => $('#' + i).value = ''); set('vOut', p.get('out')); set('vIn', p.get('in')); set('vS2', p.get('card')); $('#vDirect').open = true; if (p.get('biz')) $$('input[name=vBiz]').forEach(r => r.checked = r.value === p.get('biz')); }
    toast('장부에서 부가세 집계를 가져왔습니다');
  }
  if (b) b.click();
})();
all();
onRulesLoaded(() => { setup(); loadState(); all(); });
WageTax.refresh(all);
fetch('../data/holidays.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { if (j) { KHol.setOfficial(j); all(); } }).catch(() => {});
