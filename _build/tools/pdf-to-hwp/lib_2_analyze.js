/* ===== PDF 분석: 글자 줄 → 문단, 선 → 표 ===== */
const LIST_RE = /^(?:\d{1,2}[.)]|[가-힣][.)](?=\s)|\(\d{1,2}\)|\([가-힣]\)|[①-⑳⑴-⒇㉠-㉭㉮-㉻]|[□■○●◦▪•·\-–※*◎◇◆▶►▷◁ㅇ]|[ⅰ-ⅻⅠ-Ⅻ]+[.)])/;
const PAGE_NO_RE = /^[-–—\s]*(?:\d{1,4}|[ivxIVX]{1,6})\s*[-–—]?\s*(?:[\/|]\s*\d{1,4})?\s*(?:쪽|페이지|page)?[-–—\s]*$/i;
// 줄이 낱말 중간에서 끊겼는지: 다음 줄이 조사·어미로 시작하면 붙여 씀
const TAIL_RE = /^(?:습니다|읍니다|랍니다|합니다|입니다|됩니다|니다|시오|다|요|음|함|됨|임|을|를|은|는|이|가|의|에|에서|에게|으로|로|와|과|도|만|께|며|고|서|여|하여|하고|하며|한|할|된|될|되어|해|했|및)(?=[\s.,·)」』'"]|$)/;
const GAP = '\uE000'; // 넓은 띄움 자리표 (문단 정리 때 공백으로 바뀜)
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/* 글자 조각(run): {t, x1, x2, yT, yB, sz, b} 좌표는 pt, 위쪽이 0 */
function groupLines(runs){
  runs = runs.filter(r => r.t !== '').sort((a, b) => (a.yT + a.yB) / 2 - (b.yT + b.yB) / 2 || a.x1 - b.x1);
  const lines = [], byKey = {};
  for (const r of runs) {
    if (r.key) { // 스캔 글자 인식: 인식기가 정한 줄 그대로
      const L = byKey[r.key];
      if (L) { L.runs.push(r); L.yT = Math.min(L.yT, r.yT); L.yB = Math.max(L.yB, r.yB); }
      else lines.push(byKey[r.key] = { runs: [r], yT: r.yT, yB: r.yB });
      continue;
    }
    const yc = (r.yT + r.yB) / 2, h = r.yB - r.yT;
    let best = null;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
      const L = lines[i], lc = (L.yT + L.yB) / 2;
      if (Math.abs(lc - yc) < Math.min(h, L.yB - L.yT) * 0.5) { best = L; break; }
    }
    if (best) { best.runs.push(r); best.yT = Math.min(best.yT, r.yT); best.yB = Math.max(best.yB, r.yB); }
    else lines.push({ runs: [r], yT: r.yT, yB: r.yB });
  }
  for (const L of lines) {
    L.runs.sort((a, b) => a.x1 - b.x1);
    // 겹치는 조각 정리(그림자·굵게 흉내로 같은 글자를 두 번 그린 경우)
    const rs = [];
    for (const r of L.runs) {
      const p = rs[rs.length - 1];
      if (p && r.t === p.t && Math.abs(r.x1 - p.x1) < r.sz * 0.3) { p.b = true; continue; }
      rs.push(r);
    }
    L.runs = rs;
    const vis = rs.filter(r => r.t.trim()); // 공백 조각은 위치 계산에서 뺌(칸 사이를 잇는 긴 공백이 흔함)
    L.x1 = Math.min(...(vis.length ? vis : rs).map(r => r.x1)); L.x2 = Math.max(...(vis.length ? vis : rs).map(r => r.x2));
    L.sz = median(rs.filter(r => r.t.trim()).map(r => r.sz)) || rs[0].sz;
    // 띄어쓰기 복원 + 같은 모양끼리 묶기
    const out = [];
    let prev = null;
    for (const r of rs) {
      let t = r.t;
      if (!t.trim()) continue; // 공백만 있는 조각은 버리고 위치로 띄어쓰기를 다시 만듦 (넓은 띄움을 살리려고)
      if (prev) {
        const gap = r.x1 - prev.x2, sz = Math.min(r.sz, prev.sz);
        if (!r.ocr && gap > sz * 1.0 && prev.t.trim() && t.trim()) {
          // 넓게 띄운 자리(예: '제 26-23호 ……… 접수일')는 공백 여러 칸으로 살림. 줄이 넘치지 않게 한 칸 덜 넣음
          const n = Math.max(2, Math.floor(gap / (sz * spaceEm(r.ff || prev.ff || '맑은 고딕'))) - 1);
          t = GAP.repeat(n) + t.replace(/^\s+/, '');
          if (/\s$/.test(prev.t) && out.length) out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, '');
        } else if (gap > sz * (r.ocr ? (/[A-Za-z0-9.,%)]$/.test(prev.t) && /^[A-Za-z0-9(]/.test(t) ? 0.12 : 0.4) : 0.22) && !/\s$/.test(prev.t) && !/^\s/.test(t)) t = ' ' + t;
      }
      const last = out[out.length - 1];
      if (last && last.b === r.b && last.ff === r.ff && Math.abs(last.sz - r.sz) < 0.6) last.t += t;
      else out.push({ t, b: r.b, sz: r.sz, ff: r.ff || '' });
      prev = r;
    }
    if (rs[0].ocr && out.length) out[0].t = out[0].t.replace(/^[Oo0]\s/, '○ ').replace(/^(?:ㅁ|\[|ㄷ|口)\s/, '□ ').replace(/^[ㆍ·•]\s?/, '· ');
    L.parts = out;
    L.text = out.map(p => p.t).join('').replace(/\s+/g, ' ').trim();
    const bChars = out.filter(p => p.b).reduce((a, p) => a + p.t.trim().length, 0);
    L.bold = bChars > L.text.replace(/\s/g, '').length * 0.6;
  }
  return lines.filter(L => L.text).sort((a, b) => a.yT - b.yT);
}

