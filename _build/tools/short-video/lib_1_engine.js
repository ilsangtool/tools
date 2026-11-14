/* ===== 장면 렌더러: 캔버스에 한 장면을 그림 =====
   장면 {d:초, kind:'text'|'visual'|'big'|'list'|'end', lines:[{t, role:'main'|'sub'|'accent'|'label'}], rows:[[라벨, 값]], visual:{media:번호}|{g:그림종류, ...}|null, align}
*/
const RATIOS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
const PALETTES = [
  { id: 'ink',    name: '먹색',   bg: '#151515', fg: '#FFFFFF', ac: '#E8B04B', panel: '#242424', line: '#3A3A3A' },
  { id: 'cream',  name: '크림',   bg: '#F3EEE5', fg: '#2A2118', ac: '#B5442C', panel: '#E6DECF', line: '#CFC4B0' },
  { id: 'white',  name: '흰색',   bg: '#FFFFFF', fg: '#1F1F1F', ac: '#8C6A43', panel: '#EFECE8', line: '#D9D5CF' },
  { id: 'navy',   name: '남색',   bg: '#1A2B5F', fg: '#FFFFFF', ac: '#F2C94C', panel: '#24376F', line: '#3A4C86' },
  { id: 'forest', name: '숲',     bg: '#1F3B2D', fg: '#F4F1EA', ac: '#D7B56D', panel: '#284A39', line: '#3B5E4C' },
  { id: 'brick',  name: '벽돌',   bg: '#F7F3EF', fg: '#2B1D1A', ac: '#A33B2B', panel: '#EADFD6', line: '#D6C6B9' }
];
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const easeOut = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

