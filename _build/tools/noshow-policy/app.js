const KEY = 'ilsang_noshow_v1';
// 위약금 상한은 RULES.noshow(소비자분쟁해결기준)에서 읽음
const NS = () => ruleAt(RULES.noshow);
const BIZ = {
  general: { get cap(){ return NS().general; }, food:true, get hint(){ return `일반음식점은 노쇼 위약금이 총 이용금액의 ${NS().general}% 이하일 때 분쟁 조정에서 인정됩니다.`; }, late:'15' },
  reserve: { get cap(){ return NS().reserve; }, food:true, get hint(){ return `예약에 맞춰 재료를 미리 준비하는 예약기반음식점은 ${NS().reserve}% 이하까지 인정됩니다. 단, 예약기반음식점이라는 점과 위약금 기준을 미리 알려야 합니다.`; }, late:'15' },
  group:   { get cap(){ return NS().group; }, food:true, get hint(){ return `일반음식점도 대량 주문·단체 예약은 미리 알린 경우 ${NS().group}% 이하 기준을 쓸 수 있습니다.`; }, late:'20' },
  beauty:  { cap:0, food:false, hint:'미용·서비스업은 별도 상한이 없지만, 예약금이 과도하면 분쟁에서 불리합니다. 서비스 금액의 일부 수준으로 정하고 미리 알리세요.', late:'10' },
  studio:  { cap:0, food:false, hint:'공방·클래스는 재료 준비 비용을 근거로 예약금을 정하고, 취소 기한을 넉넉히 두면 분쟁이 줄어듭니다.', late:'10' }
};
const fields = () => $$('#f input, #f select');
function save(){ const s = {}; fields().forEach(el => { if (el.type === 'radio') { if (el.checked) s['r_'+el.name] = el.value; } else s[el.id] = el.type === 'checkbox' ? el.checked : el.value; }); store.set(KEY, s); }
function load(){ const s = store.get(KEY); if (!s) return; fields().forEach(el => { if (el.type === 'radio') { if (s['r_'+el.name]) el.checked = s['r_'+el.name] === el.value; } else if (el.id in s) { if (el.type === 'checkbox') el.checked = s[el.id]; else el.value = s[el.id]; } }); }

function d1Text(n){ return n === 1 ? '이용 전날까지' : `이용 ${n}일 전까지`; }
function h2Text(h){ return `이용 ${h}시간 전까지`; }

