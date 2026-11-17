/* ===== 장부·회계 프로그램: 모든 데이터는 이 기기 localStorage에만 ===== */
const KEY = 'ilsang_acctbook_v1';
const N = s => { const v = String(s == null ? '' : s).replace(/[^\d.-]/g, ''); return v && v !== '-' ? Math.round(+v) || 0 : 0; };
const fmt = n => (Math.round(n) || 0).toLocaleString('ko-KR');
const fmtS = n => (n < 0 ? '-' : '') + fmt(Math.abs(n));
const f10 = n => Math.floor(n / 10) * 10;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ym = d => d.slice(0, 7);
const lastDay = (y, m) => new Date(y, m, 0).getDate();

/* ---- 계정과목: t = A자산 L부채 Q자본 R수익 E비용, s = 손익 구분 ---- */
const BASE = [
  ['101','현금','A'],['103','보통예금','A'],['108','외상매출금','A'],['110','받을어음','A'],['114','단기대여금','A'],['120','미수금','A'],
  ['131','선급금','A'],['133','선급비용','A'],['134','가지급금','A'],['135','부가세대급금','A'],['146','상품','A'],['153','원재료','A'],
  ['202','건물','A'],['206','기계장치','A'],['208','차량운반구','A'],['212','비품','A'],['219','시설장치','A'],['232','임차보증금','A'],
  ['251','외상매입금','L'],['252','지급어음','L'],['253','미지급금','L'],['254','예수금','L'],['255','부가세예수금','L'],['257','가수금','L'],
  ['259','선수금','L'],['260','단기차입금','L'],['261','미지급세금','L'],['293','장기차입금','L'],['294','임대보증금','L'],
  ['331','자본금','Q'],['338','인출금','Q'],['375','이월이익잉여금','Q'],
  ['401','상품매출','R','sales'],['404','제품매출','R','sales'],['411','용역·서비스매출','R','sales'],
  ['901','이자수익','R','nonopR'],['904','임대료수입','R','nonopR'],['930','잡이익','R','nonopR'],
  ['451','상품매출원가(상품 매입)','E','cogs'],['455','제품매출원가(재료 매입)','E','cogs'],
  ['801','급여','E'],['803','상여금','E'],['805','잡급(일용직)','E'],['806','퇴직급여','E'],['811','복리후생비','E'],['812','여비교통비','E'],
  ['813','기업업무추진비(접대비)','E'],['814','통신비','E'],['815','수도광열비','E'],['816','전력비','E'],['817','세금과공과','E'],
  ['818','감가상각비','E'],['819','임차료','E'],['820','수선비','E'],['821','보험료','E'],['822','차량유지비','E'],['824','운반비','E'],
  ['825','교육훈련비','E'],['826','도서인쇄비','E'],['829','사무용품비','E'],['830','소모품비','E'],['831','지급수수료','E'],
  ['833','광고선전비','E'],['845','외주용역비','E'],['848','잡비','E'],
  ['951','이자비용','E','nonopE'],['960','잡손실','E','nonopE'],['998','법인세등','E','tax']
].map(([code, name, t, s]) => ({ code, name, t, s: s || (t === 'E' ? 'sga' : t === 'R' ? 'sales' : '') }));
const TNAME = { A: '자산', L: '부채', Q: '자본', R: '수익', E: '비용' };
const DEBIT = t => t === 'A' || t === 'E';
const CASHLIKE = a => a.t === 'A' && (a.code === '101' || a.code === '103' || /예금|통장|현금/.test(a.name));

/* ---- 상태 ---- */
let S = store.get(KEY);
function newBook(name){ return { id: uid(), name: name || '내 사업장', type: 'ind', tax: 'general', accounts: [], entries: [], tpls: [], emps: [], payTax: {}, payPosted: {}, ob: null, lastBackup: '' }; }
if (!S || !S.books || !Object.keys(S.books).length) { const b = newBook(); S = { cur: b.id, books: { [b.id]: b } }; }
if (!S.books[S.cur]) S.cur = Object.keys(S.books)[0];
let B = S.books[S.cur];
const save = () => { store.set(KEY, S); renderKPI(); };

function accs(){ return BASE.concat(B.accounts || []); }
function acc(code){ return accs().find(a => a.code === code) || { code, name: '(삭제된 계정 ' + code + ')', t: 'E', s: 'sga' }; }
function accName(code){ return acc(code).name; }
function opt(list, sel){ return list.map(a => `<option value="${a.code}"${a.code === sel ? ' selected' : ''}>${esc(a.name)}</option>`).join(''); }
function optGroups(list, sel){
  const g = {}; list.forEach(a => (g[a.t] = g[a.t] || []).push(a));
  return ['A', 'L', 'Q', 'R', 'E'].filter(t => g[t]).map(t => `<optgroup label="${TNAME[t]}">${opt(g[t], sel)}</optgroup>`).join('');
}

/* ---- 거래 입력 폼: 구분별 계정·결제수단 ---- */
const KIND = { sale: '매출', buy: '매입·비용', in: '받은 돈', out: '보낸 돈', move: '현금↔통장', manual: '분개', ob: '기초', pay: '급여', vatclose: '부가세 정리' };
const EVID_SALE = { tax: '세금계산서 발행', card: '카드 매출', cash: '현금영수증 발행', bill: '계산서 발행 (면세)', simple: '영수증·현금 (정규증빙 외)', none: '증빙 없음' };
const EVID_BUY = { tax: '세금계산서', card: '신용·체크카드', cash: '현금영수증 (지출증빙)', bill: '계산서 (면세)', simple: '간이영수증', none: '증빙 없음' };
function cashAccs(){ return accs().filter(CASHLIKE); }
function accChoices(kind){
  const A = accs();
  if (kind === 'sale') return A.filter(a => a.t === 'R');
  if (kind === 'buy') return A.filter(a => a.t === 'E' || ['146','153','133','202','206','208','212','219'].includes(a.code) || (a.t === 'A' && B.accounts.includes(a) && !CASHLIKE(a)));
  if (kind === 'in') return ['108','120','110','259','257','260','293','331','114','232','134','901','930','904','294'].map(acc).concat(B.accounts.filter(a => a.t !== 'E' && !CASHLIKE(a)));
  if (kind === 'out') return ['251','253','254','261','255','252','260','293','338','131','114','232','134','259','294'].map(acc).concat(B.accounts.filter(a => a.t !== 'R' && !CASHLIKE(a)));
  if (kind === 'move') return cashAccs();
  return A;
}
function methodChoices(kind){
  const c = cashAccs().map(a => ({ v: a.code, n: a.name }));
  if (kind === 'sale') return c.concat([{ v: 'card', n: '카드 결제 (카드사에서 받을 돈)' }, { v: 'credit', n: '외상 (나중에 받음)' }, { v: '110', n: '어음 받음' }, { v: '259', n: '미리 받은 돈(선수금)에서 차감' }]);
  if (kind === 'buy') return c.concat([{ v: 'card', n: '카드 결제 (나중에 카드대금)' }, { v: 'credit', n: '외상 (나중에 줌)' }, { v: '252', n: '어음 발행' }, { v: '131', n: '미리 준 돈(선급금)에서 차감' }]);
  return c;
}
const ACC_HINT = { sale: '어떤 매출인가요', buy: '어디에 쓴 돈인가요', in: '무슨 돈을 받았나요', out: '무슨 돈을 보냈나요', move: '어느 쪽으로 옮겼나요' };
const METHOD_HINT = { sale: '받은 방법', buy: '결제 방법', in: '들어온 곳', out: '나간 곳', move: '' };

