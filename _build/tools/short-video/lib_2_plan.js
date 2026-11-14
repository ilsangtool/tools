/* ===== 내용 분석·질문·구성안 (규칙 기반, AI 없음) ===== */
const TYPES = {
  promo:   { name: '가게·상품 홍보', fields: [['name', '가게 이름', '예: 온기베이커리'], ['item', '알릴 상품·서비스', '예: 밤 크림빵'], ['price', '가격', '예: 3,500원'], ['date', '시작일·기간', '예: 12월 1일부터'], ['hours', '영업 시간', '예: 매일 오전 8시 ~ 오후 9시'], ['place', '위치', '예: 구리역 2번 출구 걸어서 5분'], ['contact', '연락처', '예: 031-000-0000']], must: ['name', 'item'] },
  event:   { name: '행사 안내', fields: [['name', '행사 이름', '예: 구리 겨울 나눔장터'], ['date', '날짜', '예: 12월 20일(토)'], ['hours', '시간', '예: 오전 10시 ~ 오후 4시'], ['place', '장소', '예: 구리시청 앞 광장'], ['target', '대상', '예: 구리 시민 누구나'], ['apply', '신청 방법', '예: 현장 접수'], ['contact', '문의', '예: 031-000-0000']], must: ['name', 'date', 'place'] },
  recruit: { name: '모집 공고', fields: [['name', '모집 이름', '예: 의용소방대원 모집'], ['target', '모집 대상·인원', '예: 구리시 거주 성인 00명'], ['date', '모집 기간', '예: 12월 1일 ~ 12월 15일'], ['apply', '지원 방법', '예: 누리집 신청서 제출'], ['contact', '문의', '예: 031-000-0000']], must: ['name', 'target', 'date', 'apply'] },
  org:     { name: '기관 홍보', fields: [['name', '기관 이름', '예: 구리소방서'], ['item', '알릴 내용', '예: 겨울철 화재예방'], ['target', '대상', '예: 시민 여러분'], ['contact', '문의·누리집', '예: 031-000-0000']], must: ['name', 'item'] },
  free:    { name: '직접 구성', fields: [['name', '마지막 장면에 넣을 이름', '예: 온기베이커리 (비워도 됨)']], must: [] }
};
const LABEL = { price: '가격', date: '날짜', hours: '시간', place: '위치', contact: '문의', target: '대상', apply: '신청' };
const LABEL_BY_TYPE = { recruit: { date: '기간', apply: '지원', target: '대상' }, event: { place: '장소', date: '일시' } };

/* 입력 글에서 항목 뽑기 */
function extractFields(type, text){
  const t = ' ' + text.replace(/\s+/g, ' ') + ' ', f = {};
  const won = t.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*원/); if (won) f.price = Number(won[1].replace(/,/g, '')).toLocaleString('ko-KR') + '원';
  const date = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*\([월화수목금토일]\))?(?:\s*(?:~|-|–|부터|에서)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일(?:\s*까지)?)?/);
  if (date) {
    const after = !date[4] && /^\s*부터/.test(t.slice(date.index + date[0].length));
    f.date = date[0].trim().replace(/\s*(부터|에서)\s*(?=\d)/, ' ~ ').replace(/\s*[-–]\s*/, ' ~ ').replace(/\s*(까지|부터)$/, '') + (after || /부터$/.test(date[0].trim()) ? '부터' : '');
  }
  const hm = t.match(/(?:(오전|오후)\s*)?(\d{1,2})\s*(?:시|:(\d{2}))(?:\s*(\d{1,2})\s*분)?\s*(?:~|-|–|부터)\s*(?:(오전|오후)\s*)?(\d{1,2})\s*(?:시|:(\d{2}))/);
  if (hm) f.hours = hm[0].trim().replace(/\s*(~|-|–|부터)\s*/, ' ~ ');
  const ph = t.match(/0\d{1,2}-?\d{3,4}-?\d{4}/); if (ph) f.contact = ph[0];
  const st = t.match(/[가-힣A-Za-z0-9]+역(?:\s*\d+번\s*출구)?(?:\s*(?:에서)?\s*(?:걸어서|도보)\s*\d+\s*분)?/);
  const ad = t.match(/[가-힣]+[시군구]\s*[가-힣0-9]+(?:로|길|동)\s*[\d\-]+(?:번지)?/);
  if (st) f.place = st[0].trim(); else if (ad) f.place = ad[0].trim();
  const nm = t.match(/([가-힣A-Za-z0-9]+(?:베이커리|카페|커피|식당|분식|치킨|피자|빵집|떡집|공방|마트|상회|약국|병원|의원|학원|센터|미용실|헤어|네일|스튜디오|소방서|구청|시청|주민센터|도서관|교회|협회|복지관|체육관|학교|어린이집))/);
  if (nm) f.name = nm[1];
  if (type === 'promo') {
    const it = t.match(/(?:신메뉴|신상품|새 메뉴|새 상품)\s*([가-힣A-Za-z0-9 ]{1,12}?)\s*(?:출시|판매|오픈|나왔)/) || t.match(/([가-힣A-Za-z0-9]{2,10})\s*(?:출시|판매 시작|오픈|할인)/);
    if (it) f.item = it[1].trim();
  }
  if (type === 'event') { const ev = t.match(/([가-힣A-Za-z0-9 ]{2,16}?(?:축제|장터|행사|박람회|설명회|교육|체험|대회|공연|캠페인))/); if (ev) f.name = f.name || ev[1].trim(); }
  if (type === 'recruit') { const rc = t.match(/([가-힣A-Za-z0-9 ]{2,16}?모집)/); if (rc) f.name = rc[1].trim(); const tg = t.match(/(\d+\s*명)/); if (tg) f.target = tg[1]; }
  return f;
}
/* 특징 문장: 항목으로 쓰인 숫자·연락처가 없는 문장 */
function featureLines(text, fields){
  const used = Object.values(fields).filter(Boolean);
  return text.split(/(?<=[.!?。])\s+|\n+/).map(s => s.replace(/[.。]+$/, '').trim()).filter(s => s.length >= 4)
    .filter(s => !used.some(u => u.length >= 3 && s.includes(u)) && !/\d{1,2}\s*월\s*\d|\d+\s*원|0\d{1,2}-\d|\d+\s*시/.test(s))
    .map(s => s.replace(/(넣음|만듦|함|임)$/, m => ({ '넣음': '넣었습니다', '만듦': '만들었습니다', '함': '합니다', '임': '입니다' }[m])))
    .slice(0, 4);
}