/* 줄 → 문단. area = {x1, x2} 본문(또는 칸) 가로 범위 */
function buildParas(lines, area, opt){
  if (!lines.length) return [];
  lines = [...lines].sort((a, b) => a.yT - b.yT);
  const body = opt.bodySz || median(lines.map(l => l.sz));
  const left = area.x1, right = area.x2, span = Math.max(1, right - left), mid = (left + right) / 2;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) { const g = lines[i].yT - lines[i - 1].yB; if (g > -2 && g < body * 2) gaps.push(g); }
  const normGap = gaps.length ? median(gaps) : body * 0.6;
  const fullW = lines.filter(l => l.x2 - l.x1 > span * 0.6).map(l => l.x2);
  const rightEdge = fullW.length ? median(fullW) : right;
  const alignOf = l => {
    if (opt.force) return opt.force;
    const w = l.x2 - l.x1, c = (l.x1 + l.x2) / 2;
    const tol = opt.cell ? 0.12 : 0.06, ind = opt.cell ? 0.04 : 0.08;
    if (opt.cell) { const gl = l.x1 - left, gr = right - l.x2; if (gl > span * 0.25 && gr < gl * 0.5) return 'R'; }
    if (w < span * 0.85 && Math.abs(c - mid) < span * tol && l.x1 > left + span * ind) return 'C';
    if (opt.cell) { const gl = l.x1 - left, gr = right - l.x2; if (gl > 2 && gr > 2 && Math.abs(gl - gr) <= Math.max(3, Math.max(gl, gr) * 0.3)) return 'C'; }
    if (w < span * 0.6 && Math.abs(l.x2 - right) < span * 0.04 && l.x1 > mid) return 'R';
    return 'J';
  };
  const paras = [];
  let cur = null;
  for (const l of lines) {
    const al = alignOf(l), big = l.sz > body * 1.12;
    let isList = LIST_RE.test(l.text);
    // '…바랍니 / 다.'처럼 앞줄이 문장 중간에서 끝났으면 목록 기호가 아니라 이어지는 글
    if (isList && cur) { const pl = cur.lines[cur.lines.length - 1]; if (pl.x2 > rightEdge - body * 2.2 && /[가-힣A-Za-z0-9,]$/.test(pl.text)) isList = false; }
    let cont = false;
    if (cur) {
      const p = cur.lines[cur.lines.length - 1];
      const gap = l.yT - p.yB;
      cont = gap < Math.max(normGap * 1.6, body * 0.35) && gap > -body * 0.5
        && al === cur.align && al === 'J'
        && Math.abs(l.sz - p.sz) < body * 0.15
        && !isList
        && p.x2 > rightEdge - Math.max(body * 2.2, span * 0.08)      // 앞줄이 끝까지 찼으면 이어지는 줄
        && l.x1 < p.x1 + body * 1.5 + (cur.lines.length === 1 ? body * 3 : 0);
    }
    if (cont) cur.lines.push(l);
    else { cur = { lines: [l], align: al }; paras.push(cur); }
  }
  return paras.map(P => {
    const f = P.lines[0], s = P.lines[1];
    const parts = [];
    P.lines.forEach((l, i) => {
      l.parts.forEach((pp, j) => {
        let t = pp.t;
        if (j === 0) t = t.replace(/^\s+/, '');
        if (i > 0 && j === 0) {
          const prevT = parts.length ? parts[parts.length - 1].t : '';
          // 줄바꿈 이음: 영어 하이픈이면 붙이고, 아니면 띄어 씀
          if (/[A-Za-z]-$/.test(prevT)) parts[parts.length - 1].t = prevT.slice(0, -1);
          else if (!/\s$/.test(prevT) && !(/[가-힣A-Za-z0-9]$/.test(prevT) && TAIL_RE.test(t))) t = ' ' + t;
        }
        const last = parts[parts.length - 1];
        if (last && last.b === pp.b && last.ff === pp.ff && Math.abs(last.sz - pp.sz) < 0.6) last.t += t; else parts.push({ t, b: pp.b, sz: pp.sz, ff: pp.ff });
      });
    });
    parts.forEach(r => r.t = r.t.replace(/\s{2,}/g, ' ').replace(/\uE000/g, ' '));
    if (parts.length) parts[parts.length - 1].t = parts[parts.length - 1].t.replace(/\s+$/, '');
    let ml = 0, fi = 0, mr = 0;
    if (P.align === 'R') mr = Math.max(0, right - Math.max(...P.lines.map(l => l.x2)));
    if (P.align === 'L' || P.align === 'J') {
      const fx = f.x1 - left, sx = s ? s.x1 - left : fx;
      ml = Math.max(0, Math.min(fx, sx)); fi = fx - ml;
      if (s && sx > fx + body * 0.4) { ml = sx; fi = fx - sx; } // 내어쓰기(목록 기호)
      if (ml < body * 0.4) ml = 0;
      if (Math.abs(fi) < body * 0.4) fi = 0;
    }
    if (mr < body * 0.5) mr = 0;
    const single = P.lines.length === 1;
    return { type: 'p', runs: parts.map(r => ({ t: r.t, b: r.b, sz: Math.round(r.sz * 2) / 2, ff: r.ff })), align: single && P.align === 'J' && !ml ? 'J' : P.align, ml, fi, mr: Math.round(mr), sz: Math.max(...P.lines.map(l => l.sz)), yT: f.yT, yB: P.lines[P.lines.length - 1].yB };
  }).filter(p => p.runs.some(r => r.t.trim()));
}