let editing = null;
function kind(){ return radio('kind'); }
function setupForm(keep){
  const k = kind(), man = k === 'manual';
  $('#simpleForm').classList.toggle('hidden', man); $('#manualForm').classList.toggle('hidden', !man);
  if (man) { if (!$('#mLines tbody').children.length) { addMLine(); addMLine(); } updatePreview(); return; }
  const prevA = $('#eAcc').value, prevM = $('#eMethod').value;
  $('#eAccLabel').textContent = ACC_HINT[k] || '계정과목';
  if (k === 'move') {
    const c = cashAccs();
    $('#eAccLabel').textContent = '보낸 곳 → ';
    $('#eAcc').innerHTML = opt(c, keep ? prevA : '101');
    $('#eMethodLabel').textContent = '받은 곳';
    $('#eMethod').innerHTML = opt(c, keep ? prevM : '103');
  } else {
    const list = accChoices(k);
    $('#eAcc').innerHTML = k === 'buy' ? optGroups(list, prevA) : opt(list, prevA);
    if (keep && list.some(a => a.code === prevA)) $('#eAcc').value = prevA;
    $('#eMethodLabel').textContent = METHOD_HINT[k];
    const m = methodChoices(k);
    $('#eMethod').innerHTML = m.map(x => `<option value="${x.v}">${esc(x.n)}</option>`).join('');
    if (keep && m.some(x => x.v === prevM)) $('#eMethod').value = prevM; else $('#eMethod').value = k === 'buy' ? 'card' : '103';
  }
  const tr = k === 'sale' || k === 'buy';
  $('#vatBox').classList.toggle('hidden', !tr);
  $('#vatBox .radio-group').classList.toggle('hidden', B.tax !== 'general');
  $('#vatBox > label.f').classList.toggle('hidden', B.tax !== 'general');
  const E = k === 'sale' ? EVID_SALE : EVID_BUY, ev = $('#eEvid').value || 'tax';
  $('#eEvid').innerHTML = Object.keys(E).filter(v => !(k === 'sale' && v === 'none')).map(v => `<option value="${v}">${E[v]}</option>`).join('');
  $('#eEvid').value = E[ev] && !(k === 'sale' && ev === 'none') ? ev : (k === 'sale' ? 'card' : 'card');
  updatePreview();
}
function formSrc(){
  const k = kind();
  if (k === 'manual') {
    const lines = $$('#mLines tbody tr').map(tr => ({ a: tr.querySelector('select').value, d: N(tr.querySelector('.d').value), c: N(tr.querySelector('.c').value) })).filter(l => l.d || l.c);
    return { kind: 'manual', date: val('mDate'), memo: val('mMemo'), partner: val('mPartner'), lines };
  }
  return { kind: k, date: val('eDate'), acc: $('#eAcc').value, amt: N(val('eAmt')), method: $('#eMethod').value, vat: radio('vat') || 'incl', evid: $('#eEvid').value, partner: val('ePartner'), memo: val('eMemo') };
}
function resolveMethod(src){
  const m = src.method;
  if (src.kind === 'sale') return m === 'card' || m === 'credit' ? '108' : m;
  if (src.kind === 'buy') {
    if (m === 'card') return '253';
    if (m === 'credit') return ['451','455','146','153'].includes(src.acc) ? '251' : '253';
    return m;
  }
  return m;
}
/* 간편 입력 → 분개 */
function toEntry(src){
  if (src.kind === 'manual') {
    const d = src.lines.reduce((s, l) => s + l.d, 0), c = src.lines.reduce((s, l) => s + l.c, 0);
    if (!src.lines.length) return { err: '분개 줄을 입력하세요' };
    if (d !== c) return { err: `차변 ${fmt(d)}원과 대변 ${fmt(c)}원이 같아야 합니다 (차이 ${fmt(Math.abs(d - c))}원)` };
    return { lines: src.lines };
  }
  const amt = src.amt; if (!amt || amt <= 0) return { err: '금액을 넣으세요' };
  if (src.kind === 'move' && src.acc === src.method) return { err: '보낸 곳과 받은 곳이 같습니다' };
  const general = B.tax === 'general', mAcc = resolveMethod(src);
  let supply = amt, tax = 0;
  if ((src.kind === 'sale' || src.kind === 'buy') && general && src.vat !== 'none' && src.evid !== 'bill') {
    if (src.vat === 'incl') { tax = Math.round(amt / 11); supply = amt - tax; } else { tax = Math.round(amt * 0.1); supply = amt; }
  }
  const total = supply + tax;
  if (src.kind === 'sale') return { lines: [{ a: mAcc, d: total, c: 0 }, { a: src.acc, d: 0, c: supply }].concat(tax ? [{ a: '255', d: 0, c: tax }] : []), supply, vatAmt: tax, ded: true };
  if (src.kind === 'buy') {
    const ded = tax > 0 && ['tax', 'card', 'cash'].includes(src.evid) && src.acc !== '813';
    const lines = ded ? [{ a: src.acc, d: supply, c: 0 }, { a: '135', d: tax, c: 0 }, { a: mAcc, d: 0, c: total }] : [{ a: src.acc, d: total, c: 0 }, { a: mAcc, d: 0, c: total }];
    return { lines, supply: ded ? supply : total, vatAmt: tax, ded,
      note: tax && !ded ? (src.acc === '813' ? '접대비(기업업무추진비)는 매입세액을 공제하지 않아 부가세까지 비용으로 넣습니다.' : '간이영수증·증빙 없음은 매입세액 공제가 안 되어 부가세까지 비용으로 넣습니다.') : '' };
  }
  if (src.kind === 'in') return { lines: [{ a: mAcc, d: amt, c: 0 }, { a: src.acc, d: 0, c: amt }] };
  if (src.kind === 'out') return { lines: [{ a: src.acc, d: amt, c: 0 }, { a: mAcc, d: 0, c: amt }] };
  if (src.kind === 'move') return { lines: [{ a: src.method, d: amt, c: 0 }, { a: src.acc, d: 0, c: amt }] };
  return { err: '구분을 고르세요' };
}
function jTable(lines){
  return '<table>' + lines.map(l => `<tr><td>${l.d ? '(차) ' + esc(accName(l.a)) : '<span style="padding-left:1.4em">(대) ' + esc(accName(l.a)) + '</span>'}</td><td class="n">${l.d ? fmt(l.d) : ''}</td><td class="n">${l.c ? fmt(l.c) : ''}</td></tr>`).join('') + '</table>';
}
function updatePreview(){
  const src = formSrc(), r = toEntry(src);
  if (src.kind === 'manual') {
    const d = src.lines.reduce((s, l) => s + l.d, 0), c = src.lines.reduce((s, l) => s + l.c, 0);
    $('#mBal').textContent = `차변 ${fmt(d)} · 대변 ${fmt(c)}` + (d === c ? ' · 일치' : ` · 차이 ${fmt(Math.abs(d - c))}`);
    $('#mBal').className = 'balance ' + (d === c && d ? 'ok' : 'bad');
  }
  if (src.kind !== 'manual' && (src.kind === 'sale' || src.kind === 'buy')) {
    $('#vatPrev').textContent = r.lines && r.vatAmt ? `공급가액 ${fmt(src.vat === 'incl' ? src.amt - r.vatAmt : src.amt)}원 · 부가세 ${fmt(r.vatAmt)}원 · 합계 ${fmt((src.vat === 'incl' ? src.amt : src.amt + r.vatAmt))}원` + (src.kind === 'buy' ? (r.ded ? ' · 매입세액 공제' : ' · 공제 안 됨') : '') : '';
  }
  if (r.err) { $('#jPrev').innerHTML = src.amt || src.kind === 'manual' ? `<div class="err">${esc(r.err)}</div>` : ''; return; }
  $('#jPrev').innerHTML = '<div class="cap">자동 분개 미리보기</div>' + jTable(r.lines) + (r.note ? `<div class="cap" style="margin-top:6px">${r.note}</div>` : '');
}
function addMLine(l){
  l = l || { a: '', d: 0, c: 0 };
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><select>${optGroups(accs(), l.a)}</select></td><td><input type="text" class="n d" inputmode="numeric" value="${l.d ? fmt(l.d) : ''}"></td><td><input type="text" class="n c" inputmode="numeric" value="${l.c ? fmt(l.c) : ''}"></td><td><button type="button" class="ghost sm" aria-label="줄 삭제">×</button></td>`;
  if (!l.a) tr.querySelector('select').value = '';
  tr.querySelector('button').onclick = () => { tr.remove(); updatePreview(); };
  tr.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { moneyInput(i); updatePreview(); }));
  tr.querySelector('select').addEventListener('change', updatePreview);
  $('#mLines tbody').appendChild(tr);
}
function moneyInput(el){
  const pos = el.value.length - el.selectionStart, n = N(el.value);
  el.value = el.value.trim() === '' ? '' : (String(el.value).trim().startsWith('-') ? '-' : '') + fmt(Math.abs(n));
  try { const p = Math.max(0, el.value.length - pos); el.setSelectionRange(p, p); } catch (_) {}
}
function resetForm(){
  editing = null; $('#formTitle').textContent = '거래 입력'; $('#eSave').textContent = '장부에 기록'; $('#eCancel').classList.add('hidden');
  $('#eAmt').value = ''; $('#eMemo').value = ''; $('#ePartner').value = ''; $('#mMemo').value = ''; $('#mPartner').value = ''; $('#mLines tbody').innerHTML = '';
  setupForm(true);
}
function saveEntry(){
  const src = formSrc(), r = toEntry(src);
  if (!src.date) return toast('날짜를 고르세요');
  if (r.err) return toast(r.err);
  const e = { id: editing || uid(), date: src.date, kind: src.kind, memo: src.memo || '', partner: src.partner || '', lines: r.lines };
  if (src.kind !== 'manual') e.src = Object.assign({}, src, { supply: r.supply, vatAmt: r.vatAmt, ded: r.ded });
  const i = B.entries.findIndex(x => x.id === e.id);
  if (i >= 0) B.entries[i] = e; else B.entries.push(e);
  save(); toast(editing ? '수정했습니다' : '기록했습니다');
  const keepDate = src.date; resetForm(); $('#eDate').value = keepDate; $('#mDate').value = keepDate;
  if (!$('#fMonth').value || $('#fMonth').value !== ym(keepDate)) $('#fMonth').value = ym(keepDate);
  renderList(); refreshPartners();
  if (src.kind === 'manual') { addMLine(); addMLine(); }
}
function editEntry(id){
  const e = B.entries.find(x => x.id === id); if (!e) return;
  if (e.kind === 'ob') { $$('#tabs button').find(b => b.dataset.tab === 'setup').click(); return toast('기초 잔액은 설정 탭에서 고칩니다'); }
  editing = id; $('#formTitle').textContent = '거래 수정'; $('#eSave').textContent = '수정 저장'; $('#eCancel').classList.remove('hidden');
  if (e.src && KIND[e.src.kind] && e.src.kind !== 'manual') {
    $$('input[name=kind]').forEach(r => r.checked = r.value === e.src.kind);
    setupForm(false);
    $('#eDate').value = e.date; $('#eAcc').value = e.src.acc; $('#eMethod').value = e.src.method; $('#eAmt').value = fmt(e.src.amt);
    $$('input[name=vat]').forEach(r => r.checked = r.value === e.src.vat); $('#eEvid').value = e.src.evid || 'card';
    $('#ePartner').value = e.partner; $('#eMemo').value = e.memo;
  } else {
    $$('input[name=kind]').forEach(r => r.checked = r.value === 'manual');
    $('#mLines tbody').innerHTML = ''; setupForm(false); $('#mLines tbody').innerHTML = '';
    e.lines.forEach(l => addMLine(l)); $('#mDate').value = e.date; $('#mMemo').value = e.memo; $('#mPartner').value = e.partner;
  }
  updatePreview(); $('#entryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function delEntry(id){
  B.entries = B.entries.filter(x => x.id !== id);
  Object.keys(B.payPosted || {}).forEach(k => { if (B.payPosted[k] === id) delete B.payPosted[k]; });
  save(); renderList(); toast('삭제했습니다');
}

/* ---- 집계 도우미 ---- */
const sorted = () => B.entries.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
function inRange(e, from, to){ return (!from || e.date >= from) && (!to || e.date <= to); }
function sums(from, to){ // 계정별 차변·대변 합계
  const m = {};
  B.entries.forEach(e => { if (!inRange(e, from, to)) return; e.lines.forEach(l => { const x = m[l.a] = m[l.a] || { d: 0, c: 0 }; x.d += l.d || 0; x.c += l.c || 0; }); });
  return m;
}
function bal(code, x){ const a = acc(code); return x ? (DEBIT(a.t) ? x.d - x.c : x.c - x.d) : 0; }
function totalOf(e){ return e.lines.reduce((s, l) => s + (l.d || 0), 0); }
function pl(from, to){
  const m = sums(from, to), r = { sales: 0, cogs: 0, sga: 0, nonopR: 0, nonopE: 0, tax: 0, rows: {} };
  Object.keys(m).forEach(code => { const a = acc(code); if (a.t !== 'R' && a.t !== 'E') return; const v = bal(code, m[code]); if (!v) return; r[a.s] += v; (r.rows[a.s] = r.rows[a.s] || []).push([a, v]); });
  r.gross = r.sales - r.cogs; r.op = r.gross - r.sga; r.pre = r.op + r.nonopR - r.nonopE; r.net = r.pre - r.tax;
  return r;
}
function cashNow(){ const m = sums('', ymd(today())); return cashAccs().reduce((s, a) => s + bal(a.code, m[a.code]), 0); }

/* ---- 화면: 요약 ---- */
function renderKPI(){
  const t = ymd(today()), from = t.slice(0, 8) + '01', p = pl(from, t);
  const exp = p.cogs + p.sga + p.nonopE + p.tax;
  $('#kpi').innerHTML = `<div><small>이번 달 매출</small><b>${fmt(p.sales + p.nonopR)}</b></div><div><small>이번 달 비용</small><b>${fmt(exp)}</b></div><div><small>이번 달 이익</small><b class="${p.net < 0 ? 'neg' : ''}">${fmtS(p.net)}</b></div><div><small>현금·통장 잔액</small><b class="${cashNow() < 0 ? 'neg' : ''}">${fmtS(cashNow())}</b></div>`;
}
function renderBooks(){
  $('#bookSel').innerHTML = Object.values(S.books).map(b => `<option value="${b.id}"${b.id === S.cur ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
}
function refreshPartners(){
  const set = new Set(); B.entries.forEach(e => e.partner && set.add(e.partner));
  $('#partnerList').innerHTML = [...set].sort().map(p => `<option value="${esc(p)}">`).join('');
}

/* ---- 거래 목록 ---- */
function entryLabel(e){
  if (e.src && e.src.acc) return e.kind === 'move' ? accName(e.src.acc) + ' → ' + accName(e.src.method) : accName(e.src.acc);
  return e.lines.filter(l => l.d).map(l => accName(l.a)).slice(0, 2).join('·');
}
function renderList(){
  const mo = $('#fMonth').value, q = val('fQ').toLowerCase();
  let list = sorted().reverse().filter(e => (!mo || ym(e.date) === mo));
  if (q) list = list.filter(e => (e.partner + ' ' + e.memo + ' ' + e.lines.map(l => accName(l.a)).join(' ')).toLowerCase().includes(q));
  if (!list.length) { $('#eList').innerHTML = `<tr><td class="empty">${B.entries.length ? '조건에 맞는 거래가 없습니다' : '아직 기록한 거래가 없습니다. 위에서 첫 거래를 입력해 보세요.'}</td></tr>`; $('#eListInfo').textContent = ''; return; }
  const cls = { sale: 's', in: 'b' };
  $('#eList').innerHTML = '<thead><tr><th>날짜</th><th>내용</th><th class="n">금액</th><th></th></tr></thead><tbody>' + list.slice(0, 300).map(e =>
    `<tr><td style="white-space:nowrap">${e.date.slice(5).replace('-', '.')}</td><td><span class="chip ${cls[e.kind] || ''}">${KIND[e.kind] || '분개'}</span> ${esc(e.partner || '')} ${e.memo ? '<small>' + esc(e.memo) + '</small>' : ''}<div class="acc">${esc(entryLabel(e))}${e.src && e.src.vatAmt ? ' · 부가세 ' + fmt(e.src.vatAmt) + (e.kind === 'buy' && !e.src.ded ? '(불공제)' : '') : ''}</div></td><td class="n">${fmt(e.src && e.src.amt ? e.src.amt : totalOf(e))}</td><td class="ops"><button type="button" class="ghost sm" data-ed="${e.id}">수정</button> <button type="button" class="ghost sm" data-del="${e.id}">삭제</button></td></tr>`).join('') + '</tbody>';
  const p = mo ? pl(mo + '-01', mo + '-31') : null;
  $('#eListInfo').textContent = `${list.length}건` + (list.length > 300 ? ' (최근 300건 표시)' : '') + (p ? ` · 이 달 매출 ${fmt(p.sales + p.nonopR)}원 · 비용 ${fmt(p.cogs + p.sga + p.nonopE + p.tax)}원 · 이익 ${fmtS(p.net)}원` : '');
}
$('#eList').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.ed) editEntry(b.dataset.ed);
  if (b.dataset.del) { if (b.dataset.armed) delEntry(b.dataset.del); else { b.dataset.armed = 1; b.textContent = '정말?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '삭제'; }, 2500); } }
});

