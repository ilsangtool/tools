/* ---- 근로소득 간이세액표 (소득세법 시행령 별표 2) ----
   표 값은 data/wage-table.json (법제처 별표 원문에서 자동 갱신). 빌드 때 넣고, 열 때 최신 파일을 다시 읽음 */
const WageTax = (function(){
  let T = __WAGE__;
  const f10 = n => Math.floor(n / 10) * 10;
  function at(date){
    const d = date || new Date().toISOString().slice(0, 10), out = {};
    (T.versions || []).filter(v => v.from <= d).sort((a, b) => a.from < b.from ? -1 : 1).forEach(v => Object.assign(out, v));
    return out;
  }
  function famTax(V, pay, fam){ // 100% 세액 (자녀 공제 전)
    if (fam > 11) { const a = famTax(V, pay, 11), b = famTax(V, pay, 10); return Math.max(0, a - (b - a) * (fam - 11)); }
    const rows = V.rows, last = rows[rows.length - 1], i = fam + 1;
    if (pay < rows[0][0] * 1000) return 0;
    if (pay < last[0] * 1000) { const r = rows.find(r => pay >= r[0] * 1000 && pay < r[1] * 1000); return r ? r[i] : 0; }
    if (pay === last[0] * 1000) return last[i];
    const seg = V.over.find(s => s[0] == null || pay <= s[0] * 1000);
    return f10(last[i] + seg[4] + (pay - seg[1] * 1000) * seg[2] * seg[3]);
  }
  function childDed(V, kids){ if (!kids) return 0; const c = V.child; return kids === 1 ? c[0] : kids === 2 ? c[1] : c[1] + (kids - 2) * c[2]; }
  return {
    calc(pay, fam, kids, ratio, date){
      const V = at(date); pay = Math.max(0, Math.floor(pay)); fam = Math.max(1, Math.floor(fam || 1)); kids = Math.max(0, Math.floor(kids || 0));
      const base = famTax(V, pay, fam), cd = childDed(V, kids), r = (ratio || 100) / 100;
      const it = f10(f10(Math.max(0, base - cd)) * r);
      return { it, lt: f10(it * 0.1), base, child: Math.min(base, cd), source: V.source || '' };
    },
    set(j){ if (j && Array.isArray(j.versions) && j.versions.some(v => Array.isArray(v.rows) && v.rows.length > 500)) T = j; },
    refresh(cb){
      const ctl = 'AbortController' in window ? new AbortController() : null; if (ctl) setTimeout(() => ctl.abort(), 5000);
      fetch('../data/wage-table.json', { cache: 'no-cache', signal: ctl && ctl.signal }).then(r => r.ok ? r.json() : null)
        .then(j => { if (j && JSON.stringify(j.versions.map(v => [v.from, v.source])) !== JSON.stringify(T.versions.map(v => [v.from, v.source]))) { this.set(j); cb && cb(); } }).catch(() => {});
    },
    source: date => at(date).source || ''
  };
})();
