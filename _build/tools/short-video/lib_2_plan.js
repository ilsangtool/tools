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
  const vn = t.match(/(?<![가-힣0-9])[가-힣]{2,}(?:\s[가-힣]+)?\s?(?:앞|옆|뒤|안)?\s?(?:광장|공원|체육관|회관|문화센터|시민회관|운동장|강당|대강당|회의실|도서관|주차장|시장|역 광장)/);
  if (st) f.place = st[0].trim(); else if (ad) f.place = ad[0].trim(); else if (vn && type !== 'promo') f.place = vn[0].trim();
  const nm = t.match(/([가-힣A-Za-z0-9]+(?:베이커리|카페|커피|식당|분식|치킨|피자|빵집|떡집|공방|마트|상회|약국|병원|의원|학원|센터|미용실|헤어|네일|스튜디오|소방서|구청|시청|주민센터|도서관|교회|협회|복지관|체육관|학교|어린이집))/);
  if (nm) f.name = nm[1];
  if (type === 'promo') {
    const it = t.match(/(?:신메뉴|신상품|새 메뉴|새 상품)\s*([가-힣A-Za-z0-9 ]{1,12}?)\s*(?:출시|판매|오픈|나왔)/) || t.match(/([가-힣A-Za-z0-9]{2,10})\s*(?:출시|판매 시작|오픈|할인)/);
    if (it) f.item = it[1].trim();
  }
  if (type === 'event') { const ev = t.match(/((?:[가-힣A-Za-z0-9]+\s){0,3}[가-힣A-Za-z0-9]*(?:축제|장터|행사|박람회|설명회|교육|체험|대회|공연|캠페인|음악회|강연|강좌))/); if (ev) f.name = ev[1].trim(); }
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
const S = (lines, extra) => Object.assign({ d: 0, kind: 'text', lines: lines.filter(l => l && l.t), visual: null, role: 'feat', p: 2 }, extra || {});
const T = (t, role) => ({ t, role: role || 'main' });