/* ---- 분개장·원장 ---- */
let ledMode = 'journal', lastTable = { title: '', rows: [] };
function setLedAcc(){
  const list = ledMode === 'cash' ? cashAccs() : accs(), cur = $('#lAcc').value;
  $('#lAcc').innerHTML = ledMode === 'cash' ? opt(list, cur) : optGroups(list, cur || '103');
  $('#lAcc').classList.toggle('hidden', ledMode === 'journal');
}
function renderLedger(){
  const from = val('lFrom'), to = val('lTo'), out = $('#ledOut'), rows = [];
  if (ledMode === 'journal') {
    const list = sorted().filter(e => inRange(e, from, to));
    let td = 0, tc = 0;
    out.innerHTML = '<thead><tr><th>날짜</th><th>적요</th><th>계정과목</th><th class="n">차변</th><th class="n">대변</th></tr></thead><tbody>' + (list.length ? list.map(e => e.lines.map((l, i) => {
      td += l.d || 0; tc += l.c || 0; rows.push([e.date, (e.partner ? e.partner + ' ' : '') + e.memo, accName(l.a), l.d || '', l.c || '']);
      return `<tr>${i === 0 ? `<td rowspan="${e.lines.length}" style="white-space:nowrap">${e.date}</td><td rowspan="${e.lines.length}">${esc((e.partner ? e.partner + ' · ' : '') + (e.memo || KIND[e.kind] || ''))}</td>` : ''}<td${l.c ? ' class="ind"' : ''}>${esc(accName(l.a))}</td><td class="n">${l.d ? fmt(l.d) : ''}</td><td class="n">${l.c ? fmt(l.c) : ''}</td></tr>`;
    }).join('')).join('') + `<tr class="sum"><td colspan="3">합계</td><td class="n">${fmt(td)}</td><td class="n">${fmt(tc)}</td></tr>` : '<tr><td colspan="5" class="empty">기간 안에 거래가 없습니다</td></tr>') + '</tbody>';
    lastTable = { title: '분개장', head: ['날짜', '적요', '계정과목', '차변', '대변'], rows };
    return;
  }
  const code = $('#lAcc').value, a = acc(code), dr = DEBIT(a.t);
  const before = from ? bal(code, sums('', addDay(from, -1))[code]) : 0;
  let run = before, td = 0, tc = 0;
  const list = sorted().filter(e => inRange(e, from, to) && e.lines.some(l => l.a === code));
  const cashMode = ledMode === 'cash';
  const head = cashMode ? ['날짜', '적요', '상대 계정', '입금', '출금', '잔액'] : ['날짜', '적요', '상대 계정', '차변', '대변', '잔액'];
  rows.push(['', '전기이월', '', '', '', before]);
  const body = list.map(e => {
    const mine = e.lines.filter(l => l.a === code), d = mine.reduce((s, l) => s + (l.d || 0), 0), c = mine.reduce((s, l) => s + (l.c || 0), 0);
    td += d; tc += c; run += dr ? d - c : c - d;
    const other = [...new Set(e.lines.filter(l => l.a !== code).map(l => accName(l.a)))].join('·');
    rows.push([e.date, (e.partner ? e.partner + ' ' : '') + e.memo, other, d || '', c || '', run]);
    return `<tr><td style="white-space:nowrap">${e.date}</td><td>${esc((e.partner ? e.partner + ' · ' : '') + (e.memo || KIND[e.kind] || ''))}</td><td class="acc">${esc(other)}</td><td class="n">${d ? fmt(d) : ''}</td><td class="n">${c ? fmt(c) : ''}</td><td class="n${run < 0 ? ' neg' : ''}">${fmtS(run)}</td></tr>`;
  }).join('');
  out.innerHTML = `<thead><tr>${head.map((h, i) => `<th${i > 2 ? ' class="n"' : ''}>${h}</th>`).join('')}</tr></thead><tbody><tr class="sub"><td></td><td colspan="4">전기이월</td><td class="n">${fmtS(before)}</td></tr>${body || '<tr><td colspan="6" class="empty">기간 안에 이 계정 거래가 없습니다</td></tr>'}<tr class="sum"><td colspan="3">합계 · 기말 잔액</td><td class="n">${fmt(td)}</td><td class="n">${fmt(tc)}</td><td class="n${run < 0 ? ' neg' : ''}">${fmtS(run)}</td></tr></tbody>`;
  lastTable = { title: (cashMode ? '현금출납장 ' : '계정별 원장 ') + a.name, head, rows };
}
function addDay(s, n){ return ymd(addDays(parseDate(s), n)); }

