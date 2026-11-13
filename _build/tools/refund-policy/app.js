const KEY = 'ilsang_refund_v1';
const EC = () => ruleAt(RULES.ecommerce); // 전자상거래법 청약철회 기준
// ok: 온라인 청약철회 제한 사유로 인정되는지 (전자상거래법 제17조 제2항)
const EX = [
  { id:'used',   t:'착용·사용·세탁·수선 등으로 상품 가치가 크게 줄어든 경우', ok:true },
  { id:'tag',    t:'상품 택(라벨)을 떼거나 훼손해 다시 판매하기 어려운 경우', ok:true },
  { id:'lost',   t:'고객 책임으로 상품이 분실·훼손된 경우 (내용 확인을 위한 포장 개봉은 제외)', ok:true },
  { id:'time',   t:'시간이 지나 다시 판매하기 어려울 만큼 가치가 줄어든 경우 (신선·냉장 식품 등)', ok:true },
  { id:'copy',   t:'복제할 수 있는 상품(도서·음반·소프트웨어 등)의 포장을 훼손한 경우', ok:true },
  { id:'custom', t:'고객 요청에 따라 개별 주문 제작한 상품 (주문 전 별도 안내하고 동의를 받은 경우)', ok:true },
  { id:'sale',   t:'할인·세일 상품', ok:false, why:'할인 상품은 법정 제한 사유가 아닙니다' },
  { id:'open',   t:'포장(박스)을 뜯은 경우', ok:false, why:'단순 포장 개봉만으로는 반품을 거절할 수 없습니다' },
  { id:'nopaper',t:'영수증이 없는 경우', ok:false, why:'온라인은 주문 내역으로 확인합니다' }
];
const PRESET = {
  cloth:['used','tag','lost'], food:['time','lost'], beauty:['used','lost'], elec:['used','lost'],
  book:['copy','lost'], custom:['custom','used','lost'], etc:['used','lost']
};

$('#exList').innerHTML = EX.map(e =>
  `<label class="chk exi${e.ok ? '' : ' illegal'}"><input type="checkbox" data-ex="${e.id}"><span>${e.t}${e.ok ? '' : ' <b>매장 구매만</b>'}</span></label>`).join('');

function applyPreset(){
  const p = PRESET[$('#cat').value] || [];
  $$('[data-ex]').forEach(c => c.checked = p.includes(c.dataset.ex));
}

function state(){
  const s = {};
  $$('#f input, #f select, #f textarea').forEach(el => {
    if (el.type === 'radio') { if (el.checked) s['r_'+el.name] = el.value; }
    else if (el.type === 'checkbox') s[el.id || 'x_'+el.dataset.ex] = el.checked;
    else s[el.id] = el.value;
  });
  return s;
}
function restore(s){
  if (!s) return false;
  $$('#f input, #f select, #f textarea').forEach(el => {
    if (el.type === 'radio') { if (s['r_'+el.name] !== undefined) el.checked = s['r_'+el.name] === el.value; }
    else if (el.type === 'checkbox') { const k = el.id || 'x_'+el.dataset.ex; if (k in s) el.checked = s[k]; }
    else if (el.id in s) el.value = s[el.id];
  });
  return true;
}