/* 문구 묶음: 종류 × 분위기. 사용자가 '다른 문구'로 바꾸고 직접 고칠 수 있음 */
const PHRASES = {
  promo: { hook: { bright: ['{item}, 새로 나왔어요', '이번엔 {item}입니다', '{item} 드디어 나왔습니다'], calm: ['{item}을(를) 소개합니다', '오래 준비한 {item}', '{name}의 새 메뉴'], strong: ['{item}, 지금부터 팝니다', '{item} 출시', '딱 하나만 고르라면 {item}'] },
           end:  { bright: ['들러 주세요', '기다리고 있을게요'], calm: ['편하게 들러 주세요', '천천히 오셔도 됩니다'], strong: ['지금 바로 오세요', '놓치지 마세요'] } },
  event: { hook: { bright: ['{name}에 초대합니다', '함께해요, {name}'], calm: ['{name}을(를) 안내합니다', '{name} 소식'], strong: ['{name} 열립니다', '이번 주말, {name}'] },
           end:  { bright: ['그날 만나요', '많이 와 주세요'], calm: ['많은 참여 바랍니다', '자세한 내용은 문의해 주세요'], strong: ['지금 일정에 넣어 두세요', '자리가 한정돼 있습니다'] } },
  recruit:{ hook: { bright: ['같이 할 분을 찾습니다', '{name}'], calm: ['{name} 안내', '{name}을(를) 알립니다'], strong: ['{name}', '지금 지원하세요'] },
           end:  { bright: ['기다리겠습니다', '함께해요'], calm: ['많은 지원 바랍니다', '문의는 아래로 해 주세요'], strong: ['마감 전에 지원하세요', '지금 신청하세요'] } },
  org:   { hook: { bright: ['{name}이(가) 알려 드려요', '{item}, 같이 지켜요'], calm: ['{name}에서 알려 드립니다', '{item} 안내'], strong: ['{item}, 꼭 확인하세요', '{name} 알림'] },
           end:  { bright: ['함께 지켜 주세요', '고맙습니다'], calm: ['{name}', '시민 여러분의 협조 부탁드립니다'], strong: ['지금 확인하세요', '꼭 지켜 주세요'] } },
  free:  { hook: { bright: [''], calm: [''], strong: [''] }, end: { bright: [''], calm: [''], strong: [''] } }
};
// 받침에 맞춰 조사 고르기: 을(를), 이(가), 은(는)
function josa(s){
  return s.replace(/([가-힣A-Za-z0-9])(을\(를\)|이\(가\)|은\(는\)|와\(과\))/g, (m, ch, j) => {
    const code = ch.charCodeAt(0), has = code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 !== 0 : /[0136781lmnr]$/i.test(ch);
    const pair = { '을(를)': ['을', '를'], '이(가)': ['이', '가'], '은(는)': ['은', '는'], '와(과)': ['과', '와'] }[j];
    return ch + (has ? pair[0] : pair[1]);
  });
}
function fillPhrase(p, f){ return josa(p.replace(/\{(\w+)\}/g, (_, k) => f[k] || '')).replace(/\s+/g, ' ').trim(); }