/* ---- 재무제표 ---- */
let fsMode = 'pl', fsTable = {};
function plRows(p){
  const L = [];
  const sec = (title, key, total) => { L.push(['grp', title, total]); (p.rows[key] || []).sort((a, b) => a[0].code < b[0].code ? -1 : 1).forEach(([a, v]) => L.push(['ind', a.name, v])); };
  sec('Ⅰ. 매출액', 'sales', p.sales);
  sec('Ⅱ. 매출원가', 'cogs', p.cogs);
  L.push(['sub', 'Ⅲ. 매출총이익', p.gross]);
  sec('Ⅳ. 판매비와관리비', 'sga', p.sga);
  L.push(['sub', 'Ⅴ. 영업이익', p.op]);
  sec('Ⅵ. 영업외수익', 'nonopR', p.nonopR);
  sec('Ⅶ. 영업외비용', 'nonopE', p.nonopE);
  L.push(['sub', 'Ⅷ. ' + (B.type === 'corp' ? '법인세비용차감전순이익' : '소득세차감전순이익'), p.pre]);
  if (p.tax) sec('Ⅸ. 법인세등', 'tax', p.tax);
  L.push(['sum', (p.tax ? 'Ⅹ' : 'Ⅸ') + '. 당기순이익', p.net]);
  return L;
}
function bsRows(to){
  const m = sums('', to), y0 = to.slice(0, 4) + '-01-01';
  const L = [], grp = { ca: [], na: [], cl: [], nl: [], q: [] };
  Object.keys(m).forEach(code => {
    const a = acc(code), v = bal(code, m[code]); if (!v) return;
    if (a.t === 'A') grp[+code < 200 ? 'ca' : 'na'].push([a, v]);
    if (a.t === 'L') grp[+code < 290 ? 'cl' : 'nl'].push([a, v]);
    if (a.t === 'Q') grp.q.push([a, v]);
  });
  const prior = pl('', addDay(y0, -1)).net, cur = pl(y0, to).net;
  const S_ = arr => arr.reduce((s, x) => s + x[1], 0);
  const push = (t, arr) => { L.push(['sub', t, S_(arr)]); arr.sort((a, b) => a[0].code < b[0].code ? -1 : 1).forEach(([a, v]) => L.push(['ind', a.name, v])); };
  L.push(['grp', '자산', '']); push('유동자산', grp.ca); push('비유동자산', grp.na);
  const TA = S_(grp.ca) + S_(grp.na); L.push(['sum', '자산 총계', TA]);
  L.push(['grp', '부채', '']); push('유동부채', grp.cl); push('비유동부채', grp.nl);
  const TL = S_(grp.cl) + S_(grp.nl); L.push(['sum', '부채 총계', TL]);
  L.push(['grp', '자본', '']);
  grp.q.forEach(([a, v]) => L.push(['ind', a.name, v]));
  if (prior) L.push(['ind', '이익잉여금 (전기까지 누적 손익)', prior]);
  L.push(['ind', '당기순이익 (' + to.slice(0, 4) + '년)', cur]);
  const TQ = S_(grp.q) + prior + cur; L.push(['sum', '자본 총계', TQ]);
  L.push(['sum', '부채와 자본 총계', TL + TQ]);
  return { L, ok: TA === TL + TQ, TA, TLQ: TL + TQ };
}
function rowsHtml(L){
  return L.map(([k, n, v]) => `<tr class="${k === 'ind' ? '' : k}"><td class="${k === 'ind' ? 'ind' : ''}">${esc(n)}</td><td class="n${v < 0 ? ' neg' : ''}">${v === '' ? '' : fmtS(v)}</td></tr>`).join('');
}
function renderFS(){
  const from = val('sFrom'), to = val('sTo') || ymd(today()), out = $('#fsOut');
  if (fsMode === 'pl') {
    const L = plRows(pl(from, to));
    out.innerHTML = `<p class="hint">${from || '처음'} ~ ${to} · 단위: 원</p><div class="tbl-wrap"><table class="t">${rowsHtml(L)}</table></div>`;
    fsTable = { title: `손익계산서 (${from || '처음'}~${to})`, head: ['과목', '금액'], rows: L.map(r => [r[1], r[2]]) };
  } else if (fsMode === 'bs') {
    const r = bsRows(to);
    out.innerHTML = `<p class="hint">${to} 현재 · 단위: 원 (재무상태표는 끝 날짜 기준입니다)</p>${r.ok ? '' : `<div class="notice">자산(${fmt(r.TA)})과 부채·자본(${fmt(r.TLQ)})이 맞지 않습니다. 분개 차·대변이 어긋난 거래가 있는지 확인하세요.</div>`}<div class="tbl-wrap"><table class="t">${rowsHtml(r.L)}</table></div>`;
    fsTable = { title: `재무상태표 (${to})`, head: ['과목', '금액'], rows: r.L.map(x => [x[1], x[2]]) };
  } else if (fsMode === 'tb') {
    const m = sums(from, to), pre = from ? sums('', addDay(from, -1)) : {};
    const codes = [...new Set(Object.keys(m).concat(Object.keys(pre)))].sort();
    let T = [0, 0, 0, 0]; const rows = [];
    const body = codes.map(code => {
      const a = acc(code), x = m[code] || { d: 0, c: 0 }, p = pre[code] || { d: 0, c: 0 };
      const d = x.d + p.d, c = x.c + p.c, b = d - c;
      const bd = b > 0 ? b : 0, bc = b < 0 ? -b : 0;
      T[0] += bd; T[1] += d; T[2] += c; T[3] += bc; rows.push([a.name, bd, d, c, bc]);
      return `<tr><td class="n">${bd ? fmt(bd) : ''}</td><td class="n">${fmt(d)}</td><td style="text-align:center">${esc(a.name)}</td><td class="n">${fmt(c)}</td><td class="n">${bc ? fmt(bc) : ''}</td></tr>`;
    }).join('');
    out.innerHTML = `<p class="hint">${to}까지 누적 · 차변 합계와 대변 합계가 같으면 분개가 맞습니다.</p><div class="tbl-wrap"><table class="t"><thead><tr><th class="n">차변 잔액</th><th class="n">차변 합계</th><th style="text-align:center">계정과목</th><th class="n">대변 합계</th><th class="n">대변 잔액</th></tr></thead><tbody>${body || '<tr><td colspan="5" class="empty">거래가 없습니다</td></tr>'}<tr class="sum"><td class="n">${fmt(T[0])}</td><td class="n">${fmt(T[1])}</td><td style="text-align:center">${T[1] === T[2] ? '합계 일치' : '불일치'}</td><td class="n">${fmt(T[2])}</td><td class="n">${fmt(T[3])}</td></tr></tbody></table></div>`;
    fsTable = { title: `합계잔액시산표 (~${to})`, head: ['계정과목', '차변잔액', '차변합계', '대변합계', '대변잔액'], rows };
  } else {
    const y = +to.slice(0, 4), rows = [], P = [];
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); const p = pl(`${y}-${mm}-01`, `${y}-${mm}-${lastDay(y, m)}`); P.push(p); rows.push([m + '월', p.sales + p.nonopR, p.cogs, p.sga, p.nonopE + p.tax, p.net]); }
    const tot = rows.reduce((t, r) => t.map((v, i) => i ? v + r[i] : '합계'), ['합계', 0, 0, 0, 0, 0]);
    const max = Math.max(1, ...rows.map(r => Math.max(r[1], r[2] + r[3] + r[4])));
    out.innerHTML = `<p class="hint">${y}년 월별 · 단위: 원</p><div class="tbl-wrap"><table class="t"><thead><tr><th>월</th><th class="n">수익</th><th class="n">매출원가</th><th class="n">판관비</th><th class="n">기타비용</th><th class="n">순이익</th><th style="width:28%"></th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map((v, i) => `<td class="n${i === 4 && v < 0 ? ' neg' : ''}">${v ? fmtS(v) : '·'}</td>`).join('')}<td><div class="bar"><i style="width:${r[1] / max * 100}%"></i><i class="e" style="width:${(r[2] + r[3] + r[4]) / max * 100}%"></i></div></td></tr>`).join('')}<tr class="sum">${tot.map((v, i) => `<td class="${i ? 'n' : ''}${i === 5 && v < 0 ? ' neg' : ''}">${i ? fmtS(v) : v}</td>`).join('')}<td></td></tr></tbody></table></div><p class="hint">막대: 위 수익, 아래 비용</p>`;
    fsTable = { title: `${y}년 월별 손익`, head: ['월', '수익', '매출원가', '판관비', '기타비용', '순이익'], rows: rows.concat([tot]) };
  }
}
function setPeriod(p){
  const t = today(), y = t.getFullYear(), m = t.getMonth() + 1, pad = n => String(n).padStart(2, '0');
  let f, e;
  if (p === 'm') { f = `${y}-${pad(m)}-01`; e = `${y}-${pad(m)}-${lastDay(y, m)}`; }
  if (p === 'q') { const q0 = Math.floor((m - 1) / 3) * 3 + 1; f = `${y}-${pad(q0)}-01`; e = `${y}-${pad(q0 + 2)}-${lastDay(y, q0 + 2)}`; }
  if (p === 'y') { f = `${y}-01-01`; e = `${y}-12-31`; }
  if (p === 'ly') { f = `${y - 1}-01-01`; e = `${y - 1}-12-31`; }
  $('#sFrom').value = f; $('#sTo').value = e; renderFS();
}

/* ---- 부가세 ---- */
function vatPeriods(){
  const y = today().getFullYear(), L = [];
  [y, y - 1].forEach(Y => {
    if (B.tax === 'simple') { L.push([`${Y}-01-01`, `${Y}-12-31`, `${Y}년 (간이과세 1년분, 다음 해 1월 신고)`]); return; }
    L.push([`${Y}-07-01`, `${Y}-12-31`, `${Y}년 2기 (7~12월, 다음 해 1월 25일 확정신고)`], [`${Y}-10-01`, `${Y}-12-31`, `${Y}년 2기 확정분만 (10~12월)`], [`${Y}-07-01`, `${Y}-09-30`, `${Y}년 2기 예정 (7~9월, 10월 25일)`],
      [`${Y}-01-01`, `${Y}-06-30`, `${Y}년 1기 (1~6월, 7월 25일 확정신고)`], [`${Y}-04-01`, `${Y}-06-30`, `${Y}년 1기 확정분만 (4~6월)`], [`${Y}-01-01`, `${Y}-03-31`, `${Y}년 1기 예정 (1~3월, 4월 25일)`]);
  });
  return L;
}
function renderVatPeriods(){
  const L = vatPeriods(), t = ymd(today()), cur = $('#vPeriod').value;
  $('#vPeriod').innerHTML = L.map(([f, e, n]) => `<option value="${f}|${e}">${n}</option>`).join('');
  if (cur && L.some(x => x[0] + '|' + x[1] === cur)) $('#vPeriod').value = cur;
  else { const hit = L.find(x => x[0] <= t && t <= x[1] && (B.tax === 'simple' || x[2].includes('기 ('))); if (hit) $('#vPeriod').value = hit[0] + '|' + hit[1]; }
}
let vatTable = {};
function vatCalc(from, to){
  const R = { out: {}, inp: {}, outTax: 0, inTax: 0, nonDed: 0, nonDedTax: 0, cardSales: 0, salesTotal: 0, buyTotal: 0, other: { out: 0, in: 0 } };
  B.entries.filter(e => inRange(e, from, to) && e.kind !== 'vatclose').forEach(e => {
    const s = e.src;
    const o = e.lines.filter(l => l.a === '255').reduce((t, l) => t + (l.c || 0) - (l.d || 0), 0);
    const i = e.lines.filter(l => l.a === '135').reduce((t, l) => t + (l.d || 0) - (l.c || 0), 0);
    if (s && s.kind === 'sale') {
      const k = s.vatAmt ? s.evid : (s.evid === 'bill' || s.vat === 'none' ? 'free' : s.evid);
      const x = R.out[k] = R.out[k] || { n: 0, sup: 0, tax: 0 }; x.n++; x.sup += s.supply; x.tax += s.vatAmt; R.salesTotal += s.supply;
      if (s.evid === 'card' || s.evid === 'cash') R.cardSales += s.supply + s.vatAmt;
      R.outTax += o;
    } else if (s && s.kind === 'buy') {
      R.buyTotal += s.supply;
      if (s.ded) { const x = R.inp[s.evid] = R.inp[s.evid] || { n: 0, sup: 0, tax: 0 }; x.n++; x.sup += s.supply; x.tax += s.vatAmt; R.inTax += i; }
      else if (s.vatAmt) { R.nonDed++; R.nonDedTax += s.vatAmt; }
    } else { R.other.out += o; R.other.in += i; R.outTax += o; R.inTax += i; }
  });
  return R;
}
function renderVat(){
  const [from, to] = ($('#vPeriod').value || '|').split('|'), R = vatCalc(from, to), out = $('#vatOut');
  if (B.tax === 'exempt') { out.innerHTML = '<div class="notice">면세사업자는 부가세 신고 대신 매년 2월 10일까지 <b>사업장현황신고</b>를 합니다. 아래는 같은 기간 매출(수입금액) 합계입니다.</div>' + `<div class="stat"><div class="main"><small>수입금액</small><b>${fmt(pl(from, to).sales)}원</b></div></div>`; vatTable = { title: '수입금액', head: ['항목', '금액'], rows: [['수입금액', pl(from, to).sales]] }; return; }
  const V = ruleAt(RULES.vat, to);
  const LBL = { tax: '세금계산서', card: '신용카드·카드 매출', cash: '현금영수증', simple: '기타 (정규증빙 외)', none: '기타', free: '면세·영세 (세액 없음)', bill: '계산서' };
  const rowsOut = Object.entries(R.out), rowsIn = Object.entries(R.inp), csv = [];
  const tr = (k, x) => `<tr><td>${LBL[k] || k}</td><td class="n">${x.n}</td><td class="n">${fmt(x.sup)}</td><td class="n">${fmt(x.tax)}</td></tr>`;
  rowsOut.forEach(([k, x]) => csv.push(['매출', LBL[k], x.n, x.sup, x.tax])); rowsIn.forEach(([k, x]) => csv.push(['매입(공제)', LBL[k], x.n, x.sup, x.tax]));
  if (B.tax === 'simple') {
    const sales = R.salesTotal + Object.values(R.out).reduce((s, x) => s + x.tax, 0);
    out.innerHTML = `<div class="notice">간이과세자는 장부에 부가세를 나누지 않았으므로, 아래 공급대가(부가세 포함 매출)를 세무 계산기의 간이과세 계산에 넣으세요. 연 매출 ${fmt(V.simpleExempt)}원 미만이면 납부 의무가 면제됩니다.</div><div class="stat"><div class="main"><small>공급대가 (매출 합계)</small><b>${fmt(sales)}원</b></div><div><small>매입 합계 (세금계산서 등)</small><b>${fmt(R.buyTotal)}원</b></div><div><small>카드·현금영수증 매출</small><b>${fmt(R.cardSales)}원</b></div></div>`;
    $('#vatToTax').href = `../tax-calc/#vat?type=simple&sales=${sales}&buy=${R.buyTotal}&card=${R.cardSales}`;
    vatTable = { title: '간이과세 집계', head: ['구분', '증빙', '건수', '공급가액', '세액'], rows: csv };
    return;
  }
  const credit = B.type === 'ind' ? Math.min(Math.round(R.cardSales * V.cardCredit), V.cardCreditCap) : 0;
  const pay = R.outTax - R.inTax - Math.min(credit, Math.max(0, R.outTax - R.inTax));
  out.innerHTML = `<div class="stat"><div><small>매출세액</small><b>${fmt(R.outTax)}</b></div><div><small>매입세액 (공제)</small><b>${fmt(R.inTax)}</b></div><div><small>카드매출 세액공제 (어림)</small><b>${fmt(Math.min(credit, Math.max(0, R.outTax - R.inTax)))}</b></div><div class="main"><small>${pay < 0 ? '환급 예상' : '납부 예상'}</small><b>${fmt(Math.abs(pay))}원</b></div></div>
  <h3 class="h3">매출</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>증빙</th><th class="n">건수</th><th class="n">공급가액</th><th class="n">세액</th></tr></thead><tbody>${rowsOut.map(([k, x]) => tr(k, x)).join('') || '<tr><td colspan="4" class="empty">매출 기록 없음</td></tr>'}</tbody></table></div>
  <h3 class="h3">매입 (공제받는 것)</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>증빙</th><th class="n">건수</th><th class="n">공급가액</th><th class="n">세액</th></tr></thead><tbody>${rowsIn.map(([k, x]) => tr(k, x)).join('') || '<tr><td colspan="4" class="empty">공제 매입 없음</td></tr>'}</tbody></table></div>
  ${R.nonDed ? `<p class="hint">공제받지 못하는 매입 ${R.nonDed}건 (세액 ${fmt(R.nonDedTax)}원 · 간이영수증·증빙 없음·접대비)은 비용에 포함했습니다.</p>` : ''}
  ${R.other.out || R.other.in ? `<p class="hint">직접 분개로 넣은 부가세 매출세액 ${fmt(R.other.out)}원 · 매입세액 ${fmt(R.other.in)}원도 합계에 넣었습니다.</p>` : ''}
  <p class="hint">카드매출 세액공제는 개인사업자(직전 연도 공급가액 ${fmt(V.cardSalesLimit / 1e8)}억원 이하) 기준 ${(V.cardCredit * 100).toFixed(1)}%, 연 ${fmt(V.cardCreditCap / 1e4)}만원 한도로 어림했습니다. 예정고지·전자신고 세액공제 등은 빠져 있습니다.</p>
  <div class="actions"><button type="button" class="ghost" id="vatClose">이 기간 부가세 정리 분개 만들기</button></div>`;
  $('#vatToTax').href = `../tax-calc/#vat?type=general&out=${R.outTax}&in=${R.inTax}&card=${R.cardSales}&biz=${B.type}`;
  $('#vatClose').onclick = () => {
    const bal5 = bal('255', sums('', to)['255']), bal3 = bal('135', sums('', to)['135']);
    if (!bal5 && !bal3) return toast('정리할 부가세 잔액이 없습니다');
    const d = bal5 - bal3, lines = [];
    if (bal5) lines.push({ a: '255', d: bal5, c: 0 });
    if (bal3) lines.push({ a: '135', d: 0, c: bal3 });
    if (d > 0) lines.push({ a: '261', d: 0, c: d }); else if (d < 0) lines.push({ a: '120', d: -d, c: 0 });
    B.entries.push({ id: uid(), date: to, kind: 'vatclose', memo: '부가세 정리 (' + (d >= 0 ? '납부할 세금 → 미지급세금' : '환급받을 세금 → 미수금') + ')', partner: '세무서', lines });
    save(); toast('정리 분개를 기록했습니다. 납부할 때 [보낸 돈 → 미지급세금]으로 넣으세요'); renderVat();
  };
  vatTable = { title: `부가세 집계 ${from}~${to}`, head: ['구분', '증빙', '건수', '공급가액', '세액'], rows: csv.concat([['합계', '매출세액', '', '', R.outTax], ['합계', '매입세액', '', '', R.inTax], ['합계', '납부(환급) 예상', '', '', pay]]) };
}

