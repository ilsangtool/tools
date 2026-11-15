const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const val = id => ($('#'+id) && $('#'+id).value || '').trim();
const radio = n => { const r = document.querySelector('input[name="'+n+'"]:checked'); return r ? r.value : ''; };
const won = n => (Math.round(n) || 0).toLocaleString('ko-KR') + '원';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WD = ['일','월','화','수','목','금','토'];
function parseDate(s){ if(!s) return null; const [y,m,d] = s.split('-').map(Number); return (y && m && d) ? new Date(y, m-1, d) : null; }
function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function kDate(d, withYear){ return (withYear ? d.getFullYear()+'년 ' : '') + (d.getMonth()+1)+'월 '+d.getDate()+'일('+WD[d.getDay()]+')'; }
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function dayDiff(a, b){ return Math.round((Date.UTC(b.getFullYear(),b.getMonth(),b.getDate()) - Date.UTC(a.getFullYear(),a.getMonth(),a.getDate())) / 86400000); }
function today(){ const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); }
async function copy(s){
  s = String(s).replace(/\u2060/g, '');
  try { await navigator.clipboard.writeText(s); toast('복사했습니다'); }
  catch(e) {
    const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('복사했습니다'); } catch(_) { toast('복사가 막혀 있습니다. 직접 선택해 복사하세요'); }
    ta.remove();
  }
}
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(_) { return null; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(_) {} },
  del(k){ try { localStorage.removeItem(k); } catch(_) {} }
};
function bindTabs(root){
  (root || document).querySelectorAll('.tabs').forEach(tb => {
    tb.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      tb.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      const scope = tb.parentElement;
      scope.querySelectorAll(':scope > [data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab));
      if (tb.onTab) tb.onTab(b.dataset.tab);
    }));
  });
}
function download(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function armReset(btn, fn){
  let armed = false; const label = btn.textContent;
  btn.addEventListener('click', () => {
    if (!armed) { armed = true; btn.textContent = '한 번 더 누르면 모두 지워집니다'; setTimeout(() => { armed = false; btn.textContent = label; }, 3000); return; }
    armed = false; btn.textContent = label; fn();
  });
}
/* ---- 법령 값: data/rules.json (매주 자동 점검) ---- */
let RULES = __RULES__;
// from(시행일)이 date 이하인 항목을 차례로 덮어써서 그 날짜에 유효한 값을 만듦
function ruleAt(list, date){
  const d = typeof date === 'string' ? date : ymd(date || today());
  const out = {};
  (list || []).filter(x => x.from <= d).sort((a, b) => a.from < b.from ? -1 : 1).forEach(x => Object.assign(out, x));
  return out;
}
function onRulesLoaded(fn){
  const show = () => { const el = $('#rulesInfo'); if (!el) return; const d = s => s.replace(/-/g, '.');
    el.textContent = RULES.officialCheckedAt ? `법령 기준값은 법제처 국가법령정보센터 원문(법령·고시)으로 자동 확인합니다 (마지막 확인 ${d(RULES.officialCheckedAt)}).` : `법령 기준값은 법령·고시 원문 기준으로 관리합니다 (마지막 점검 ${d(RULES.checkedAt || '')}).`; };
  show();
  const ctl = 'AbortController' in window ? new AbortController() : null;
  if (ctl) setTimeout(() => ctl.abort(), 4000);
  fetch('../data/rules.json', { cache: 'no-cache', signal: ctl && ctl.signal })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && JSON.stringify(j) !== JSON.stringify(RULES)) { RULES = j; show(); fn(); } else show(); })
    .catch(() => {});
}

/* 함께 쓰면 좋은 도구: 실제 이용 기기 수(오비트 집계) 순으로 다시 정렬. 하루 한 번만 받아 이 기기에 보관 */
(function(){
  const box = document.getElementById('related'); if (!box) return;
  const KEY = 'ilsang_pop_v1', DB = 'https://gurichecklist-default-rtdb.asia-southeast1.firebasedatabase.app/_orbit/apps.json';
  const apply = counts => {
    const ol = box.querySelector('ol'), li = Array.from(ol.children);
    const sc = el => { const c = counts['tools~' + el.dataset.slug] || {}; return (c.u || 0) * 1000 + (c.v || 0) / 1000; };
    li.map((el, i) => [el, sc(el), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).forEach(([el]) => ol.appendChild(el));
  };
  let c = null; try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e) {}
  if (c && c.d) apply(c.d);
  if (c && Date.now() - c.t < 12 * 3600e3) return;
  setTimeout(() => fetch(DB).then(r => r.ok ? r.json() : null).then(d => {
    if (!d) return; const keep = {};
    Object.keys(d).forEach(k => { if (k.indexOf('tools~') === 0) keep[k] = { u: d[k].u || 0, v: d[k].v || 0 }; });
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: keep })); } catch(e) {}
    apply(keep);
  }).catch(() => {}), 2500);
})();