class Stage {
  constructor(canvas){ this.cv = canvas; this.x = canvas.getContext('2d'); this.media = []; }
  setup(ratio, scale){
    const [W, H] = RATIOS[ratio]; this.ratio = ratio;
    this.cv.width = Math.round(W * scale); this.cv.height = Math.round(H * scale);
    this.W = W; this.H = H; this.s = scale;
  }
  geo(){
    const W = this.W, H = this.H, r = this.ratio;
    if (r === '16:9') return { panel: [W * 0.06, H * 0.12, W * 0.46, H * 0.76], text: [W * 0.57, H * 0.1, W * 0.37, H * 0.8], textOnly: [W * 0.12, H * 0.1, W * 0.76, H * 0.8], u: H / 100 };
    if (r === '1:1') return { panel: [W * 0.08, H * 0.08, W * 0.84, H * 0.48], text: [W * 0.08, H * 0.6, W * 0.84, H * 0.34], textOnly: [W * 0.09, H * 0.1, W * 0.82, H * 0.8], u: W / 100 };
    return { panel: [W * 0.09, H * 0.12, W * 0.82, H * 0.42], text: [W * 0.09, H * 0.58, W * 0.82, H * 0.22], textOnly: [W * 0.09, H * 0.1, W * 0.82, H * 0.68], u: W / 100 };
  }
  /* 글자 줄바꿈: 띄어쓰기 기준, 넘치면 글자 기준 */
  wrap(text, maxW){
    const x = this.x, out = [];
    String(text).split('\n').forEach(par => {
      let line = '';
      par.split(' ').forEach(w => {
        const t = line ? line + ' ' + w : w;
        if (x.measureText(t).width <= maxW) { line = t; return; }
        if (line) out.push(line);
        if (x.measureText(w).width <= maxW) { line = w; return; }
        line = ''; this._broke = true;
        for (const ch of w) { if (x.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }
      });
      out.push(line);
    });
    return out;
  }
  sizeOf(role, u, kind, vis){
    if (kind === 'big' && role === 'accent') return u * 15;
    const k = vis ? 1.08 : 1.3; // 그림 없는 장면은 글자를 더 크게
    return ({ main: u * 8.4, accent: u * 8.4, sub: u * 5.2, label: u * 4.2 }[role] || u * 6) * k;
  }
  /* 글 블록 배치: 넘치면 전체를 줄여 맞춤 */
  layoutText(lines, box, kind, align, vis){
    const x = this.x, g = this.geo();
    let k = 1, res;
    for (let tries = 0; tries < 12; tries++, k *= 0.9) {
      res = []; let h = 0; this._broke = false;
      lines.forEach((l, i) => {
        const sz = this.sizeOf(l.role, g.u, kind, vis) * k, w = l.role === 'sub' || l.role === 'label' ? 400 : 700;
        x.font = `${w} ${sz}px ${FONT}`;
        const rows = this.wrap(l.t, box[2]);
        res.push({ l, sz, w, rows, top: h });
        h += rows.length * sz * 1.3 + (i < lines.length - 1 ? sz * 0.35 : 0);
      });
      if (h <= box[3] && res.every(r => r.rows.length <= 4) && (!this._broke || tries >= 8)) return { res, h }; // 낱말 중간이 잘리면 글자를 줄여 다시
    }
    return { res, h: res.reduce((a, r) => Math.max(a, r.top + r.rows.length * r.sz * 1.3), 0) };
  }
  draw(sc, local, P){
    const x = this.x, W = this.W, H = this.H, g = this.geo();
    x.setTransform(this.s, 0, 0, this.s, 0, 0);
    x.fillStyle = P.bg; x.fillRect(0, 0, W, H);
    const hasVis = !!sc.visual;
    if (hasVis) this.drawVisual(sc.visual, g.panel, local, sc.d, P);
    const box = hasVis ? g.text : g.textOnly;
    if (sc.kind === 'list') return this.drawList(sc, box, local, P, g);
    const { res, h } = this.layoutText(sc.lines, box, sc.kind, sc.align, hasVis);
    const vertical = hasVis && this.ratio !== '16:9' ? 0 : 0.5; // 사진 아래 글은 위에서부터, 나머지는 가운데
    let y0 = box[1] + (box[3] - h) * vertical;
    const center = sc.align === 'center';
    res.forEach((r, i) => {
      const a = easeOut((local - 0.1 - i * 0.18) / 0.2); // 줄마다 0.18초 간격, 0.2초 동안 떠오름
      x.globalAlpha = a;
      x.font = `${r.w} ${r.sz}px ${FONT}`;
      x.fillStyle = r.l.role === 'accent' ? P.ac : r.l.role === 'label' ? P.ac : P.fg;
      x.textBaseline = 'top'; x.textAlign = center ? 'center' : 'left';
      const tx = center ? box[0] + box[2] / 2 : box[0];
      r.rows.forEach((row, j) => x.fillText(row, tx, y0 + r.top + j * r.sz * 1.3 + (1 - a) * 18));
    });
    x.globalAlpha = 1; x.textAlign = 'left';
  }
  drawList(sc, box, local, P, g){
    const x = this.x, rows = sc.rows || [];
    let sz = g.u * 6.2; const lw = () => { x.font = `400 ${sz * 0.75}px ${FONT}`; return Math.max(...rows.map(r => x.measureText(r[0]).width)) + sz * 0.8; };
    let labW = lw();
    while (sz > g.u * 3) {
      x.font = `700 ${sz}px ${FONT}`;
      const fit = rows.every(r => x.measureText(r[1]).width <= box[2] - labW);
      const h = rows.length * sz * 2.0;
      if (fit && h <= box[3]) break;
      sz *= 0.92; labW = lw();
    }
    const total = rows.length * sz * 2.0, y0 = box[1] + (box[3] - total) / 2;
    rows.forEach((r, i) => {
      const a = easeOut((local - 0.15 - i * 0.35) / 0.2), y = y0 + i * sz * 2.0 + (1 - a) * 18;
      x.globalAlpha = a; x.textBaseline = 'top';
      x.font = `400 ${sz * 0.75}px ${FONT}`; x.fillStyle = P.ac; x.fillText(r[0], box[0], y + sz * 0.18);
      x.font = `700 ${sz}px ${FONT}`; x.fillStyle = P.fg; x.fillText(r[1], box[0] + labW, y);
      x.fillStyle = P.line; x.globalAlpha = a * 0.8; x.fillRect(box[0], y + sz * 1.55, box[2], Math.max(2, sz * 0.03));
    });
    x.globalAlpha = 1;
  }
  drawVisual(v, p, local, d, P){
    const x = this.x, [px, py, pw, ph] = p, a = easeOut(local / 0.2);
    x.save(); x.globalAlpha = a;
    x.beginPath(); x.rect(px, py, pw, ph); x.clip();
    if (v.media != null && this.media[v.media]) {
      const m = this.media[v.media], el = m.el;
      const iw = m.type === 'video' ? el.videoWidth : el.naturalWidth, ih = m.type === 'video' ? el.videoHeight : el.naturalHeight;
      if (iw && ih) {
        const z = 1 + 0.04 * Math.min(1, local / Math.max(1, d)); // 아주 느린 확대
        const s = Math.max(pw / iw, ph / ih) * z, w = iw * s, h = ih * s;
        x.drawImage(el, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
      }
    } else {
      x.fillStyle = P.panel; x.fillRect(px, py, pw, ph);
      Graphics[v.g] && Graphics[v.g](x, px, py, pw, ph, v, P, local);
    }
    x.restore();
  }
}

/* ===== 내용으로 만드는 정보 그림 (사진이 없을 때) =====
   선 굵기·색을 한 세트로 통일: 선은 글자색, 강조는 강조색 */
const Graphics = {
  _lw(pw, ph){ return Math.max(4, Math.min(pw, ph) * 0.012); },
  _font(x, w, sz){ x.font = `${w} ${sz}px ${FONT}`; },
  _fit(x, text, w, maxW, sz){ let s = sz; this._font(x, w, s); while (x.measureText(text).width > maxW && s > 10) { s *= 0.92; this._font(x, w, s); } return s; },
  poster(x, px, py, pw, ph, v, P){ // 큰 글자 포스터
    const m = Math.min(pw, ph) * 0.1;
    x.strokeStyle = P.line; x.lineWidth = this._lw(pw, ph); x.strokeRect(px + m * 0.5, py + m * 0.5, pw - m, ph - m);
    const words = String(v.text || '').split(' ');
    // 한 줄로 충분히 크게 들어가면 한 줄, 아니면 두 줄
    const one = this._fit(x, v.text || '', 700, pw - m * 2.6, Math.min(ph * 0.42, pw * 0.3));
    const lines = words.length > 1 && one < ph * 0.2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [v.text || ''];
    let sz = Math.min(ph / (lines.length * 1.4 + 0.8), pw * 0.3);
    lines.forEach(l => { sz = Math.min(sz, this._fit(x, l, 700, pw - m * 2.6, sz)); });
    this._font(x, 700, sz); x.fillStyle = P.ac; x.textAlign = 'center'; x.textBaseline = 'middle';
    const top = py + ph / 2 - (lines.length - 1) * sz * 0.65;
    lines.forEach((l, i) => x.fillText(l, px + pw / 2, top + i * sz * 1.3));
    if (v.sub) { const ss = this._fit(x, v.sub, 400, pw - m * 2.6, Math.min(sz * 0.32, ph * 0.07)); x.fillStyle = P.fg; x.globalAlpha *= 0.75; x.fillText(v.sub, px + pw / 2, py + ph - m * 1.3 - ss / 2); }
    x.textAlign = 'left';
  },
  calendar(x, px, py, pw, ph, v, P){
    const s = Math.min(pw, ph) * 0.74, cx = px + pw / 2, cy = py + ph / 2, w = s * 0.86, h = s, l = cx - w / 2, t = cy - h / 2, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.fillRect(l, t, w, h);
    x.strokeStyle = P.fg; x.lineWidth = lw; x.strokeRect(l, t, w, h);
    x.fillStyle = P.ac; x.fillRect(l, t, w, h * 0.24);
    x.fillStyle = P.fg; [0.3, 0.7].forEach(k => x.fillRect(l + w * k - lw, t - h * 0.06, lw * 2, h * 0.12)); // 고리
    x.textAlign = 'center'; x.textBaseline = 'middle';
    this._font(x, 700, h * 0.12); x.fillStyle = P.bg; x.fillText(v.month ? v.month + '월' : '', cx, t + h * 0.12);
    this._font(x, 700, h * 0.42); x.fillStyle = P.fg; x.fillText(v.day || '', cx, t + h * 0.56);
    if (v.week) { this._font(x, 400, h * 0.09); x.fillText(v.week, cx, t + h * 0.86); }
    x.textAlign = 'left';
  },
  clock(x, px, py, pw, ph, v, P){
    const r = Math.min(pw, ph) * 0.3, cx = px + pw / 2, cy = py + ph * 0.44, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = P.fg; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); x.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92); x.stroke(); }
    const hh = (v.h || 9) % 12, mm = v.m || 0, ha = (hh + mm / 60) / 12 * Math.PI * 2, ma = mm / 60 * Math.PI * 2;
    x.lineCap = 'round';
    x.strokeStyle = P.fg; x.lineWidth = lw * 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(ha) * r * 0.5, cy - Math.cos(ha) * r * 0.5); x.stroke();
    x.strokeStyle = P.ac; x.lineWidth = lw * 1.2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(ma) * r * 0.75, cy - Math.cos(ma) * r * 0.75); x.stroke();
    x.lineCap = 'butt';
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, cx, py + ph * 0.88 - sz * 0.2); x.textAlign = 'left'; }
  },
  pin(x, px, py, pw, ph, v, P){ // 위치: 길 두 줄 + 핀
    const lw = this._lw(pw, ph);
    x.strokeStyle = P.line; x.lineWidth = Math.min(pw, ph) * 0.07;
    x.beginPath(); x.moveTo(px, py + ph * 0.68); x.lineTo(px + pw, py + ph * 0.52); x.stroke();
    x.beginPath(); x.moveTo(px + pw * 0.32, py); x.lineTo(px + pw * 0.44, py + ph); x.stroke();
    const r = Math.min(pw, ph) * 0.13, cx = px + pw * 0.58, cy = py + ph * 0.38;
    x.fillStyle = P.ac; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.lineTo(cx, cy + r * 2.2); x.closePath(); x.fill();
    x.fillStyle = P.panel; x.beginPath(); x.arc(cx, cy, r * 0.42, 0, Math.PI * 2); x.fill();
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); const tw = x.measureText(v.label).width;
      x.fillStyle = P.bg; x.fillRect(px + pw / 2 - tw / 2 - sz * 0.5, py + ph * 0.86 - sz * 0.85, tw + sz, sz * 1.5);
      x.strokeStyle = P.fg; x.lineWidth = lw; x.strokeRect(px + pw / 2 - tw / 2 - sz * 0.5, py + ph * 0.86 - sz * 0.85, tw + sz, sz * 1.5);
      x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, px + pw / 2, py + ph * 0.86 - sz * 0.1); x.textAlign = 'left'; }
  },
  price(x, px, py, pw, ph, v, P){ // 가격표
    const w = Math.min(pw * 0.78, ph * 1.2), h = w * 0.46, l = px + (pw - w) / 2, t = py + (ph - h) / 2, n = h * 0.5, lw = this._lw(pw, ph);
    x.save(); x.translate(px + pw / 2, py + ph / 2); x.rotate(-0.06); x.translate(-(px + pw / 2), -(py + ph / 2));
    x.fillStyle = P.bg; x.strokeStyle = P.fg; x.lineWidth = lw;
    x.beginPath(); x.moveTo(l + n, t); x.lineTo(l + w, t); x.lineTo(l + w, t + h); x.lineTo(l + n, t + h); x.lineTo(l, t + h / 2); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.arc(l + n * 0.62, t + h / 2, h * 0.08, 0, Math.PI * 2); x.stroke();
    const sz = this._fit(x, v.text || '', 700, w - n * 1.5, h * 0.42);
    x.fillStyle = P.ac; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.text || '', l + n * 0.6 + (w - n * 0.6) / 2, t + h / 2 + sz * 0.04);
    x.restore(); x.textAlign = 'left';
  },
  phone(x, px, py, pw, ph, v, P){
    const s = Math.min(pw, ph) * 0.36, cx = px + pw / 2, cy = py + ph * 0.4, lw = this._lw(pw, ph);
    x.strokeStyle = P.fg; x.lineWidth = lw; x.fillStyle = P.bg;
    const w = s * 0.62, h = s * 1.1;
    x.beginPath(); x.roundRect ? x.roundRect(cx - w / 2, cy - h / 2, w, h, w * 0.14) : x.rect(cx - w / 2, cy - h / 2, w, h); x.fill(); x.stroke();
    x.fillStyle = P.ac; x.fillRect(cx - w * 0.12, cy + h * 0.36, w * 0.24, lw * 1.6);
    x.strokeStyle = P.ac; for (let i = 1; i <= 2; i++) { x.beginPath(); x.arc(cx + w * 0.5, cy - h * 0.38, s * 0.16 * i, -Math.PI * 0.35, Math.PI * 0.05); x.stroke(); }
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.1); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, cx, py + ph * 0.85); x.textAlign = 'left'; }
  },
  people(x, px, py, pw, ph, v, P){ // 대상·인원
    const n = Math.max(1, Math.min(5, v.n || 3)), r = Math.min(pw / (n * 3.2), ph * 0.12), cy = py + ph * 0.36, lw = this._lw(pw, ph);
    for (let i = 0; i < n; i++) {
      const cx = px + pw / 2 + (i - (n - 1) / 2) * r * 2.9;
      x.fillStyle = i === Math.floor(n / 2) ? P.ac : P.fg;
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(cx, cy + r * 3.1, r * 1.6, Math.PI, 0); x.fill();
    }
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, px + pw / 2, py + ph * 0.84); x.textAlign = 'left'; }
  },
  form(x, px, py, pw, ph, v, P){ // 신청·지원: 서류와 체크
    const h = Math.min(ph * 0.66, pw * 0.8), w = h * 0.76, l = px + (pw - w) / 2, t = py + ph * 0.1, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.strokeStyle = P.fg; x.lineWidth = lw; x.fillRect(l, t, w, h); x.strokeRect(l, t, w, h);
    for (let i = 0; i < 3; i++) {
      const yy = t + h * (0.24 + i * 0.24);
      x.strokeStyle = P.fg; x.strokeRect(l + w * 0.12, yy - w * 0.06, w * 0.12, w * 0.12);
      x.fillStyle = P.line; x.fillRect(l + w * 0.32, yy - lw / 2, w * 0.54, lw * 1.4);
      if (i < 2) { x.strokeStyle = P.ac; x.lineWidth = lw * 1.4; x.beginPath(); x.moveTo(l + w * 0.13, yy); x.lineTo(l + w * 0.17, yy + w * 0.05); x.lineTo(l + w * 0.26, yy - w * 0.07); x.stroke(); x.lineWidth = lw; }
    }
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, px + pw / 2, py + ph * 0.88); x.textAlign = 'left'; }
  }
};

/* ===== 재생·저장 ===== */
function sceneAt(scenes, t){
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) { if (t < acc + scenes[i].d) return { i, local: t - acc }; acc += scenes[i].d; }
  return { i: scenes.length - 1, local: scenes[scenes.length - 1].d };
}
const totalOf = scenes => scenes.reduce((a, s) => a + s.d, 0);
function pickMime(){
  const list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