/* ---- 거래처 ---- */
const RECV = ['108', '110', '120', '131', '114'], PAYB = ['251', '252', '253', '259'];
let pTable = {};
function renderPartners(){
  const m = {};
  B.entries.forEach(e => { if (!e.partner) return; const p = m[e.partner] = m[e.partner] || { r: 0, p: 0, sales: 0, buys: 0, n: 0, last: '' }; p.n++; if (e.date > p.last) p.last = e.date;
    e.lines.forEach(l => { if (RECV.includes(l.a)) p.r += (l.d || 0) - (l.c || 0); if (PAYB.includes(l.a)) p.p += (l.c || 0) - (l.d || 0); });
    if (e.src && e.src.kind === 'sale') p.sales += e.src.amt; if (e.src && e.src.kind === 'buy') p.buys += e.src.amt; });
  let list = Object.entries(m).sort((a, b) => (Math.abs(b[1].r) + Math.abs(b[1].p)) - (Math.abs(a[1].r) + Math.abs(a[1].p)) || (a[0] < b[0] ? -1 : 1));
  if ($('#pOpen').checked) list = list.filter(([, p]) => p.r || p.p);
  const T = list.reduce((t, [, p]) => [t[0] + p.r, t[1] + p.p], [0, 0]);
  $('#pOut').innerHTML = list.length ? `<thead><tr><th>거래처</th><th class="n">받을 돈</th><th class="n">줄 돈</th><th class="n hide-m">누적 매출</th><th class="n hide-m">누적 매입</th><th class="hide-m">마지막 거래</th></tr></thead><tbody>${list.map(([n, p]) => `<tr><td>${esc(n)} <small>${p.n}건</small></td><td class="n${p.r < 0 ? ' neg' : ''}">${p.r ? fmtS(p.r) : '·'}</td><td class="n${p.p < 0 ? ' neg' : ''}">${p.p ? fmtS(p.p) : '·'}</td><td class="n hide-m">${fmt(p.sales)}</td><td class="n hide-m">${fmt(p.buys)}</td><td class="hide-m">${p.last}</td></tr>`).join('')}<tr class="sum"><td>합계</td><td class="n">${fmtS(T[0])}</td><td class="n">${fmtS(T[1])}</td><td colspan="3" class="hide-m"></td></tr></tbody>` : `<tr><td class="empty">${Object.keys(m).length ? '잔액이 남은 거래처가 없습니다' : '거래처 이름을 넣은 거래가 아직 없습니다'}</td></tr>`;
  pTable = { title: '거래처별 잔액', head: ['거래처', '받을 돈', '줄 돈', '누적 매출', '누적 매입', '마지막 거래'], rows: list.map(([n, p]) => [n, p.r, p.p, p.sales, p.buys, p.last]) };
}