/* 항목 → 정보 그림 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function visualFor(key, val, f){
  if (!val) return null;
  if (key === 'price') return { g: 'price', text: val };
  if (key === 'date') { const m = val.match(/(\d{1,2})\s*월\s*(\d{1,2})/); if (m) { const now = new Date(); let y = now.getFullYear(); const d = new Date(y, m[1] - 1, m[2]); if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60)) d.setFullYear(y + 1); return { g: 'calendar', month: +m[1], day: +m[2], week: WEEK[d.getDay()] + '요일' }; } return { g: 'poster', text: val }; }
  if (key === 'hours') { const m = val.match(/(오전|오후)?\s*(\d{1,2})(?:\s*시|:(\d{2}))/); let h = m ? +m[2] : 9; if (m && m[1] === '오후' && h < 12) h += 12; return { g: 'clock', h, m: m && m[3] ? +m[3] : 0, label: val.replace(/매일\s*/, '매일 ') }; }
  if (key === 'place') return { g: 'pin', label: val.length > 14 ? val.split(/\s+(?=걸어서|도보)/)[0] : val };
  if (key === 'contact') return { g: 'phone', label: val };
  if (key === 'target') { const n = (val.match(/(\d+)\s*명/) || [])[1]; return { g: 'people', n: n ? Math.min(5, Math.max(3, Math.round(Math.log2(+n) + 1))) : 3, label: val.length > 16 ? '' : val }; }
  if (key === 'apply') return { g: 'form', label: val.length > 16 ? '' : val };
  return { g: 'poster', text: val };
}

/* 문장에서 그림에 쓸 낱말: 동사·부사를 빼고 앞쪽 명사 두 개 */
const STOP = new Set(['직접', '매일', '아주', '정말', '가장', '모두', '함께', '바로', '항상', '새로', '많이', '조금', '더', '또', '그리고', '지금', '오늘', '이번', '올해']);
function keywordOf(t, fallback){
  const ws = t.split(/\s+/).map(w => w.replace(/[^가-힣A-Za-z0-9]/g, ''))
    .filter(w => !/(서|고|며|면|어|아|여|게|지|다|요|니다|습니다|었|았|했|한|할|된|될|던|는데|도록)$/.test(w))
    .map(w => w.replace(/(에서|으로|부터|까지|마다|처럼|보다|을|를|이|가|은|는|의|에|로|와|과|도|만)$/, ''))
    .filter(w => w.length >= 1 && !STOP.has(w));
  const k = ws.slice(0, 2).join(' ');
  return k.replace(/\s/g, '').length >= 2 ? k : (fallback || t.slice(0, 6));
}
/* 장면 하나 */
const S = (lines, extra) => Object.assign({ d: 0, kind: 'text', lines: lines.filter(l => l && l.t), visual: null }, extra || {});
const T = (t, role) => ({ t, role: role || 'main' });