function build(){
  const biz = radio('biz'), B = BIZ[biz], dep = radio('dep');
  $('#bizHint').textContent = B.hint;
  $('#depRow').classList.toggle('hidden', dep === 'none');
  $('#depLbl').textContent = dep === 'person' ? '1인 예약금' : '예약 1건당 예약금';
  $('#priceLbl').textContent = dep === 'person' ? '1인 예상 이용금액' : '예약 1건 예상 이용금액';
  $('#midRow').classList.toggle('hidden', !$('#mid').checked);

  const shop = val('shop') || '○○○';
  const amt = +val('depAmt') || 0, price = +val('price') || 0;
  const unit = dep === 'person' ? '1인 ' : '';
  const d1 = +$('#d1').value, h2 = +$('#h2').value, p2 = +$('#p2').value, late = $('#late').value;
  const mid = $('#mid').checked && dep !== 'none';

  // 상한 검토
  let cap = '';
  if (dep !== 'none' && amt && price) {
    const r = amt / price * 100;
    if (B.food) {
      cap = r > B.cap
        ? `<div class="warn-line">예약금이 이용금액의 ${r.toFixed(0)}%입니다. 이 업종의 노쇼 위약금 기준(${B.cap}% 이하)을 넘어 분쟁 시 차액을 돌려줘야 할 수 있습니다. ${won(price*B.cap/100)} 이하로 낮추는 것을 권합니다.</div>`
        : `<div class="notice ok" style="margin:10px 0 0">이용금액의 ${r.toFixed(0)}% — 기준(${B.cap}% 이하) 안입니다.</div>`;
    } else cap = `<p class="hint" style="margin:8px 0 0">이용금액의 ${r.toFixed(0)}%입니다.</p>`;
  }
  $('#capBox').innerHTML = cap;

  const rules = [];
  if (dep === 'none') {
    rules.push(`${d1Text(d1)} 취소·변경 연락을 부탁드립니다.`);
    rules.push(`연락 없이 예약 시간에서 ${late}분이 지나면 예약이 자동 취소됩니다.`);
  } else {
    rules.push(`${d1Text(d1)} 취소: 예약금 전액 환불`);
    if (mid) rules.push(`${h2Text(h2)} 취소: 예약금 ${p2}% 환불`);
    rules.push(`그 이후 취소·노쇼: 예약금 환불 불가`);
    rules.push(`연락 없이 ${late}분 이상 늦으시면 노쇼로 처리됩니다.`);
  }
  if ($('#change').checked) rules.push(`${d1Text(d1)}는 날짜·시간 변경 1회 무료`);
  const shopCancel = '매장 사정으로 예약을 취소하게 되면 예약금은 전액 돌려드립니다.';
  const depLine = dep === 'none' ? '' : `· 예약금: ${unit}${won(amt)}${val('account') ? ` (${val('account')})` : ''}\n`;
  const typeLine = biz === 'reserve' ? '저희 매장은 예약 인원에 맞춰 당일 재료를 준비하는 예약제 매장입니다.\n'
                 : biz === 'group' ? '단체 예약·대량 주문은 예약에 맞춰 재료를 미리 준비합니다.\n' : '';

  const sms =
`[${shop}] 예약 확정 안내
○○○님, 예약이 확정되었습니다.
· 일시: ○월 ○일(○) ○시 ○분
· 인원: ○명
${depLine}
${typeLine}[취소·환불 기준]
${rules.map(r => '· ' + r).join('\n')}

${shopCancel}${val('contact') ? `\n취소·변경 문의: ${val('contact')}` : ''}
감사합니다.`;

  const notice =
`[${shop} 예약 안내]

${typeLine ? typeLine + '\n' : ''}${dep === 'none' ? '' : `■ 예약금\n- ${unit}${won(amt)}을 예약 시 받습니다.${val('account') ? `\n- 결제 방법: ${val('account')}` : ''}\n- 예약금은 이용 당일 결제 금액에서 차감됩니다.\n\n`}■ 취소·환불 기준
${rules.map(r => '- ' + r).join('\n')}

■ 매장 사정으로 취소할 때
- ${shopCancel}

노쇼는 미리 준비한 재료와 다른 손님의 예약 기회를 함께 잃게 합니다. 일정이 바뀌면 꼭 미리 연락 부탁드립니다.${val('contact') ? `\n문의: ${val('contact')}` : ''}`;

  const short = dep === 'none'
    ? `${d1Text(d1)} 취소·변경 연락 부탁드립니다. 연락 없이 ${late}분 지나면 자동 취소됩니다.`
    : `예약금 ${unit}${won(amt)}. ${d1Text(d1)} 취소 시 전액 환불${mid ? `, ${h2Text(h2)} ${p2}% 환불` : ''}, 이후 취소·노쇼는 환불 불가. 연락 없이 ${late}분 이상 늦으면 노쇼 처리됩니다.`;

  $('#smsOut').textContent = sms;
  $('#noticeOut').textContent = notice;
  $('#shortOut').textContent = short;
  build.out = { sms, notice, short };
  save();
}

bindTabs();
let cur = 'sms';
$('.tabs').onTab = t => cur = t;
$$('input[name=biz]').forEach(r => r.addEventListener('change', () => { $('#late').value = BIZ[radio('biz')].late; }));
$('#f').addEventListener('input', build);
$('#f').addEventListener('change', build);
$('#copyBtn').addEventListener('click', () => copy(build.out[cur]));
armReset($('#resetBtn'), () => { store.del(KEY); $('#f').reset(); build(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
load(); build();
onRulesLoaded(build);