/* ---- 급여대장 ---- */
function payCalc(month){
  const at = month + '-01', R = ruleAt(RULES.insurance, at);
  return (B.emps || []).map(p => {
    const taxable = Math.max(0, (p.pay || 0) - (p.nontax || 0));
    const ins = p.ins !== false;
    const np = ins ? f10(taxable * R.np) : 0, hi = ins ? f10(taxable * R.hi) : 0, ltc = ins ? f10(hi * R.ltcRatio) : 0, ei = ins ? f10(taxable * R.ei) : 0;
    const W = WageTax.calc(taxable, p.dep || 1, p.kids || 0, p.ratio || 100, val('payDate') || at), est = W.it;
    const ov = (B.payTax[month] || {})[p.id];
    const it = ov != null && ov !== '' ? N(ov) : est;
    const lt = ov != null && ov !== '' ? f10(it * 0.1) : W.lt;
    const ded = np + hi + ltc + ei + it + lt;
    const er = ins ? np + hi + ltc + f10(taxable * (R.ei + 0.0025)) : 0;
    return { p, pay: p.pay || 0, np, hi, ltc, ei, it, lt, ded, net: (p.pay || 0) - ded, er, est, ov: ov != null && ov !== '' };
  });
}
function renderEmps(){
  const tb = $('#empTbl tbody');
  tb.innerHTML = (B.emps || []).map(p => `<tr data-id="${p.id}"><td><input type="text" data-k="name" value="${esc(p.name || '')}" placeholder="이름"></td><td><input type="text" class="n" data-k="pay" inputmode="numeric" value="${p.pay ? fmt(p.pay) : ''}" placeholder="2,500,000"></td><td><input type="text" class="n" data-k="nontax" inputmode="numeric" value="${p.nontax ? fmt(p.nontax) : ''}" placeholder="200,000"></td><td><input type="text" class="n" data-k="dep" inputmode="numeric" value="${p.dep || 1}" style="min-width:56px"></td><td><input type="text" class="n" data-k="kids" inputmode="numeric" value="${p.kids || 0}" style="min-width:48px"></td><td><select data-k="ratio">${[80, 100, 120].map(r => `<option value="${r}"${(p.ratio || 100) === r ? ' selected' : ''}>${r}%</option>`).join('')}</select></td><td><select data-k="ins"><option value="1"${p.ins !== false ? ' selected' : ''}>가입</option><option value="0"${p.ins === false ? ' selected' : ''}>미가입</option></select></td><td><button type="button" class="ghost sm" data-rm="${p.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">직원을 추가하세요</td></tr>';
}
$('#empTbl').addEventListener('input', ev => {
  const tr = ev.target.closest('tr'), p = tr && B.emps.find(x => x.id === tr.dataset.id); if (!p) return;
  const k = ev.target.dataset.k;
  if (k === 'name') p.name = ev.target.value; else if (k === 'ins') p.ins = ev.target.value === '1'; else if (k === 'ratio') p.ratio = +ev.target.value; else { if (k !== 'dep' && k !== 'kids') moneyInput(ev.target); p[k] = N(ev.target.value); }
  save(); renderPay();
});
$('#empTbl').addEventListener('change', ev => { const k = ev.target.dataset.k; if (k === 'ins' || k === 'ratio') { const p = B.emps.find(x => x.id === ev.target.closest('tr').dataset.id); if (k === 'ins') p.ins = ev.target.value === '1'; else p.ratio = +ev.target.value; save(); renderPay(); } });
$('#empTbl').addEventListener('click', ev => { const id = ev.target.dataset && ev.target.dataset.rm; if (!id) return; B.emps = B.emps.filter(x => x.id !== id); save(); renderEmps(); renderPay(); });
let payTable = {};
function renderPay(){
  const month = $('#payMonth').value; if (!month) return;
  const L = payCalc(month), T = {};
  ['pay', 'np', 'hi', 'ltc', 'ei', 'it', 'lt', 'ded', 'net', 'er'].forEach(k => T[k] = L.reduce((s, x) => s + x[k], 0));
  const posted = B.payPosted[month] && B.entries.some(e => e.id === B.payPosted[month]);
  $('#payOut').innerHTML = L.length ? `<thead><tr><th>이름</th><th class="n">지급액</th><th class="n">국민연금</th><th class="n">건강</th><th class="n">장기요양</th><th class="n">고용</th><th class="n">소득세</th><th class="n">지방소득세</th><th class="n">공제 계</th><th class="n">실지급액</th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(x.p.name || '(이름 없음)')}</td><td class="n">${fmt(x.pay)}</td><td class="n">${fmt(x.np)}</td><td class="n">${fmt(x.hi)}</td><td class="n">${fmt(x.ltc)}</td><td class="n">${fmt(x.ei)}</td><td class="n"><input type="text" class="n it" data-id="${x.p.id}" inputmode="numeric" value="${fmt(x.it)}" title="간이세액표 ${fmt(x.est)}원" style="min-width:90px${x.ov ? ';border-color:var(--accent)' : ''}"></td><td class="n">${fmt(x.lt)}</td><td class="n">${fmt(x.ded)}</td><td class="n"><b>${fmt(x.net)}</b></td></tr>`).join('')}<tr class="sum"><td>합계</td>${['pay', 'np', 'hi', 'ltc', 'ei', 'it', 'lt', 'ded', 'net'].map(k => `<td class="n">${fmt(T[k])}</td>`).join('')}</tr></tbody>` : '<tr><td class="empty">위에 직원을 먼저 추가하세요</td></tr>';
  $('#paySrc').textContent = '소득세는 ' + (WageTax.source(val('payDate') || month + '-01') || '근로소득 간이세액표') + ' 기준입니다. 직접 고친 칸은 테두리가 표시되고 고친 값이 우선합니다(지우면 다시 표 값).';
  $('#payPost').textContent = posted ? '이 달 급여 기록 다시 쓰기 (이미 기록됨)' : '이 달 급여를 장부에 기록';
  payTable = { title: `${month} 급여대장`, head: ['이름', '지급액', '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '지방소득세', '공제계', '실지급액', '사업주 4대보험'], rows: L.map(x => [x.p.name, x.pay, x.np, x.hi, x.ltc, x.ei, x.it, x.lt, x.ded, x.net, x.er]).concat([['합계', T.pay, T.np, T.hi, T.ltc, T.ei, T.it, T.lt, T.ded, T.net, T.er]]), L, T, month };
}
$('#payOut').addEventListener('change', ev => {
  if (!ev.target.classList.contains('it')) return;
  const m = $('#payMonth').value; B.payTax[m] = B.payTax[m] || {};
  B.payTax[m][ev.target.dataset.id] = ev.target.value.trim() === '' ? null : N(ev.target.value);
  save(); renderPay();
});

/* ---- 정기 거래 ---- */
function renderTpl(){
  const L = B.tpls || [];
  $('#tplOut').innerHTML = L.length ? `<thead><tr><th></th><th>내용</th><th class="n">금액</th><th class="n">날짜(일)</th><th></th></tr></thead><tbody>${L.map(t => `<tr data-id="${t.id}"><td><input type="checkbox" checked aria-label="선택"></td><td><span class="chip">${KIND[t.src.kind]}</span> ${esc(t.src.partner || '')} <small>${esc(t.src.memo || '')}</small><div class="acc">${esc(accName(t.src.acc))}</div></td><td class="n">${fmt(t.src.amt)}</td><td class="n"><input type="text" class="n day" inputmode="numeric" value="${t.day}" style="width:64px"></td><td><button type="button" class="ghost sm" data-rm="${t.id}">빼기</button></td></tr>`).join('')}</tbody>` : '<tr><td class="empty">저장한 정기 거래가 없습니다. 거래 입력 화면에서 [정기 거래로 저장]을 누르세요.</td></tr>';
}
$('#tplOut').addEventListener('click', ev => { const id = ev.target.dataset && ev.target.dataset.rm; if (!id) return; B.tpls = B.tpls.filter(x => x.id !== id); save(); renderTpl(); });
$('#tplOut').addEventListener('change', ev => { if (!ev.target.classList.contains('day')) return; const t = B.tpls.find(x => x.id === ev.target.closest('tr').dataset.id); t.day = Math.min(31, Math.max(1, N(ev.target.value) || 1)); save(); });
$('#tplRun').onclick = () => {
  const mo = $('#tMonth').value; if (!mo) return toast('달을 고르세요');
  const [y, m] = mo.split('-').map(Number); let n = 0;
  $$('#tplOut tbody tr').forEach(tr => {
    if (!tr.querySelector('input[type=checkbox]') || !tr.querySelector('input[type=checkbox]').checked) return;
    const t = B.tpls.find(x => x.id === tr.dataset.id); if (!t) return;
    const date = `${mo}-${String(Math.min(t.day, lastDay(y, m))).padStart(2, '0')}`, src = Object.assign({}, t.src, { date }), r = toEntry(src);
    if (r.err) return;
    B.entries.push({ id: uid(), date, kind: src.kind, memo: src.memo, partner: src.partner, lines: r.lines, src: Object.assign(src, { supply: r.supply, vatAmt: r.vatAmt, ded: r.ded }) }); n++;
  });
  save(); toast(n ? `${n}건을 ${m}월에 기록했습니다` : '고른 정기 거래가 없습니다'); renderList();
};

/* ---- 통장 내역 붙여넣기 ---- */
let bkRows = [], bkCols = 0;
const KW_OUT = [[/카드대금|카드결제|카드값/, '253'], [/국민연금|건강보험|고용보험|근로복지|산재|4대보험/, '254'], [/국세|세무서|부가세|종합소득|원천세|지방세|위택스|홈택스/, '261'], [/한전|전기요금|전력/, '816'], [/가스|수도|도시가스/, '815'], [/kt|skt|lg유플|통신|인터넷|휴대폰/i, '814'], [/월세|임대료|관리비/, '819'], [/주유|주차|하이패스|톨게이트|차량/, '822'], [/택배|퀵|화물|우체국/, '824'], [/광고|네이버|구글|메타|페이스북|인스타|당근/, '833'], [/수수료|이체수수료/, '831'], [/이자|대출이자/, '951'], [/급여|월급|상여/, '801'], [/쿠팡|다이소|오피스|문구|마트/, '830'], [/식당|커피|카페|배민|요기요/, '811']];
const KW_IN = [[/카드|bc|kb국민|신한|삼성|현대|롯데|하나|우리카드|nh카드|비씨|페이|토스|정산/i, '108'], [/이자|결산/, '901'], [/대출|론/, '260'], [/환급|국세환급/, '120']];
function parseDateAny(s){
  s = String(s || '').trim(); let m;
  if ((m = s.match(/(\d{4})[.\-\/년\s]*(\d{1,2})[.\-\/월\s]*(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})/))) return `${today().getFullYear()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function splitRow(line){ return line.includes('\t') ? line.split('\t') : line.includes(',') && !/\d,\d{3}/.test(line) ? line.split(',') : line.split(/\s{2,}/); }
function bkParse(){
  const lines = val('bkPaste').split(/\r?\n/).filter(l => l.trim());
  const cells = lines.map(splitRow); bkCols = Math.max(0, ...cells.map(c => c.length));
  const optsC = (sel) => '<option value="-1">없음</option>' + Array.from({ length: bkCols }, (_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${i + 1}번째 칸 (${esc((cells.find(c => c[i] && c[i].trim()) || [])[i] || '').slice(0, 10)})</option>`).join('');
  if (!bkCols) { $('#bkOut').innerHTML = ''; $('#bkPost').disabled = true; return; }
  const score = i => cells.filter(c => parseDateAny(c[i])).length;
  const isNum = i => cells.filter(c => c[i] && /^[\s\d,.\-원]+$/.test(c[i].trim()) && N(c[i])).length;
  let dc = 0; for (let i = 0; i < bkCols; i++) if (score(i) > score(dc)) dc = i;
  const nums = []; for (let i = 0; i < bkCols; i++) if (i !== dc && isNum(i) >= 1) nums.push(i);
  let desc = -1; for (let i = 0; i < bkCols; i++) if (i !== dc && !nums.includes(i)) { desc = i; break; }
  const keep = id => $('#' + id).dataset.set === String(bkCols) ? +$('#' + id).value : null;
  const pick = (id, def) => { const k = keep(id); $('#' + id).innerHTML = optsC(k != null ? k : def); $('#' + id).dataset.set = bkCols; };
  pick('cDate', dc); pick('cDesc', desc); pick('cOut', nums[0] != null ? nums[0] : -1); pick('cIn', nums[1] != null ? nums[1] : -1);
  bkBuild(cells);
}
function bkBuild(cells){
  cells = cells || val('bkPaste').split(/\r?\n/).filter(l => l.trim()).map(splitRow);
  const c = id => +$('#' + id).value, dC = c('cDate'), sC = c('cDesc'), oC = c('cOut'), iC = c('cIn');
  bkRows = cells.map(r => ({ date: parseDateAny(r[dC]), desc: sC >= 0 ? (r[sC] || '').trim() : '', out: oC >= 0 ? Math.abs(N(r[oC])) : 0, in: iC >= 0 ? Math.abs(N(r[iC])) : 0 })).filter(r => r.date && (r.out || r.in));
  const dup = r => B.entries.some(e => e.date === r.date && e.memo === r.desc && e.lines.some(l => cashAccs().some(a => a.code === l.a) && (l.d === r.in && r.in || l.c === r.out && r.out)));
  bkRows.forEach(r => { const kw = (r.out ? KW_OUT : KW_IN).find(([re]) => re.test(r.desc)); r.acc = kw ? kw[1] : (r.out ? '134' : '257'); r.dup = dup(r); });
  const outOpts = accs().filter(a => !CASHLIKE(a) && a.t !== 'R'), inOpts = accs().filter(a => !CASHLIKE(a) && a.t !== 'E');
  $('#bkOut').innerHTML = bkRows.length ? `<thead><tr><th></th><th>날짜</th><th>내용</th><th class="n">금액</th><th>계정과목</th></tr></thead><tbody>${bkRows.map((r, i) => `<tr data-i="${i}"><td><input type="checkbox" ${r.dup ? '' : 'checked'} aria-label="선택"></td><td style="white-space:nowrap">${r.date.slice(5)}</td><td>${esc(r.desc)}${r.dup ? ' <span class="chip">이미 있음?</span>' : ''}</td><td class="n${r.out ? ' neg' : ''}">${r.out ? '-' + fmt(r.out) : '+' + fmt(r.in)}</td><td><select style="${r.acc === '134' || r.acc === '257' ? 'border-color:#e0b06a' : ''}">${optGroups(r.out ? outOpts : inOpts, r.acc)}</select></td></tr>`).join('')}</tbody>` : '<tr><td class="empty">날짜와 금액을 읽은 줄이 없습니다. 칸 지정을 확인하세요.</td></tr>';
  $('#bkPost').disabled = !bkRows.length;
}
$('#bkPost').onclick = () => {
  const bank = $('#bkAcct').value, splitVat = $('#bkVat').value === 'incl' && B.tax === 'general'; let n = 0;
  $$('#bkOut tbody tr').forEach(tr => {
    if (!tr.querySelector('input').checked) return;
    const r = bkRows[+tr.dataset.i], a = tr.querySelector('select').value, A = acc(a);
    let src;
    if (r.out) src = A.t === 'E' || ['146', '153', '212', '208'].includes(a) ? { kind: 'buy', acc: a, amt: r.out, method: bank, vat: splitVat ? 'incl' : 'none', evid: splitVat ? 'card' : 'none' } : { kind: 'out', acc: a, amt: r.out, method: bank };
    else src = A.t === 'R' && (A.s === 'sales') ? { kind: 'sale', acc: a, amt: r.in, method: bank, vat: splitVat ? 'incl' : 'none', evid: splitVat ? 'tax' : 'simple' } : { kind: 'in', acc: a, amt: r.in, method: bank };
    Object.assign(src, { date: r.date, memo: r.desc, partner: '' });
    const e = toEntry(src); if (e.err) return;
    B.entries.push({ id: uid(), date: r.date, kind: src.kind, memo: r.desc, partner: '', lines: e.lines, src: Object.assign(src, { supply: e.supply, vatAmt: e.vatAmt, ded: e.ded }) }); n++;
  });
  save(); toast(`${n}건을 기록했습니다`); $('#bkPaste').value = ''; bkParse(); renderList();
};