/* 구성안 만들기. f: 항목, feats: 특징 문장, media: 사진·영상 수, ph: 고른 문구 번호 */
function buildPlans(type, f, feats, nMedia, mood, ph){
  const lab = k => (LABEL_BY_TYPE[type] || {})[k] || LABEL[k];
  const P = PHRASES[type], pick = (arr, i) => arr[(i || 0) % arr.length];
  const hook = fillPhrase(pick(P.hook[mood], ph.hook), f), end = fillPhrase(pick(P.end[mood], ph.end), f);
  const subject = f.item || f.name || '';
  let mi = 0; const nextMedia = () => (mi < nMedia ? { media: mi++ } : null);
  const vis = (fallback) => nextMedia() || fallback;
  const infoKeys = TYPES[type].fields.map(x => x[0]).filter(k => !['name', 'item'].includes(k) && f[k]);

  if (type === 'free') {
    const lines = feats.length ? feats : [];
    const mk = (align) => { mi = 0; const sc = lines.map(t => S([T(t)], { visual: vis({ g: 'poster', text: t.split(' ').slice(0, 2).join(' ') }), align })); if (f.name) sc.push(S([T(f.name)], { kind: 'end', align })); return sc; };
    return { A: mk(), B: mk(), C: mk('center') };
  }
  // A 첫마디형: 질문·짧은 문구로 시작 → 하나씩 빠르게
  mi = 0;
  const A = [S([T(hook)], { kind: 'text' })];
  if (subject) A.push(S([T(subject, 'accent'), T(f.name && f.item ? f.name : '', 'sub')], { visual: vis({ g: 'poster', text: subject }) }));
  feats.slice(0, 2).forEach(t => A.push(S([T(t)], { visual: vis({ g: 'poster', text: keywordOf(t, subject) }) })));
  infoKeys.forEach(k => {
    if (k === 'price') A.push(S([T(lab(k), 'sub'), T(f[k], 'accent')], { kind: 'big', visual: vis(visualFor(k, f[k], f)) }));
    else { const v = visualFor(k, f[k], f); if (v && v.label) v.label = ''; A.push(S([T(f[k])], { visual: vis(v) })); }
  });
  A.push(S([T(end), T(f.name || '', 'accent')], { kind: 'end' }));

  // B 정보형: 제목 → 특징 → 정보 한 장 → 마무리
  mi = 0;
  const B = [S([T(type === 'promo' ? '새 소식' : TYPES[type].name, 'label'), T(subject), T(f.name && f.item ? f.name : '', 'sub')], { visual: vis({ g: 'poster', text: subject }) })];
  if (feats[0]) B.push(S([T(feats[0])], { visual: vis({ g: 'poster', text: keywordOf(feats[0], subject) }) }));
  if (infoKeys.length) B.push(S([], { kind: 'list', rows: infoKeys.filter(k => k !== 'contact').map(k => [lab(k), f[k]]) }));
  if (f.contact) B.push(S([T('문의', 'sub'), T(f.contact, 'accent')], { visual: vis(visualFor('contact', f.contact, f)) }));
  B.push(S([T(f.name || subject), T(end, 'sub')], { kind: 'end' }));
  if (B[2] && B[2].kind === 'list' && !B[2].rows.length) B.splice(2, 1);

  // C 이야기형: 느린 호흡, 가운데 정렬, 그림 크게
  mi = 0;
  const C = [];
  (feats.length ? feats.slice(0, 3) : [hook]).forEach(t => C.push(S([T(t, 'sub')], { visual: vis({ g: 'poster', text: feats.length ? keywordOf(t, subject) : subject }), align: 'center' })));
  if (subject) C.push(S([T(subject, 'accent'), T([f.date, f.price].filter(Boolean).join(' · '), 'sub')], { visual: vis(f.price ? visualFor('price', f.price, f) : visualFor('date', f.date, f)), align: 'center' }));
  if (f.place) C.push(S([T(f.place, 'sub')], { visual: vis(visualFor('place', f.place, f)), align: 'center' }));
  C.push(S([T(f.name || subject), T(f.hours || end, 'sub')], { kind: 'end', align: 'center' }));
  return { A, B, C };
}

/* 장면 길이를 목표 길이에 맞춤: 글자 수만큼 읽을 시간 + 분위기 */
function fitDurations(scenes, target, mood, plan){
  const tempo = { bright: 1, calm: 1.15, strong: 0.88 }[mood] * (plan === 'C' ? 1.2 : 1);
  scenes.forEach(s => {
    const chars = s.kind === 'list' ? s.rows.reduce((a, r) => a + r[0].length + r[1].length, 0) : s.lines.reduce((a, l) => a + l.t.length, 0);
    s.d = (2.2 + chars * 0.11 + (s.kind === 'list' ? s.rows.length * 0.6 : 0)) * tempo;
  });
  const sum = totalOf(scenes);
  const k = target / sum;
  scenes.forEach(s => s.d = Math.max(2, Math.min(s.kind === 'list' ? 16 : 10, s.d * k)));
  // 반올림 후 남는 시간은 마지막 장면에서 조정
  scenes.forEach(s => s.d = Math.round(s.d * 2) / 2);
  const diff = target - totalOf(scenes);
  let i = scenes.length - 1;
  if (Math.abs(diff) > 0.01) { scenes[i].d = Math.max(2, scenes[i].d + diff); }
  // 장면이 적어 목표 길이에 못 미치면 모든 장면을 고르게 늘림(최대 10초)
  const left = target - totalOf(scenes);
  if (left > 0.5) { const add = left / scenes.length; scenes.forEach(s => s.d = Math.min(12, s.d + add)); }
  return scenes;
}
