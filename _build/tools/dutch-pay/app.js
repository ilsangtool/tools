const KEY = 'ilsang_dutch_v1';
let S = null, nid = 1;
const newId = () => 'p' + (Date.now().toString(36)) + (nid++);
function fresh(){
  const p = ['나', '친구1', '친구2'].map(n => ({ id: newId(), name: n }));
  return { people: p, items: [{ id: newId(), name: '1차', amt: '', payer: p[0].id, who: p.map(x => x.id) }], acct: '' };
}

/* ---------- 간단 N빵 ---------- */
function simple(){
  const T = +val('sTotal') || 0, n = Math.max(1, +val('sN') || 1), u = +radio('unit'), up = radio('round') === 'up';
  let per = T / n; per = up ? Math.ceil(per / u) * u : Math.floor(per / u) * u;
  const payerShare = T - per * (n - 1);
  $('#sStat').innerHTML = !T || !+val('sN') ? `<div><small>1인당</small><b style="font-size:16px">${!T ? '총 금액' : '인원'}을 넣어 주세요</b></div>` :
    `<div class="main"><small>1인당 보낼 금액</small><b>${won(per)}</b></div>` +
    (up ? `<div><small>모두 보내면 남는 돈</small><b>${won(per * n - T)}</b></div>`
        : `<div><small>결제한 사람 부담</small><b>${won(payerShare)}</b></div>`);
  simple.text = `[N빵 정산]\n총 ${won(T)} ÷ ${n}명\n1인당 ${won(per)}씩 보내 주세요!`;
  store.set(KEY + '_s', { T: val('sTotal'), n: val('sN'), u, r: radio('round') });
}