/* ---- 선분 → 표 ---- */
function clusterVals(vals, tol){
  const s = [...vals].sort((a, b) => a - b), out = [];
  for (const v of s) { const L = out[out.length - 1]; if (L && v - L.max <= tol) { L.max = v; L.sum += v; L.n++; } else out.push({ min: v, max: v, sum: v, n: 1 }); }
  return out.map(c => c.sum / c.n);
}
function mergeIntervals(list, tol){ // [{p, a, b}] 같은 p(위치) 위의 구간 합치기
  const groups = {};
  const keys = clusterVals(list.map(s => s.p), 1.5);
  const keyOf = p => keys.reduce((best, k) => Math.abs(k - p) < Math.abs(best - p) ? k : best, keys[0]);
  list.forEach(s => (groups[keyOf(s.p)] = groups[keyOf(s.p)] || []).push(s));
  const out = [];
  for (const k in groups) {
    const iv = groups[k].sort((x, y) => x.a - y.a);
    let cur = null;
    for (const s of iv) { if (cur && s.a <= cur.b + tol) cur.b = Math.max(cur.b, s.b); else { cur = { p: +k, a: s.a, b: s.b }; out.push(cur); } }
  }
  return out;
}
function buildTables(segs, page){
  const H = [], V = [];
  for (const s of segs) {
    const dx = Math.abs(s.x2 - s.x1), dy = Math.abs(s.y2 - s.y1);
    if (dy <= 1.2 && dx >= 4) H.push({ p: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) });
    else if (dx <= 1.2 && dy >= 4) V.push({ p: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) });
  }
  if (H.length < 2 || V.length < 2) return [];
  const hs = mergeIntervals(H, 2.5), vs = mergeIntervals(V, 2.5);
  // 서로 닿는 선끼리 묶기
  const all = [...hs.map(h => ({ k: 'h', ...h })), ...vs.map(v => ({ k: 'v', ...v }))];
  const par = all.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const T = 2.5;
  all.forEach((a, i) => { if (a.k !== 'h') return; all.forEach((b, j) => {
    if (b.k !== 'v') return;
    if (b.p >= a.a - T && b.p <= a.b + T && a.p >= b.a - T && a.p <= b.b + T) par[find(i)] = find(j);
  }); });
  const comps = {};
  all.forEach((s, i) => (comps[find(i)] = comps[find(i)] || []).push(s));
  const tables = [];
  for (const k in comps) {
    const c = comps[k], ch = c.filter(s => s.k === 'h'), cv = c.filter(s => s.k === 'v');
    if (ch.length < 2 || cv.length < 2) continue;
    let ys = clusterVals(ch.map(s => s.p), 2.5), xs = clusterVals(cv.map(s => s.p), 2.5);
    const x1 = xs[0], x2 = xs[xs.length - 1], y1 = ys[0], y2 = ys[ys.length - 1];
    if (x2 - x1 < 20 || y2 - y1 < 8) continue;
    // 두 줄 테두리(간격 3pt 이하)는 하나로
    ys = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 3); xs = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 3);
    const R = ys.length - 1, C = xs.length - 1;
    if (R < 1 || C < 1) continue;
    const near = (a, b) => Math.abs(a - b) <= 2.5;
    const hasH = (y, xa, xb) => ch.some(s => near(s.p, y) && s.a <= xa + 1 && s.b >= xb - 1);
    const hasV = (x, ya, yb) => cv.some(s => near(s.p, x) && s.a <= ya + 1 && s.b >= yb - 1);
    // 칸 병합: 경계선이 없으면 이웃 칸과 합침
    const id = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, q) => r * C + q));
    const P2 = id.flat(), f2 = i => P2[i] === i ? i : (P2[i] = f2(P2[i]));
    for (let r = 0; r < R; r++) for (let q = 0; q < C; q++) {
      const ym = (ys[r] + ys[r + 1]) / 2, xm = (xs[q] + xs[q + 1]) / 2;
      if (q + 1 < C && !hasV(xs[q + 1], ym - (ys[r + 1] - ys[r]) * 0.25, ym + (ys[r + 1] - ys[r]) * 0.25)) P2[f2(r * C + q + 1)] = f2(r * C + q);
      if (r + 1 < R && !hasH(ys[r + 1], xm - (xs[q + 1] - xs[q]) * 0.25, xm + (xs[q + 1] - xs[q]) * 0.25)) P2[f2((r + 1) * C + q)] = f2(r * C + q);
    }
    const groups = {};
    for (let r = 0; r < R; r++) for (let q = 0; q < C; q++) { const g = f2(r * C + q); (groups[g] = groups[g] || []).push([r, q]); }
    const cells = [], used = Array.from({ length: R }, () => Array(C).fill(false));
    Object.values(groups).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]).forEach(g => {
      const r0 = Math.min(...g.map(v => v[0])), r1 = Math.max(...g.map(v => v[0])), c0 = Math.min(...g.map(v => v[1])), c1 = Math.max(...g.map(v => v[1]));
      for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) if (used[r][q]) return; // 겹침 방지
      for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) used[r][q] = true;
      cells.push({ r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1, x1: xs[c0], x2: xs[c1 + 1], y1: ys[r0], y2: ys[r1 + 1], lines: [] });
    });
    for (let r = 0; r < R; r++) for (let q = 0; q < C; q++) if (!used[r][q]) cells.push({ r, c: q, rs: 1, cs: 1, x1: xs[q], x2: xs[q + 1], y1: ys[r], y2: ys[r + 1], lines: [] });
    tables.push({ x1, x2, y1, y2, xs, ys, cells, R, C });
  }
  // 쪽 전체를 두른 테두리 같은 큰 상자 1칸은 표로 보지 않음
  return tables.filter(t => !(t.cells.length === 1 && (t.x2 - t.x1) * (t.y2 - t.y1) > page.W * page.H * 0.35));
}