/* 구성안 만들기. f: 항목, feats: 특징 문장, media: 사진·영상 수, ph: 고른 문구 번호 */
function buildPlans(type, f, feats, nMedia, mood, ph){
  const out = buildPlansRaw(type, f, feats, nMedia, mood, ph);
  const topic = artTopic([f.item, f.name, feats.join(' '), f.target, f.apply].filter(Boolean).join(' ')) || (type === 'org' ? 'building' : type === 'recruit' ? 'badge' : type === 'event' ? 'market' : null);
  const endT = endTopic(type, topic);
  // 사진이 없는 자리는 주제 그림으로: 첫 장면은 전체, 특징 장면은 가까이(이름표 붙임), 끝 장면은 가게·건물·장터
  Object.values(out).forEach(list => {
    let shot = 1;
    list.forEach(sc => {
      const v = sc.visual;
      if (v && v.g === 'poster' && topic) sc.visual = sc.role === 'subject' ? { g: 'hero', topic, shot: 0 } : { g: 'hero', topic, shot: (shot++ % 2) + 1, chip: String(v.text || '').split(/\s+/).every(w => w.length >= 2) ? v.text : '' };
      else if (!v && sc.role === 'hook') sc.visual = { g: 'hero', topic: topic || endT, shot: 3 };
      else if (!v && sc.role === 'end') sc.visual = { g: 'hero', topic: endT, shot: 0, label: f.name || '' };
    });
  });
  return out;
}
function buildPlansRaw(type, f, feats, nMedia, mood, ph){
  const lab = k => (LABEL_BY_TYPE[type] || {})[k] || LABEL[k];
  const P = PHRASES[type], pick = (arr, i) => arr[(i || 0) % arr.length];
  const hook = fillPhrase(pick(P.hook[mood], ph.hook), f), end = fillPhrase(pick(P.end[mood], ph.end), f);
  const subject = f.item || f.name || '';
  let mi = 0; const nextMedia = () => (mi < nMedia ? { media: mi++ } : null);
  const vis = (fallback) => nextMedia() || fallback;
  const infoKeys = TYPES[type].fields.map(x => x[0]).filter(k => !['name', 'item'].includes(k) && f[k]);

  if (type === 'free') {
    const lines = feats.length ? feats : [];
    const mk = (align) => { mi = 0; const sc = lines.map((t, n) => S([T(t)], { visual: vis({ g: 'poster', text: keywordOf(t, t.slice(0, 6)) }), align, role: n ? 'feat' : 'hook', p: n ? 2 : 1 })); if (f.name) sc.push(S([T(f.name)], { kind: 'end', align, role: 'end', p: 1 })); return sc; };
    return { A: mk(), B: mk(), C: mk('center') };
  }
  // A 첫마디형: 질문·짧은 문구로 시작 → 하나씩 빠르게
  mi = 0;
  const A = [S([T(hook)], { kind: 'text', role: 'hook', p: 1 })];
  if (subject) A.push(S([T(subject, 'accent'), T(f.name && f.item ? f.name : '', 'sub')], { visual: vis({ g: 'poster', text: subject }), role: 'subject', p: 1 }));
  feats.slice(0, 2).forEach((t, n) => A.push(S([T(t)], { visual: vis({ g: 'poster', text: keywordOf(t, subject) }), role: 'feat', p: n ? 3 : 2 })));
  infoKeys.forEach(k => {
    if (k === 'price') A.push(S([T(lab(k), 'sub'), T(f[k], 'accent')], { kind: 'big', visual: vis(visualFor(k, f[k], f)), role: 'info', p: 1 }));
    else { const v = visualFor(k, f[k], f); if (v && v.label) v.label = ''; A.push(S([T(f[k])], { visual: vis(v), role: 'info', p: k === 'contact' || k === 'hours' ? 2 : 1 })); }
  });
  A.push(S([T(end), T(f.name || '', 'accent')], { kind: 'end', role: 'end', p: 1 }));

  // B 정보형: 제목 → 특징 → 정보 한 장 → 마무리
  mi = 0;
  const B = [S([T(type === 'promo' ? '새 소식' : TYPES[type].name, 'label'), T(subject), T(f.name && f.item ? f.name : '', 'sub')], { visual: vis({ g: 'poster', text: subject }), role: 'subject', p: 1 })];
  feats.slice(0, 3).forEach((t, n) => B.push(S([T(t)], { visual: vis({ g: 'poster', text: keywordOf(t, subject) }), role: 'feat', p: n ? 3 : 2 })));
  // 길이가 넉넉할 때만 들어가는 그림 장면 (정보 한 장 앞에 하나씩)
  ['date', 'hours', 'place'].forEach(k => { if (f[k]) { const v = visualFor(k, f[k], f); if (v && v.label) v.label = ''; B.push(S([T(LABEL_BY_TYPE[type] && LABEL_BY_TYPE[type][k] || LABEL[k], 'sub'), T(f[k])], { visual: vis(v), role: 'info', p: 3 })); } });
  if (infoKeys.length) B.push(S([], { kind: 'list', role: 'list', p: 1, rows: infoKeys.filter(k => k !== 'contact').map(k => [lab(k), f[k]]) }));
  if (f.contact) B.push(S([T('문의', 'sub'), T(f.contact, 'accent')], { visual: vis(visualFor('contact', f.contact, f)), role: 'info', p: 2 }));
  B.push(S([T(f.name || subject), T(end, 'sub')], { kind: 'end', role: 'end', p: 1 }));
  if (B[2] && B[2].kind === 'list' && !B[2].rows.length) B.splice(2, 1);

  // C 이야기형: 느린 호흡, 가운데 정렬, 그림 크게
  mi = 0;
  const C = [];
  (feats.length ? feats.slice(0, 3) : [hook]).forEach((t, n) => C.push(S([T(t, 'sub')], { visual: vis({ g: 'poster', text: feats.length ? keywordOf(t, subject) : subject }), align: 'center', role: n ? 'feat' : 'hook', p: n ? 3 : 1 })));
  if (subject) C.push(S([T(subject, 'accent'), T([f.date, f.price].filter(Boolean).join(' · '), 'sub')], { visual: vis(f.price ? visualFor('price', f.price, f) : visualFor('date', f.date, f)), align: 'center', role: 'subject', p: 1 }));
  if (f.price && f.date) C.push(S([T(f.date, 'sub')], { visual: vis(visualFor('date', f.date, f)), align: 'center', role: 'info', p: 3 }));
  if (f.hours) { const v = visualFor('hours', f.hours, f); v.label = ''; C.push(S([T(f.hours, 'sub')], { visual: vis(v), align: 'center', role: 'info', p: 3 })); }
  if (f.place) C.push(S([T(f.place, 'sub')], { visual: vis(visualFor('place', f.place, f)), align: 'center', role: 'info', p: 2 }));
  ['target', 'apply'].forEach(k => { if (f[k]) C.push(S([T(f[k], 'sub')], { visual: vis(visualFor(k, f[k], f)), align: 'center', role: 'info', p: 2 })); });
  if (f.contact) { const v = visualFor('contact', f.contact, f); v.label = ''; C.push(S([T(f.contact, 'sub')], { visual: vis(v), align: 'center', role: 'info', p: 3 })); }
  C.push(S([T(f.name || subject), T(end, 'sub')], { kind: 'end', align: 'center', role: 'end', p: 1 }));
  return { A, B, C };
}