/* ---------- 여러 차수 ---------- */
const pname = id => (S.people.find(p => p.id === id) || {}).name || '?';
function renderPeople(){
  $('#people').innerHTML = S.people.map(p =>
    `<span class="chip"><input value="${esc(p.name)}" data-pid="${p.id}" aria-label="이름"><button type="button" data-delp="${p.id}" aria-label="${esc(p.name)} 삭제">×</button></span>`).join('');
}
function renderItems(){
  $('#items').innerHTML = S.items.map((it, i) => `
    <div class="item" data-iid="${it.id}">
      <div class="top">
        <div class="nm"><label>내역</label><input type="text" data-k="name" value="${esc(it.name)}" placeholder="예: ${i + 1}차 고깃집"></div>
        <div><label>금액</label><input type="number" data-k="amt" value="${esc(it.amt)}" inputmode="numeric" placeholder="0"></div>
        <div><label>낸 사람</label><select data-k="payer">${S.people.map(p => `<option value="${p.id}"${p.id === it.payer ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <button type="button" class="del" data-deli="${it.id}" aria-label="내역 삭제">×</button>
      </div>
      <div class="who" aria-label="함께한 사람">${S.people.map(p => `<label><input type="checkbox" data-who="${p.id}"${it.who.includes(p.id) ? ' checked' : ''}>${esc(p.name)}</label>`).join('')}</div>
    </div>`).join('');
}
function settle(){
  const bal = {}; S.people.forEach(p => bal[p.id] = { paid: 0, owe: 0 });
  S.items.forEach(it => {
    const amt = Math.round(+it.amt || 0), who = it.who.filter(id => bal[id]);
    if (!amt || !who.length || !bal[it.payer]) return;
    bal[it.payer].paid += amt;
    const share = Math.floor(amt / who.length); let rem = amt - share * who.length;
    // 끝전은 낸 사람이 함께했다면 낸 사람에게, 아니면 앞사람부터 1원씩
    const order = who.includes(it.payer) ? [it.payer, ...who.filter(x => x !== it.payer)] : who;
    who.forEach(id => bal[id].owe += share);
    for (let k = 0; rem > 0; k++, rem--) bal[order[k % order.length]].owe += 1;
  });
  // 송금 최소화: 가장 많이 받을 사람과 가장 많이 줄 사람을 차례로 맞춤
  const cred = [], debt = [];
  Object.entries(bal).forEach(([id, b]) => { const d = b.paid - b.owe; if (d > 0) cred.push([id, d]); else if (d < 0) debt.push([id, -d]); });
  cred.sort((a, b) => b[1] - a[1]); debt.sort((a, b) => b[1] - a[1]);
  const tx = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i][1], cred[j][1]);
    tx.push([debt[i][0], cred[j][0], x]);
    debt[i][1] -= x; cred[j][1] -= x;
    if (!debt[i][1]) i++; if (!cred[j][1]) j++;
  }
  return { bal, tx };
}
function multi(){
  const { bal, tx } = settle();
  const total = S.items.reduce((a, it) => a + (Math.round(+it.amt) || 0), 0);
  const rows = S.people.map(p => { const b = bal[p.id], d = b.paid - b.owe;
    return `<tr><td>${esc(p.name)}</td><td class="n">${won(b.owe)}</td><td class="n">${won(b.paid)}</td><td class="n" style="color:${d > 0 ? 'var(--accent)' : d < 0 ? 'var(--bad)' : 'inherit'}">${d > 0 ? '+' : ''}${won(d)}</td></tr>`; }).join('');
  $('#mResult').innerHTML = !total ? '<p class="hint">금액을 넣으면 결과가 나옵니다.</p>' :
    `<div class="stat"><div><small>총 사용 금액</small><b>${won(total)}</b></div><div class="main"><small>필요한 송금</small><b>${tx.length}번</b></div></div>` +
    (tx.length ? `<ul class="tx">${tx.map(([a, b, x]) => `<li><span>${esc(pname(a))} → ${esc(pname(b))}</span><b>${won(x)}</b></li>`).join('')}</ul>` : '<p class="hint">주고받을 돈이 없습니다.</p>') +
    `<table class="t"><tr><th>이름</th><th style="text-align:right">부담할 몫</th><th style="text-align:right">낸 돈</th><th style="text-align:right">차액</th></tr>${rows}</table>`;
  const lines = ['[모임 정산]'];
  S.items.forEach(it => { if (+it.amt) lines.push(`· ${it.name || '내역'} ${won(+it.amt)} (${pname(it.payer)} 결제, ${it.who.length}명)`); });
  lines.push(`총 ${won(total)}`, '', '[보낼 돈]');
  tx.forEach(([a, b, x]) => lines.push(`${pname(a)} → ${pname(b)} ${won(x)}`));
  if (S.acct) lines.push('', '계좌: ' + S.acct);
  multi.text = lines.join('\n');
  store.set(KEY, S);
}
function renderAll(){ renderPeople(); renderItems(); $('#acct').value = S.acct || ''; multi(); }

$('#people').addEventListener('input', e => { const p = S.people.find(x => x.id === e.target.dataset.pid); if (p) { p.name = e.target.value; renderItems(); multi(); } });
$('#people').addEventListener('click', e => {
  const id = e.target.dataset.delp; if (!id) return;
  if (S.people.length <= 2) { toast('최소 2명은 있어야 합니다'); return; }
  S.people = S.people.filter(p => p.id !== id);
  S.items.forEach(it => { it.who = it.who.filter(w => w !== id); if (it.payer === id) it.payer = S.people[0].id; });
  renderAll();
});
function addPerson(){
  const n = val('newP'); if (!n) { $('#newP').focus(); return; }
  const p = { id: newId(), name: n }; S.people.push(p);
  S.items.forEach(it => it.who.push(p.id));
  $('#newP').value = ''; renderAll(); $('#newP').focus();
}
$('#addP').addEventListener('click', addPerson);
$('#newP').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
$('#items').addEventListener('input', e => {
  const box = e.target.closest('.item'); if (!box) return;
  const it = S.items.find(x => x.id === box.dataset.iid);
  if (e.target.dataset.k) it[e.target.dataset.k] = e.target.value;
  if (e.target.dataset.who) it.who = $$(`[data-iid="${it.id}"] [data-who]`).filter(c => c.checked).map(c => c.dataset.who);
  multi();
});
$('#items').addEventListener('change', e => { if (e.target.dataset.k === 'payer') { const it = S.items.find(x => x.id === e.target.closest('.item').dataset.iid); it.payer = e.target.value; multi(); } });
$('#items').addEventListener('click', e => {
  const id = e.target.dataset.deli; if (!id) return;
  if (S.items.length <= 1) { toast('내역이 하나는 있어야 합니다'); return; }
  S.items = S.items.filter(i => i.id !== id); renderAll();
});
$('#addItem').addEventListener('click', () => {
  S.items.push({ id: newId(), name: (S.items.length + 1) + '차', amt: '', payer: S.people[0].id, who: S.people.map(p => p.id) });
  renderItems(); multi(); $$('#items .item').pop().querySelector('[data-k=amt]').focus();
});
$('#acct').addEventListener('input', () => { S.acct = $('#acct').value; multi(); });
$('#mCopy').addEventListener('click', () => copy(multi.text));
armReset($('#mReset'), () => { S = fresh(); history.replaceState(null, '', location.pathname); $('#sharedNote').classList.add('hidden'); renderAll(); });

// 정산 링크: 상태를 주소 # 뒤에 담음 (서버 전송 없음)
const enc = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
$('#mLink').addEventListener('click', () => {
  const short = { p: S.people.map(p => [p.id, p.name]), i: S.items.map(it => [it.name, +it.amt || 0, it.payer, it.who]), a: S.acct };
  copy(location.origin + location.pathname + '#s=' + enc(short));
});
function fromHash(){
  const m = location.hash.match(/#s=([\w-]+)/); if (!m) return null;
  try {
    const o = dec(m[1]);
    return { people: o.p.map(([id, name]) => ({ id, name })), items: o.i.map(([name, amt, payer, who]) => ({ id: newId(), name, amt: amt || '', payer, who })), acct: o.a || '' };
  } catch (_) { return null; }
}

/* ---------- 시작 ---------- */
bindTabs();
$('#modeTabs').onTab = t => store.set(KEY + '_tab', t);
['sTotal', 'sN'].forEach(id => $('#' + id).addEventListener('input', simple));
$$('input[name=unit], input[name=round]').forEach(r => r.addEventListener('change', simple));
$('#sCopy').addEventListener('click', () => copy(simple.text));

const ss = store.get(KEY + '_s');
if (ss) { $('#sTotal').value = ss.T || ''; $('#sN').value = ss.n || ''; $$('input[name=unit]').forEach(r => r.checked = +r.value === ss.u); $$('input[name=round]').forEach(r => r.checked = r.value === ss.r); }
simple();

const shared = fromHash();
S = shared || store.get(KEY) || fresh();
renderAll();
const tab = shared ? 'multi' : store.get(KEY + '_tab');
if (shared) $('#sharedNote').classList.remove('hidden');
if (tab === 'multi') $('#modeTabs [data-tab=multi]').click();