/* ---- 한 쪽의 글자·선 → 블록 ---- */
function layoutPage(runs, segs, page, opt){
  let tables = opt.tables ? buildTables(segs, page) : [];
  const inT = (r, t) => { const cx = (r.x1 + r.x2) / 2, cy = (r.yT + r.yB) / 2; return cx > t.x1 && cx < t.x2 && cy > t.y1 && cy < t.y2; };
  const free = [];
  for (const r of runs) {
    const t = tables.find(t => inT(r, t));
    if (!t) { free.push(r); continue; }
    const cx = (r.x1 + r.x2) / 2, cy = (r.yT + r.yB) / 2;
    const c = t.cells.find(c => cx >= c.x1 - 0.5 && cx <= c.x2 + 0.5 && cy >= c.y1 - 0.5 && cy <= c.y2 + 0.5);
    (c ? c.lines : free).push(r);
  }
  // 글자가 하나도 없는 1칸 상자(장식 선)는 버림
  tables = tables.filter(t => t.cells.some(c => c.lines.length));
  let lines = groupLines(free);
  return { lines, tables };
}

const CELL_PAD = 5;   // 칸 안쪽 여백(pt). 한글·워드 표의 기본 안쪽 여백과 비슷하게
let LINE_H = 1.6;     // 줄 간격(글자 크기 배수). PDF에서 재서 바꿈 (measureLineH)
// 문단 사이 띄운 만큼을 '문단 앞 간격'(sb, pt)으로 기록. 보통 줄 간격보다 넓을 때만
function spaceParas(paras, prevY, minGap){
  let y = prevY;
  for (const p of paras) {
    if (y != null) {
      const sz = p.sz || 10, extra = (p.yT - y) - sz * (LINE_H - 1.06);
      if (extra > minGap) p.sb = Math.round(extra);
    }
    y = p.yB;
  }
  return paras;
}