/* 장면 길이 나누기
   1) 장면마다 '읽는 데 필요한 시간'을 계산: 기본 시간(역할별) + 글자 수 ÷ 초당 7자
   2) 첫 장면(눈길 끌기)은 짧게 묶어 두고(최대 3초), 남는 시간은 정보·마무리 장면에 필요 시간 비율로 나눔
   3) 목표보다 길면 덜 중요한 장면(p=3 → p=2)부터 빼고, 그래도 길면 고르게 줄임(최소 시간은 지킴) */
const ROLE_T = { // [기본, 최소, 최대]
  hook: [1.2, 2, 3], subject: [1.8, 2.5, 5], feat: [1.4, 2.5, 7], info: [2.2, 3, 6.5], list: [1.6, 4, 16], end: [2.4, 3.5, 6]
};
function needOf(s){
  const chars = s.kind === 'list' ? s.rows.reduce((a, r) => a + r[0].length + r[1].length, 0) : s.lines.reduce((a, l) => a + l.t.replace(/\s/g, '').length, 0);
  const R = ROLE_T[s.role] || ROLE_T.feat;
  return Math.max(R[1], R[0] + chars / 7 + (s.kind === 'list' ? s.rows.length * 0.9 : 0) + (s.visual ? 0.4 : 0));
}
function fitDurations(scenes, target, mood, plan, keepAll){
  const tempo = { bright: 0.95, calm: 1.1, strong: 0.9 }[mood || 'calm'] * (plan === 'C' ? 1.15 : 1);
  let list = scenes.slice();
  const need = s => needOf(s) * tempo;
  // 너무 길면 덜 중요한 장면부터 뺌
  if (!keepAll) for (const pr of [3, 2]) {
    while (list.reduce((a, s) => a + Math.max((ROLE_T[s.role] || ROLE_T.feat)[1], need(s) * 0.75), 0) > target) {
      const i = list.map(s => s.p).lastIndexOf(pr); if (i < 0) break; list.splice(i, 1);
    }
  }
  list.forEach(s => s.d = need(s));
  const lim = s => ROLE_T[s.role] || ROLE_T.feat;
  for (let round = 0; round < 6; round++) {
    const sum = totalOf(list), gap = target - sum;
    if (Math.abs(gap) < 0.05) break;
    const free = list.filter(s => gap > 0 ? s.d < lim(s)[2] - 0.01 : s.d > lim(s)[1] + 0.01);
    if (!free.length) break;
    const w = free.reduce((a, s) => a + need(s), 0);
    free.forEach(s => s.d = Math.max(lim(s)[1], Math.min(gap > 0 ? lim(s)[2] : 99, s.d + gap * need(s) / w)));
  }
  // 최대치에 다 걸려도 남으면 첫 장면을 뺀 모든 장면에 고르게
  let left = target - totalOf(list);
  if (left > 0.05) { const others = list.filter(s => s.role !== 'hook'); others.forEach(s => s.d += left / others.length); }
  list.forEach(s => s.d = Math.round(s.d * 10) / 10);
  const diff = Math.round((target - totalOf(list)) * 10) / 10;
  if (Math.abs(diff) >= 0.1) { const e = list[list.length - 1]; e.d = Math.max(lim(e)[1], Math.round((e.d + diff) * 10) / 10); }
  scenes.length = 0; list.forEach(s => scenes.push(s));
  return scenes;
}