/* ---- 설정·기초잔액·계정 ---- */
function renderSetup(){
  $('#sName').value = B.name; $('#sType').value = B.type; $$('input[name=tax]').forEach(r => r.checked = r.value === B.tax);
  const ob = B.ob || { date: ymd(today()).slice(0, 4) + '-01-01', lines: [{ a: '101', v: 0 }, { a: '103', v: 0 }], eq: B.type === 'corp' ? '375' : '331' };
  $('#obDate').value = ob.date; $('#obEq').innerHTML = opt(['331', '375'].map(acc), ob.eq);
  $('#obTbl').innerHTML = '<thead><tr><th>계정</th><th>거래처 <small>(선택)</small></th><th class="n">잔액</th><th></th></tr></thead><tbody>' + ob.lines.map(obRow).join('') + '</tbody>';
  $('#bkAcct').innerHTML = opt(cashAccs(), '103');
  const g = {}; accs().forEach(a => (g[a.t] = g[a.t] || []).push(a));
  $('#accAll').innerHTML = ['A', 'L', 'Q', 'R', 'E'].map(t => `<div class="grp">${TNAME[t]}</div>` + g[t].map(a => `<span class="${B.accounts.includes(a) ? 'u' : ''}">${esc(a.name)}${B.accounts.includes(a) ? `<button type="button" data-rma="${a.code}" aria-label="삭제">×</button>` : ''}</span>`).join('')).join('');
  $('#lastBk').textContent = B.lastBackup ? '마지막 백업: ' + B.lastBackup : '아직 백업한 적이 없습니다.';
}
function obRow(l){ return `<tr><td><select>${optGroups(accs().filter(a => 'ALQ'.includes(a.t)), l.a)}</select></td><td><input type="text" class="p" value="${esc(l.p || '')}" list="partnerList" placeholder="예: ○○상사"></td><td><input type="text" class="n v" inputmode="numeric" value="${l.v ? (l.v < 0 ? '-' : '') + fmt(Math.abs(l.v)) : ''}" placeholder="0"></td><td><button type="button" class="ghost sm">×</button></td></tr>`; }
$('#obTbl').addEventListener('click', ev => { if (ev.target.tagName === 'BUTTON') ev.target.closest('tr').remove(); });
$('#obTbl').addEventListener('input', ev => { if (ev.target.classList.contains('v')) moneyInput(ev.target); });
$('#obAdd').onclick = () => $('#obTbl tbody').insertAdjacentHTML('beforeend', obRow({ a: '108', v: 0 }));
function buildOb(){ // B.ob → 기초 잔액 분개 (거래처별로 나눠 거래처 잔액에도 나오게)
  B.entries = B.entries.filter(e => e.kind !== 'ob');
  const groups = {};
  (B.ob.lines || []).forEach(l => (groups[l.p || ''] = groups[l.p || ''] || []).push(l));
  Object.entries(groups).forEach(([p, ls]) => {
    const jl = ls.map(l => { const debit = acc(l.a).t === 'A' ? l.v >= 0 : l.v < 0; return debit ? { a: l.a, d: Math.abs(l.v), c: 0 } : { a: l.a, d: 0, c: Math.abs(l.v) }; });
    const diff = jl.reduce((s, l) => s + l.d - l.c, 0);
    if (diff) jl.push(diff > 0 ? { a: B.ob.eq, d: 0, c: diff } : { a: B.ob.eq, d: -diff, c: 0 });
    if (jl.length) B.entries.push({ id: uid(), date: B.ob.date, kind: 'ob', memo: '기초 잔액', partner: p, lines: jl });
  });
  save(); refreshPartners();
}
$('#obSave').onclick = () => {
  const date = val('obDate'); if (!date) return toast('시작일을 고르세요');
  const lines = $$('#obTbl tbody tr').map(tr => ({ a: tr.querySelector('select').value, p: tr.querySelector('input.p').value.trim(), v: N(tr.querySelector('input.v').value) })).filter(l => l.v);
  B.ob = { date, lines, eq: $('#obEq').value }; buildOb(); toast('기초 잔액을 저장했습니다');
};
$('#aAdd').onclick = () => {
  const name = val('aName'), t = $('#aType').value; if (!name) return toast('계정 이름을 넣으세요');
  if (accs().some(a => a.name === name)) return toast('같은 이름의 계정이 있습니다');
  const base = { A: 180, L: 280, Q: 390, R: 490, E: 890 }[t]; let c = base; while (accs().some(a => a.code === String(c))) c++;
  B.accounts.push({ code: String(c), name, t, s: t === 'E' ? 'sga' : t === 'R' ? 'sales' : '' });
  $('#aName').value = ''; save(); renderSetup(); setupForm(true); toast(`'${name}' 계정을 추가했습니다`);
};
$('#accAll').addEventListener('click', ev => {
  const c = ev.target.dataset && ev.target.dataset.rma; if (!c) return;
  if (B.entries.some(e => e.lines.some(l => l.a === c))) return toast('이 계정을 쓴 거래가 있어 지울 수 없습니다');
  B.accounts = B.accounts.filter(a => a.code !== c); save(); renderSetup();
});
$('#sName').addEventListener('input', () => { B.name = val('sName') || '내 사업장'; save(); renderBooks(); if (!$('#bookMgr').classList.contains('hidden')) renderBookList(); });
$('#sType').addEventListener('change', () => { B.type = $('#sType').value; save(); });
$$('input[name=tax]').forEach(r => r.addEventListener('change', () => { B.tax = radio('tax'); save(); setupForm(true); renderVatPeriods(); }));