// 문서의 줄 간격 재기: 같은 크기 글자가 이어진 줄 사이 거리 ÷ 글자 크기의 중앙값
function measureLineH(pages){
  const r = [];
  const take = ls => { for (let i = 1; i < ls.length; i++) { const a = ls[i - 1], b = ls[i]; if (Math.abs(a.sz - b.sz) > 0.6) continue; const pitch = b.yT - a.yT; if (pitch > a.sz * 0.95 && pitch < a.sz * 2.3) r.push(pitch / a.sz); } };
  pages.forEach(p => { take(p.layout.lines); p.layout.tables.forEach(t => t.cells.forEach(c => take(groupLines(c.lines)))); });
  LINE_H = r.length >= 3 ? Math.max(1.0, Math.min(2.4, median(r))) : 1.6;
  return LINE_H;
}

function finishPage(pl, page, opt, bodySz){
  const blocks = [];
  const area = { x1: Math.min(...pl.lines.map(l => l.x1), page.W * 0.12), x2: Math.max(...pl.lines.map(l => l.x2), page.W * 0.88) };
  if (pl.lines.length || pl.tables.length) { // 본문 폭 = 글자 줄과 표를 모두 감싸는 범위
    area.x1 = Math.min(...pl.lines.map(l => l.x1), ...pl.tables.map(t => t.x1));
    area.x2 = Math.max(...pl.lines.map(l => l.x2), ...pl.tables.map(t => t.x2));
  }
  // 표 위아래로 본문을 나눠 문단을 만든 뒤 위치 순으로 합침
  const tables = [...pl.tables].sort((a, b) => a.y1 - b.y1);
  const blank = () => ({ type: 'p', runs: [], align: 'J', ml: 0, fi: 0, blank: true });
  let lastY = null; // 바로 앞 블록의 아래쪽 위치
  const gapNeeded = y => lastY != null && y - lastY > bodySz * 0.9;
  for (let i = 0; i <= tables.length; i++) {
    const top = i ? tables[i - 1].y2 - 1 : -Infinity, bottom = i < tables.length ? tables[i].y1 : Infinity;
    const seg = pl.lines.filter(l => l.yT >= top && l.yT < bottom);
    const ps = spaceParas(buildParas(seg, area, { bodySz }), lastY, bodySz * 0.9);
    ps.forEach(p => blocks.push(p));
    if (ps.length) lastY = ps[ps.length - 1].yB;
    if (i < tables.length) {
      const t = tables[i];
      if (blocks.length && gapNeeded(t.y1)) blocks.push(blank()); // 표 앞 띄운 줄
      const cells = t.cells.map(c => {
        const ls = groupLines(c.lines);
        const box = { x1: c.x1 + CELL_PAD, x2: c.x2 - CELL_PAD };
        // 여러 줄이면 줄들의 왼쪽 끝이 맞는지(왼쪽 정렬), 가운데가 맞는지(가운데 정렬) 보고 칸 전체 정렬을 정함
        let force = '';
        if (ls.length >= 2) {
          const cs = ls.map(l => (l.x1 + l.x2) / 2), cm = median(cs), x0 = Math.min(...ls.map(l => l.x1));
          const centered = cs.every(v => Math.abs(v - cm) < 3);
          const selfC = l => { const gl = l.x1 - box.x1, gr = box.x2 - l.x2; return gl > 4 && Math.abs(gl - gr) <= Math.max(6, Math.max(gl, gr) * 0.2); };
          const lefts = ls.filter(l => Math.abs(l.x1 - x0) < 1.5 && !selfC(l)).length;
          if (!centered && lefts >= 2) force = 'L';
          else if (centered && ls.some(l => l.x1 - box.x1 > 4)) force = 'C';
        }
        const paras = buildParas(ls, box, { bodySz, cell: true, force }).map(p => ({ ...p, align: p.align === 'J' ? 'L' : p.align, ml: p.align === 'C' ? 0 : p.ml, fi: p.align === 'C' ? 0 : p.fi }));
        // 세로 위치: 위아래 여백이 비슷하면 가운데, 아니면 위에서부터 (첫 문단 앞 여백으로 위치 맞춤)
        let va = 'C';
        if (paras.length) {
          const top = paras[0].yT - c.y1, bot = c.y2 - paras[paras.length - 1].yB;
          if (Math.abs(top - bot) > Math.max(6, Math.max(top, bot) * 0.3)) va = 'T';
        }
        spaceParas(paras, va === 'T' ? c.y1 + 1.5 : null, 2);
        return { r: c.r, c: c.c, rs: c.rs, cs: c.cs, va, paras, forced: !!force };
      });
      // 같은 열 칸이 대부분 가운데 정렬이면 그 열은 모두 가운데로 (숫자·짧은 글 칸의 흔들림 정리)
      for (let q = 0; q < t.C; q++) {
        const col = cells.filter(c => c.c === q && c.cs === 1 && c.paras.length && !c.forced);
        const cen = col.filter(c => c.paras.every(p => p.align === 'C')).length;
        if (col.length >= 2 && cen / col.length >= 0.5) col.forEach(c => c.paras.forEach(p => { if (p.align === 'L') p.align = 'C'; }));
      }
      blocks.push({ type: 'table', cols: t.xs.slice(1).map((x, k) => x - t.xs[k]), rows: t.ys.slice(1).map((y, k) => y - t.ys[k]), cells, yT: t.y1, yB: t.y2, x1: t.x1 - area.x1 });
      lastY = t.y2;
    }
  }
  blocks.forEach(b => { b.ax1 = area.x1; b.ax2 = area.x2; }); // 쪽 안의 위치(파워포인트용)
  return blocks;
}

/* 머리말·꼬리말·쪽번호 찾기: 여러 쪽에서 같은 위치에 반복되는 줄 */
function stripRepeats(pages){
  const key = l => l.text.replace(/\d+/g, '#').replace(/\s/g, '');
  const cnt = {};
  pages.forEach(p => {
    const seen = new Set();
    p.layout.lines.forEach(l => {
      const edge = l.yB < p.H * 0.1 || l.yT > p.H * 0.9;
      if (!edge) return;
      const k = key(l) + '@' + (l.yT < p.H / 2 ? 't' : 'b');
      if (!seen.has(k)) { seen.add(k); cnt[k] = (cnt[k] || 0) + 1; }
    });
  });
  let removed = 0;
  pages.forEach(p => {
    p.layout.lines = p.layout.lines.filter(l => {
      const edge = l.yB < p.H * 0.1 || l.yT > p.H * 0.9;
      if (!edge) return true;
      const k = key(l) + '@' + (l.yT < p.H / 2 ? 't' : 'b');
      const rep = pages.length >= 3 && cnt[k] >= Math.max(2, pages.length * 0.5);
      if (rep || PAGE_NO_RE.test(l.text)) { removed++; return false; }
      return true;
    });
  });
  return removed;
}