function build(){
  const ch = radio('ch'), on = ch !== 'offline', off = ch !== 'online';
  $('#onlineBox').classList.toggle('hidden', !on);
  $('#offlineBox').classList.toggle('hidden', !off);
  const offMode = radio('off');
  $('#offDaysRow').classList.toggle('hidden', offMode === 'none');

  const shop = val('shop') || '저희 매장';
  const E = EC(), minD = E.withdrawDays;
  $('#days').min = minD;
  $('#daysWarn').textContent = `법정 기간은 최소 ${minD}일입니다. ${minD}일보다 짧게 적으면 효력이 없어 ${minD}일로 바꿔 넣습니다.`;
  let days = parseInt(val('days'), 10) || minD;
  $('#daysWarn').classList.toggle('hidden', !(on && days < minD));
  if (days < minD) days = minD;
  const s1 = parseInt(val('ship1'), 10) || 0, s2 = parseInt(val('ship2'), 10) || 0;
  const checked = $$('[data-ex]').filter(c => c.checked).map(c => EX.find(e => e.id === c.dataset.ex));
  const legal = checked.filter(e => e.ok), illegal = checked.filter(e => !e.ok);

  const sec = []; // [제목, [항목...]]
  if (on) {
    const a = [];
    a.push(`${ch === 'both' ? '온라인 주문은 ' : ''}상품을 받은 날부터 ${days}일 이내에 교환·반품을 신청할 수 있습니다.`);
    a.push(`상품이 표시·광고 내용과 다르거나 주문 내용과 다르게 배송된 경우에는 받은 날부터 ${E.mismatchMonths}개월 이내, 그 사실을 안 날(알 수 있었던 날)부터 ${E.mismatchKnownDays}일 이내에 신청할 수 있습니다.`);
    if (val('how')) a.push('신청 방법: ' + val('how'));
    sec.push([ch === 'both' ? '온라인 주문 교환·반품 기간' : '교환·반품 신청 기간', a]);

    const b = [];
    if (s1 || s2) {
      let t = '단순 변심: 고객 부담';
      const parts = [];
      if (s1) parts.push(`반품 ${won(s1)}` + ($('#freeShip').checked ? ` (무료배송 상품은 왕복 ${won(s1*2)})` : ''));
      if (s2) parts.push(`교환 왕복 ${won(s2)}`);
      b.push(t + ' — ' + parts.join(', '));
    } else b.push('단순 변심: 반품·교환 배송비는 고객 부담입니다.');
    b.push('상품 불량·오배송 등 판매자 사유: 배송비 전액 판매자 부담');
    sec.push(['교환·반품 배송비', b]);
  }
  if (off) {
    const c = [];
    const pre = ch === 'both' ? '매장에서 구매한 상품은 ' : '';
    const od = parseInt(val('offDays'), 10) || 7;
    const rc = $('#receipt').checked ? '영수증(카드 결제 시 결제 카드)을 지참하시면 ' : '';
    if (offMode === 'both') c.push(`${pre}구매일부터 ${od}일 이내에 ${rc}교환·환불해 드립니다.`);
    else if (offMode === 'exch') c.push(`${pre}구매일부터 ${od}일 이내에 ${rc}교환해 드립니다. 단순 변심 환불은 어렵습니다.`);
    else c.push(`${pre}단순 변심에 의한 교환·환불은 어렵습니다. 구매 전 꼭 확인해 주세요.`);
    c.push('상품에 하자가 있는 경우에는 구매 기간과 관계없이 교환 또는 환불해 드립니다.');
    sec.push([ch === 'both' ? '매장 구매 교환·환불' : '교환·환불 기준', c]);
  }

  const ex = [];
  legal.forEach(e => ex.push(e.t));
  if (off) illegal.forEach(e => ex.push(e.t + (on ? ' (매장 구매 상품에 한함)' : '')));
  if (ex.length) sec.push(['교환·반품이 어려운 경우', ex]);

  const r = [];
  if (on) {
    r.push(`${ch === 'both' ? '온라인 주문은 ' : ''}반품 상품이 도착한 날부터 ${E.refundBizDays}영업일 이내에 환불해 드립니다.`);
    r.push('카드 결제는 카드사 사정에 따라 취소 반영까지 며칠 더 걸릴 수 있습니다.');
  }
  if (off) r.push(`${ch === 'both' ? '매장 구매는 ' : ''}결제하신 수단 그대로 환불해 드립니다. (카드 결제는 카드 승인 취소)`);
  sec.push(['환불', r]);

  if (val('extra')) sec.push(['추가 안내', val('extra').split('\n').filter(Boolean)]);
  if (val('contact')) sec.push(['문의', [val('contact')]]);

  // 법 위반 문구 경고
  const lw = $('#legalWarn');
  if (on && illegal.length) {
    lw.innerHTML = `<div class="notice">온라인 안내문에서 뺀 항목: ${illegal.map(e => `<b>${e.t}</b>(${e.why})`).join(', ')}${off ? '. 매장 구매 상품에만 적용되도록 표시했습니다.' : '.'}</div>`;
  } else lw.innerHTML = '';

  const title = `${shop} 교환·환불 안내`;
  const text = `[${title}]\n\n` + sec.map(([h, items]) => `■ ${h}\n` + items.map(i => '- ' + i).join('\n')).join('\n\n');
  const inner = `<div class="ttl">${esc(title)}</div>` + sec.map(([h, items]) => `<h3>${esc(h)}</h3><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('');
  $('#preview').innerHTML = `<div class="pol">${inner}</div>`;
  const htmlCode =
`<div style="border:1px solid #ddd;border-radius:8px;padding:16px 18px;font-size:14px;line-height:1.7;color:#222;max-width:860px">
<div style="font-size:17px;font-weight:700;margin-bottom:6px">${esc(title)}</div>
${sec.map(([h, items]) => `<div style="font-weight:700;margin-top:12px">${esc(h)}</div>\n<ul style="margin:4px 0;padding-left:20px">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('\n')}
</div>`;
  $('#htmlOut').textContent = htmlCode;
  $('#textOut').textContent = text;
  build.last = { text, html: htmlCode, inner };
  store.set(KEY, state());
}

bindTabs();
$('#cat').addEventListener('change', () => { applyPreset(); build(); });
$('#f').addEventListener('input', build);
$('#f').addEventListener('change', build);
$('#copyText').addEventListener('click', () => copy(build.last.text));
$('#copyHtml').addEventListener('click', () => copy(build.last.html));
$('#printBtn').addEventListener('click', () => {
  let w = $('#printWrap'); if (!w) { w = document.createElement('div'); w.id = 'printWrap'; document.body.appendChild(w); }
  w.innerHTML = `<div class="pol">${build.last.inner}</div>`;
  window.print();
});
armReset($('#resetBtn'), () => { store.del(KEY); $('#f').reset(); applyPreset(); build(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

if (!restore(store.get(KEY))) applyPreset();
build();
onRulesLoaded(build);