/* ---- 저장 파일 ---- */
function csvOut(t, name){
  const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const body = [t.head].concat(t.rows).map(r => r.map(q).join(',')).join('\r\n');
  download(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), (name || t.title).replace(/[\\/:*?"<>|]/g, '_') + '.csv');
}
function printTable(t, extra){
  $('#printArea').innerHTML = `<h3>${esc(B.name)} · ${esc(t.title)}</h3>` + (extra || `<table><thead><tr>${t.head.map((h, i) => `<th${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((v, i) => `<td${typeof v === 'number' ? ' class="n"' : ''}>${typeof v === 'number' ? fmtS(v) : esc(v == null ? '' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  window.print();
}
$('#ledCsv').onclick = () => csvOut(lastTable); $('#ledPrint').onclick = () => printTable(lastTable);
$('#fsCsv').onclick = () => csvOut(fsTable); $('#fsPrint').onclick = () => printTable(fsTable);
$('#vatCsv').onclick = () => csvOut(vatTable); $('#pCsv').onclick = () => csvOut(pTable);
$('#payCsv').onclick = () => { renderPay(); csvOut(payTable); };
$('#payPrint').onclick = () => {
  renderPay(); const t = payTable; if (!t.L || !t.L.length) return toast('직원이 없습니다');
  const slip = x => `<div class="pg"><h3>${esc(B.name)} · ${t.month.replace('-', '년 ')}월 급여명세서</h3><p>성명: ${esc(x.p.name || '')} · 지급일: ${val('payDate')}</p><table><tr><th>지급 항목</th><th class="n">금액</th><th>공제 항목</th><th class="n">금액</th></tr>
  <tr><td>기본급 등</td><td class="n">${fmt(x.pay - (x.p.nontax || 0))}</td><td>국민연금</td><td class="n">${fmt(x.np)}</td></tr><tr><td>비과세(식대 등)</td><td class="n">${fmt(x.p.nontax || 0)}</td><td>건강보험</td><td class="n">${fmt(x.hi)}</td></tr>
  <tr><td></td><td></td><td>장기요양보험</td><td class="n">${fmt(x.ltc)}</td></tr><tr><td></td><td></td><td>고용보험</td><td class="n">${fmt(x.ei)}</td></tr><tr><td></td><td></td><td>소득세</td><td class="n">${fmt(x.it)}</td></tr><tr><td></td><td></td><td>지방소득세</td><td class="n">${fmt(x.lt)}</td></tr>
  <tr><th>지급 합계</th><th class="n">${fmt(x.pay)}</th><th>공제 합계</th><th class="n">${fmt(x.ded)}</th></tr><tr><th colspan="3">실지급액</th><th class="n">${fmt(x.net)}</th></tr></table><p style="font-size:9pt">근로기준법 제48조에 따른 임금명세서. 계산 방법: 4대보험은 비과세를 뺀 월 보수에 보험료율을 곱해 10원 미만 버림.</p></div>`;
  printTable(t, t.L.map(slip).join(''));
};
$('#payPost').onclick = () => {
  renderPay(); const t = payTable; if (!t.L || !t.L.length) return toast('직원이 없습니다');
  const date = val('payDate') || t.month + '-' + String(lastDay(+t.month.slice(0, 4), +t.month.slice(5))).padStart(2, '0');
  const lines = [{ a: '801', d: t.T.pay, c: 0 }];
  if (t.T.ded) lines.push({ a: '254', d: 0, c: t.T.ded });
  lines.push({ a: '103', d: 0, c: t.T.net });
  if ($('#payEr').checked && t.T.er) lines.push({ a: '811', d: t.T.er, c: 0 }, { a: '254', d: 0, c: t.T.er });
  const old = B.payPosted[t.month]; B.entries = B.entries.filter(e => e.id !== old);
  const id = uid(); B.entries.push({ id, date, kind: 'pay', memo: t.month + ' 급여 (' + t.L.length + '명)', partner: '', lines });
  B.payPosted[t.month] = id; save(); renderPay(); toast('급여를 기록했습니다. 4대보험·원천세 낼 때 [보낸 돈 → 예수금]으로 넣으세요');
};
$('#allCsv').onclick = () => { lastTable = null; ledMode = 'journal'; const f = $('#lFrom').value, t = $('#lTo').value; $('#lFrom').value = ''; $('#lTo').value = ''; renderLedger(); csvOut(lastTable, B.name + '_전체분개'); $('#lFrom').value = f; $('#lTo').value = t; ledMode = $('#ledTabs .on').dataset.tab; renderLedger(); };
$('#bkSave').onclick = () => {
  const d = ymd(today()); Object.values(S.books).forEach(b => b.lastBackup = d); store.set(KEY, S);
  download(new Blob([JSON.stringify({ app: 'ilsang-account-book', v: 1, saved: new Date().toISOString(), data: S })], { type: 'application/json' }), `장부백업_${d}.json`);
  renderSetup(); toast('백업 파일을 저장했습니다');
};
$('#bkLoad').onclick = () => $('#bkFile').click();
$('#bkFile').onchange = async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); const d = j.data || j;
    if (!d.books) throw 0;
    Object.values(d.books).forEach(b => { S.books[b.id] = b; });
    S.cur = d.cur && S.books[d.cur] ? d.cur : S.cur; switchBook(S.cur); toast(`장부 ${Object.keys(d.books).length}개를 불러왔습니다 (같은 장부는 덮어씀)`);
  } catch (_) { toast('장부 백업 파일이 아닙니다'); }
  ev.target.value = '';
};
/* ---- 장부 전환·탭 ---- */
function switchBook(id){
  S.cur = id; B = S.books[id];
  ['accounts', 'entries', 'tpls', 'emps'].forEach(k => B[k] = B[k] || []); B.payTax = B.payTax || {}; B.payPosted = B.payPosted || {};
  save(); renderBooks(); resetForm(); refreshPartners(); renderList(); renderSetup(); renderEmps(); renderVatPeriods(); renderTab(curTab);
  if (!$('#bookMgr').classList.contains('hidden')) renderBookList();
}
$('#bookSel').addEventListener('change', () => switchBook($('#bookSel').value));
/* ---- 장부 추가·삭제·이름 바꾸기·이월 ---- */
let confirmId = null, lastDeleted = null, undoTimer = null;
const bookStat = b => { const e = (b.entries || []).filter(x => x.kind !== 'ob'); return { n: e.length, last: e.reduce((m, x) => x.date > m ? x.date : m, '') }; };
function renderBookList(){
  const L = Object.values(S.books);
  $('#bookList').innerHTML = '<thead><tr><th>장부 이름</th><th class="n">거래</th><th class="hide-m">마지막 거래</th><th></th></tr></thead><tbody>' + L.map(b => {
    const st = bookStat(b), cur = b.id === S.cur;
    if (confirmId === b.id) return `<tr class="confirm" data-id="${b.id}"><td colspan="4"><b>‘${esc(b.name)}’ 장부를 삭제할까요?</b> 거래 ${st.n}건${(b.emps || []).length ? `, 직원 ${b.emps.length}명` : ''}이 함께 지워집니다.<div class="actions" style="margin-top:8px"><button type="button" class="sm" data-act="bkdel">백업 받고 삭제</button><button type="button" class="ghost sm" data-act="del">그냥 삭제</button><button type="button" class="ghost sm" data-act="cancel">취소</button></div></td></tr>`;
    return `<tr class="${cur ? 'cur' : ''}" data-id="${b.id}"><td><input type="text" data-act="name" value="${esc(b.name)}" aria-label="장부 이름" style="min-width:130px">${cur ? ' <span class="chip s">지금 장부</span>' : ''}</td><td class="n">${st.n}건</td><td class="hide-m">${st.last || '–'}</td><td class="ops">${cur ? '' : '<button type="button" class="ghost sm" data-act="open">열기</button>'}<button type="button" class="ghost sm" data-act="ask">삭제</button></td></tr>`;
  }).join('') + '</tbody>';
  const fromName = B.name;
  $('#nbCarryInfo').textContent = `‘${fromName}’의 기준일 잔액(현금·통장·외상·대출·자본)을 새 장부의 기초 잔액으로 넣고, 그동안의 이익은 ${B.type === 'corp' ? '이월이익잉여금' : '자본금'}에 더합니다. 계정과목·직원·정기 거래도 복사합니다.`;
}
function toggleMgr(open){ const o = open != null ? open : $('#bookMgr').classList.contains('hidden'); $('#bookMgr').classList.toggle('hidden', !o); $('#bookMgrBtn').setAttribute('aria-expanded', o); $('#bookMgrBtn').textContent = o ? '닫기' : '장부 추가·삭제'; if (o) { confirmId = null; renderBookList(); } }
$('#bookMgrBtn').onclick = () => toggleMgr();
$('#nbClose').onclick = () => toggleMgr(false);
$('#bookDel').onclick = () => { toggleMgr(true); confirmId = B.id; renderBookList(); $('#bookMgr').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
function backupFile(){ const d = ymd(today()); Object.values(S.books).forEach(b => b.lastBackup = d); store.set(KEY, S); download(new Blob([JSON.stringify({ app: 'ilsang-account-book', v: 1, saved: new Date().toISOString(), data: S })], { type: 'application/json' }), `장부백업_${d}.json`); }
function deleteBook(id){
  const b = S.books[id]; if (!b) return;
  lastDeleted = { book: b, wasCur: id === S.cur }; delete S.books[id]; confirmId = null;
  if (!Object.keys(S.books).length) { const nb = newBook('새 장부'); S.books[nb.id] = nb; lastDeleted.autoNew = nb.id; }
  switchBook(id === S.cur ? Object.keys(S.books)[0] : S.cur); renderBookList();
  $('#undoText').textContent = `‘${b.name}’ 장부를 삭제했습니다`; $('#undoBar').classList.remove('hidden');
  clearTimeout(undoTimer); undoTimer = setTimeout(() => { $('#undoBar').classList.add('hidden'); lastDeleted = null; }, 10000);
}
$('#undoBtn').onclick = () => {
  if (!lastDeleted) return; const { book, wasCur, autoNew } = lastDeleted;
  if (autoNew && S.books[autoNew] && !S.books[autoNew].entries.length) delete S.books[autoNew];
  S.books[book.id] = book; lastDeleted = null; $('#undoBar').classList.add('hidden');
  switchBook(wasCur ? book.id : S.cur); renderBookList(); toast(`‘${book.name}’ 장부를 되살렸습니다`);
};
$('#bookList').addEventListener('click', ev => {
  const btn = ev.target.closest('button'); if (!btn) return; const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
  if (act === 'open') { switchBook(id); renderBookList(); toast(`‘${S.books[id].name}’ 장부를 열었습니다`); }
  if (act === 'ask') { confirmId = id; renderBookList(); }
  if (act === 'cancel') { confirmId = null; renderBookList(); }
  if (act === 'bkdel') { backupFile(); deleteBook(id); }
  if (act === 'del') deleteBook(id);
});
$('#bookList').addEventListener('change', ev => {
  if (ev.target.dataset.act !== 'name') return; const id = ev.target.closest('tr').dataset.id, v = ev.target.value.trim();
  if (!v) { ev.target.value = S.books[id].name; return toast('이름을 비울 수 없습니다'); }
  S.books[id].name = v; save(); renderBooks(); if (id === S.cur) $('#sName').value = v; toast('이름을 바꿨습니다');
});
$('#nbFrom').addEventListener('change', () => {
  const c = $('#nbFrom').value === 'carry'; $('#nbCarryBox').classList.toggle('hidden', !c);
  if (c && !$('#nbDate').value) { const y = today().getFullYear(); $('#nbDate').placeholder = `${y - 1}-12-31`; }
  if ($('#nbFrom').value !== 'empty') { if (!$('#nbType').value) $('#nbType').value = B.type; if (!$('#nbTax').value) $('#nbTax').value = B.tax; }
});
// 기준일까지의 계정·거래처별 잔액으로 기초 잔액 줄 만들기
function carryLines(src, date){
  const accOf = code => BASE.concat(src.accounts || []).find(a => a.code === code) || { t: 'E' };
  const m = {};
  src.entries.forEach(e => { if (e.date > date) return; e.lines.forEach(l => { const a = accOf(l.a); if (!'ALQ'.includes(a.t)) return; const p = ['108','110','120','131','114','251','252','253','259'].includes(l.a) ? (e.partner || '') : ''; const k = l.a + '|' + p; m[k] = (m[k] || 0) + (l.d || 0) - (l.c || 0); }); });
  const eqAcc = src.type === 'corp' ? '375' : '331', lines = [];
  Object.entries(m).forEach(([k, dc]) => { const [a, p] = k.split('|'), t = accOf(a).t; if (!dc) return;
    if (t === 'Q' && (src.type !== 'corp' || a !== '331')) return; // 개인: 자본 계정은 모두 자본금으로 합침 / 법인: 자본금만 따로
    lines.push({ a, v: t === 'A' ? dc : -dc, p }); });
  return { lines, eq: eqAcc };
}
$('#nbMake').onclick = () => {
  const name = val('nbName'), from = $('#nbFrom').value, type = $('#nbType').value, tax = $('#nbTax').value;
  const miss = [!name && '장부 이름', !from && '시작 방식', !type && '사업자 형태', !tax && '과세 유형'].filter(Boolean);
  if (from === 'carry' && !val('nbDate')) miss.push('이월 기준일');
  if (miss.length) return toast(miss.join('·') + '을(를) 넣으세요');
  if (Object.values(S.books).some(b => b.name === name)) return toast('같은 이름의 장부가 있습니다');
  const src = B, nb = newBook(name); nb.type = type; nb.tax = tax;
  if (from !== 'empty') { nb.accounts = JSON.parse(JSON.stringify(src.accounts || [])); nb.emps = JSON.parse(JSON.stringify(src.emps || [])); nb.tpls = JSON.parse(JSON.stringify(src.tpls || [])).map(t => Object.assign(t, { id: uid() })); }
  S.books[nb.id] = nb; switchBook(nb.id);
  if (from === 'carry') {
    const d = val('nbDate'), c = carryLines(src, d), next = ymd(addDays(parseDate(d), 1));
    B.ob = { date: next, lines: c.lines, eq: type === 'corp' ? '375' : '331' }; buildOb(); renderSetup();
    toast(`‘${name}’ 장부를 만들고 ${d} 잔액 ${c.lines.length}줄을 기초 잔액으로 넣었습니다`);
  } else toast(`‘${name}’ 장부를 만들었습니다`);
  ['nbName', 'nbDate'].forEach(i => $('#' + i).value = ''); ['nbFrom', 'nbType', 'nbTax'].forEach(i => $('#' + i).value = ''); $('#nbCarryBox').classList.add('hidden');
  renderBookList();
};

let curTab = 'input';
function renderTab(t){
  curTab = t;
  if (t === 'input') renderList();
  if (t === 'ledger') { setLedAcc(); renderLedger(); }
  if (t === 'fs') renderFS();
  if (t === 'vat') { renderVatPeriods(); renderVat(); }
  if (t === 'partner') renderPartners();
  if (t === 'pay') { renderEmps(); renderPay(); }
  if (t === 'bulk') { renderTpl(); }
  if (t === 'setup') renderSetup();
}
bindTabs();
$('#tabs').onTab = renderTab;
$('#ledTabs').onTab = m => { ledMode = m; setLedAcc(); renderLedger(); };
$('#fsTabs').onTab = m => { fsMode = m; renderFS(); };
$$('.quickp button').forEach(b => b.onclick = () => setPeriod(b.dataset.p));

/* ---- 입력 이벤트 ---- */
$$('input[name=kind]').forEach(r => r.addEventListener('change', () => { setupForm(true); }));
['eAcc', 'eMethod', 'eEvid'].forEach(id => $('#' + id).addEventListener('change', updatePreview));
$$('input[name=vat]').forEach(r => r.addEventListener('change', updatePreview));
$('#eAmt').addEventListener('input', () => { moneyInput($('#eAmt')); updatePreview(); });
$('#eSave').onclick = saveEntry; $('#eCancel').onclick = resetForm;
$('#mAdd').onclick = () => addMLine();
$('#eTpl').onclick = () => {
  const src = formSrc(); if (src.kind === 'manual') return toast('직접 분개는 정기 거래로 저장할 수 없습니다');
  const r = toEntry(src); if (r.err) return toast(r.err);
  B.tpls.push({ id: uid(), day: +(src.date || ymd(today())).slice(8) || 1, src: Object.assign({}, src, { date: '' }) }); save(); toast('정기 거래로 저장했습니다 ([정기·통장 입력] 탭)');
};
$('#fMonth').addEventListener('change', renderList); $('#fQ').addEventListener('input', renderList);
['lFrom', 'lTo', 'lAcc'].forEach(id => $('#' + id).addEventListener('change', renderLedger));
['sFrom', 'sTo'].forEach(id => $('#' + id).addEventListener('change', renderFS));
$('#vPeriod').addEventListener('change', renderVat);
$('#pOpen').addEventListener('change', renderPartners);
$('#payMonth').addEventListener('change', () => { const m = $('#payMonth').value; if (m) $('#payDate').value = m + '-' + String(lastDay(+m.slice(0, 4), +m.slice(5))).padStart(2, '0'); renderPay(); });
$('#empAdd').onclick = () => { B.emps.push({ id: uid(), name: '', pay: 0, nontax: 200000, dep: 1, kids: 0, ratio: 100, ins: true }); save(); renderEmps(); renderPay(); const i = $$('#empTbl tbody input[data-k=name]').pop(); if (i) i.focus(); };
$('#bkPaste').addEventListener('input', bkParse);
['cDate', 'cDesc', 'cOut', 'cIn'].forEach(id => $('#' + id).addEventListener('change', () => bkBuild()));

/* ---- 시작 ---- */
(function init(){
  const t = ymd(today()), mo = t.slice(0, 7);
  $('#eDate').value = t; $('#mDate').value = t; $('#fMonth').value = mo; $('#tMonth').value = mo; $('#payMonth').value = mo;
  $('#payDate').value = mo + '-' + String(lastDay(today().getFullYear(), today().getMonth() + 1)).padStart(2, '0');
  $('#lFrom').value = t.slice(0, 4) + '-01-01'; $('#lTo').value = t;
  $('#sFrom').value = t.slice(0, 4) + '-01-01'; $('#sTo').value = t;
  switchBook(S.cur);
  onRulesLoaded(() => { renderPay(); });
  WageTax.refresh(() => renderPay());
})();
