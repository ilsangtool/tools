/* ===== 장면 렌더러: 캔버스에 한 장면을 그림 =====
   장면 {d:초, kind:'text'|'visual'|'big'|'list'|'end', lines:[{t, role:'main'|'sub'|'accent'|'label'}], rows:[[라벨, 값]], visual:{media:번호}|{g:그림종류, ...}|null, align}
*/
const RATIOS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
// 색 조합: [이름, 배경, 글자, 강조]. 그림 바탕·선 색은 배경과 글자색을 섞어 자동으로 만듦
const PAL_GROUPS = [
  ['어두운 바탕', [['먹색', '#151515', '#FFFFFF', '#E8B04B'], ['숯회색', '#2B2D30', '#F5F5F5', '#7FC8A9'], ['남색', '#1A2B5F', '#FFFFFF', '#F2C94C'], ['밤하늘', '#0F1A2E', '#E8EEF7', '#6FA8FF'], ['숲', '#1F3B2D', '#F4F1EA', '#D7B56D'], ['와인', '#4A1622', '#FBEFEA', '#F0B27A'], ['초콜릿', '#3B2A20', '#F6EDE3', '#E3A857'], ['청록', '#0E3B43', '#EAF6F4', '#F4A261']]],
  ['밝은 바탕', [['크림', '#F3EEE5', '#2A2118', '#B5442C'], ['흰색', '#FFFFFF', '#1F1F1F', '#8C6A43'], ['종이', '#FAF7F0', '#222222', '#2F6F4F'], ['하늘', '#EAF3FB', '#14324F', '#E0533D'], ['민트', '#E8F5EF', '#173B2F', '#E07A1F'], ['살구', '#FCEDE4', '#3A2218', '#C2462A'], ['연노랑', '#FFF8DC', '#2B2610', '#C0392B'], ['연보라', '#F1EDF7', '#2A1F3D', '#6B4FA0'], ['회색', '#EDEEF0', '#1D1F22', '#C8102E']]],
  ['선명한 바탕', [['빨강', '#C8102E', '#FFFFFF', '#FFE08A'], ['주황', '#E8631C', '#FFFFFF', '#1D1F22'], ['노랑', '#F6C744', '#1D1F22', '#B0213E'], ['초록', '#2E7D4F', '#FFFFFF', '#FFE08A'], ['파랑', '#1F5FBF', '#FFFFFF', '#FFD54A'], ['분홍', '#F4C6CF', '#3A1620', '#B0213E'], ['검정·빨강', '#111111', '#FFFFFF', '#E63946']]]
];
function hex2rgb(h){ const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixHex(a, b, k){ const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
function lum(h){ return hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b){ const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function makePalette(id, name, bg, fg, ac){
  // stage: 그림 칸 바탕(배경에 강조색을 조금), floor: 그림자
  const dark = lum(bg) < 0.25;
  return { id, name, bg, fg, ac, panel: mixHex(bg, fg, 0.08), line: mixHex(bg, fg, 0.2), stage: mixHex(bg, ac, dark ? 0.16 : 0.13), floor: mixHex(mixHex(bg, ac, dark ? 0.16 : 0.13), '#000000', dark ? 0.28 : 0.1) };
}
const PALETTES = [];
PAL_GROUPS.forEach(([g, list]) => list.forEach(([n, bg, fg, ac]) => PALETTES.push(Object.assign(makePalette('p' + PALETTES.length, n, bg, fg, ac), { group: g }))));

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
    if (r === '16:9') return { panel: [W * 0.06, H * 0.12, W * 0.46, H * 0.76], text: [W * 0.57, H * 0.1, W * 0.37, H * 0.8], textOnly: [W * 0.1, H * 0.12, W * 0.8, H * 0.76], u: H / 100 };
    if (r === '1:1') return { panel: [W * 0.08, H * 0.08, W * 0.84, H * 0.48], text: [W * 0.08, H * 0.6, W * 0.84, H * 0.34], textOnly: [W * 0.09, H * 0.1, W * 0.82, H * 0.8], u: W / 100 };
    return { panel: [W * 0.09, H * 0.12, W * 0.82, H * 0.42], text: [W * 0.09, H * 0.58, W * 0.82, H * 0.22], textOnly: [W * 0.09, H * 0.12, W * 0.82, H * 0.7], u: W / 100 };
  }
  /* 그림이 있는 장면: 그림은 화면 끝까지 꽉 채우고 글은 남은 칸에. 첫·끝 장면은 위아래(좌우)를 바꿔 단조롭지 않게 */
  frame(sc){
    const W = this.W, H = this.H, r = this.ratio, flip = sc.role === 'hook' || sc.role === 'end';
    if (r === '16:9') return flip ? { art: [0, 0, W * 0.5, H], text: [W * 0.56, H * 0.14, W * 0.38, H * 0.72] } : { art: [W * 0.5, 0, W * 0.5, H], text: [W * 0.06, H * 0.14, W * 0.38, H * 0.72] };
    const ah = r === '1:1' ? 0.56 : 0.56;
    return flip ? { art: [0, H * (1 - ah), W, H * ah], text: [W * 0.08, H * 0.07, W * 0.84, H * (1 - ah) - H * 0.12], top: true }
      : { art: [0, 0, W, H * ah], text: [W * 0.08, H * (ah + 0.05), W * 0.84, H * (1 - ah) - H * 0.11] };
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
    const k = vis ? 1.22 : 1.3; // 그림 없는 장면은 글자를 더 크게
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
      this._k = k;
      if (h <= box[3] && res.every(r => r.rows.length <= 4) && (!this._broke || tries >= 8)) return { res, h }; // 낱말 중간이 잘리면 글자를 줄여 다시
    }
    return { res, h: res.reduce((a, r) => Math.max(a, r.top + r.rows.length * r.sz * 1.3), 0) };
  }
  // 점검용: 글이 칸에 들어가는지, 얼마나 줄였는지
  measure(sc){
    if (sc.kind === 'list') { const n = sc.rows.length; return { fit: n <= 7, k: 1 }; }
    const box = sc.visual ? this.frame(sc).text : this.geo().textOnly, r = this.layoutText(sc.lines, box, sc.kind, sc.align, !!sc.visual);
    return { fit: r.h <= box[3] + 1 && !r.res.some(x => x.rows.length > 4), k: this._k };
  }
  draw(sc, local, P){
    const x = this.x, W = this.W, H = this.H, g = this.geo();
    x.setTransform(this.s, 0, 0, this.s, 0, 0);
    x.fillStyle = P.bg; x.fillRect(0, 0, W, H);
    const hasVis = !!sc.visual, F = hasVis ? this.frame(sc) : null;
    if (hasVis) this.drawVisual(sc.visual, F.art, local, sc.d, P);
    const box = hasVis ? F.text : g.textOnly;
    if (sc.kind === 'list') { this.drawList(sc, box, local, P, g); return this.drawProg(P); }
    const { res, h } = this.layoutText(sc.lines, box, sc.kind, sc.align, hasVis);
    const center = sc.align === 'center';
    const vertical = hasVis ? (F.top ? 0.6 : this.ratio === '16:9' ? 0.5 : 0.3) : 0.5;
    const y0 = box[1] + (box[3] - h) * vertical;
    const tx = center ? box[0] + box[2] / 2 : box[0];
    // 글 위 짧은 강조선
    const bar = easeOut((local - 0.15) / 0.5), bw = g.u * 10, bh = Math.max(4, g.u * 0.7);
    x.fillStyle = P.ac; x.fillRect(center ? tx - bw * bar / 2 : tx, y0 - g.u * 4, bw * bar, bh);
    // 줄마다 아래에서 밀려 올라오며 나타남 (가림막 안에서)
    let n = 0;
    res.forEach(r => {
      x.font = `${r.w} ${r.sz}px ${FONT}`;
      x.fillStyle = r.l.role === 'accent' || r.l.role === 'label' ? P.ac : P.fg;
      x.textBaseline = 'top'; x.textAlign = center ? 'center' : 'left';
      r.rows.forEach((row, j) => {
        const lh = r.sz * 1.3, y = y0 + r.top + j * lh, a = easeOut((local - 0.2 - n++ * 0.09) / 0.45);
        if (a <= 0) return;
        x.save(); x.beginPath(); x.rect(0, y - lh * 0.1, W, lh * 1.12); x.clip();
        x.globalAlpha = Math.min(1, a * 1.4); x.fillText(row, tx, y + (1 - a) * lh * 0.9); x.restore();
      });
    });
    x.globalAlpha = 1; x.textAlign = 'left';
    this.drawProg(P);
  }
  // 아래쪽 진행 막대 (전체 영상 기준)
  drawProg(P){
    if (this.prog == null) return;
    const x = this.x, h = Math.max(6, this.H * 0.005);
    x.globalAlpha = 0.25; x.fillStyle = P.fg; x.fillRect(0, this.H - h, this.W, h);
    x.globalAlpha = 1; x.fillStyle = P.ac; x.fillRect(0, this.H - h, this.W * Math.min(1, this.prog), h);
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
    const x = this.x, [px, py, pw, ph] = p, k = easeOut(local / 0.5), dir = (this.idx || 0) % 2;
    x.save();
    x.beginPath(); // 장면이 바뀔 때 그림 칸이 옆에서 밀려 열림
    if (dir) x.rect(px + pw * (1 - k), py, pw * k, ph); else x.rect(px, py, pw * k, ph);
    x.clip();
    x.fillStyle = P.stage; x.fillRect(px, py, pw, ph);
    const z = 1 + 0.06 * Math.min(1, local / Math.max(1, d)); // 장면 내내 아주 느리게 다가감
    if (v.g === 'handheld') Graphics.handheld(x, px, py, pw, ph, v, P, local, this.media[v.media]);
    else if (v.media != null && this.media[v.media]) {
      const m = this.media[v.media], el = m.el;
      const iw = m.type === 'video' ? el.videoWidth : el.naturalWidth, ih = m.type === 'video' ? el.videoHeight : el.naturalHeight;
      if (iw && ih && v.detail != null) {
        // 같은 사진의 다른 부분을 가까이: 긴 화면 캡처는 폭의 1.5배, 보통 사진은 1.6배로 키우고 초점을 바꿔 가며 천천히 이동
        const tall = ih / iw > (ph / pw) * 1.5, sc0 = tall ? pw * 1.5 / iw : Math.max(pw / iw, ph / ih) * 1.6, w = iw * sc0, h = ih * sc0;
        const F = v.fx != null ? [v.fx, v.fy] : [[0.5, 0.5], [0.3, 0.32], [0.7, 0.72], [0.45, 0.25]][v.detail % 4], mv = 0.04 * Math.min(1, local / Math.max(1, d));
        const cx = Math.min(w - pw, Math.max(0, w * (F[0] + mv) - pw / 2)), cy = Math.min(h - ph, Math.max(0, h * (F[1] + mv) - ph / 2));
        x.drawImage(el, px - cx, py - cy, w, h);
      } else if (iw && ih && ih / iw > (ph / pw) * 1.5) {
        // 휴대폰 화면 캡처처럼 아주 긴 그림: 자르지 않고 폭에 맞춰 위에서 아래로 천천히 훑음
        const w = Math.min(pw * 0.8, ph * 0.9 * iw / ih * 2.2), h = ih * w / iw, l = px + (pw - w) / 2;
        const f = Math.min(1, Math.max(0, (local - 0.6) / Math.max(1, d - 1.2))), ease = f * f * (3 - 2 * f);
        const top = py + ph * 0.06 - (h - ph * 0.88) * ease;
        x.fillStyle = P.floor; x.fillRect(l + 10, top + 10, w, h);
        x.drawImage(el, l, top, w, h);
        x.strokeStyle = P.line; x.lineWidth = 2; x.strokeRect(l, top, w, h);
      } else if (iw && ih) { const s = Math.max(pw / iw, ph / ih) * z, w = iw * s, h = ih * s; x.drawImage(el, px + (pw - w) / 2, py + (ph - h) / 2, w, h); }
    } else if (Graphics[v.g]) {
      x.translate(px + pw / 2, py + ph / 2); x.scale(z, z); x.translate(-(px + pw / 2), -(py + ph / 2));
      Graphics[v.g](x, px, py, pw, ph, v, P, local);
    }
    x.restore();
    // 열리는 가장자리를 따라가는 강조색 띠
    if (k < 1) { const ew = Math.max(8, pw * 0.02) * (1 - k); x.fillStyle = P.ac; x.fillRect(dir ? px + pw * (1 - k) - ew : px + pw * k, py, ew, ph); }
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
  calendar(x, px, py, pw, ph, v, P, tm){
    const f = easeOut((tm - 0.2) / 0.5); if (f <= 0) return;
    x.save(); x.translate(0, py + ph * 0.13); x.scale(1, 0.2 + 0.8 * f); x.translate(0, -(py + ph * 0.13));
    const s = Math.min(pw, ph) * 0.66, cx = px + pw / 2, cy = py + ph / 2, w = s * 0.86, h = s, l = cx - w / 2, t = cy - h / 2, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.fillRect(l, t, w, h);
    x.strokeStyle = P.fg; x.lineWidth = lw; x.strokeRect(l, t, w, h);
    x.fillStyle = P.ac; x.fillRect(l, t, w, h * 0.24);
    x.fillStyle = P.fg; [0.3, 0.7].forEach(k => x.fillRect(l + w * k - lw, t - h * 0.06, lw * 2, h * 0.12)); // 고리
    x.textAlign = 'center'; x.textBaseline = 'middle';
    this._font(x, 700, h * 0.12); x.fillStyle = P.bg; x.fillText(v.month ? v.month + '월' : '', cx, t + h * 0.12);
    this._font(x, 700, h * 0.42); x.fillStyle = P.fg; x.fillText(v.day || '', cx, t + h * 0.56);
    if (v.week) { this._font(x, 400, h * 0.09); x.fillText(v.week, cx, t + h * 0.86); }
    x.textAlign = 'left'; x.restore();
  },
  clock(x, px, py, pw, ph, v, P, t){
    const r = Math.min(pw, ph) * 0.3, cx = px + pw / 2, cy = py + ph * 0.44, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = P.fg; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.sin(a) * r * 0.82, cy - Math.cos(a) * r * 0.82); x.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92); x.stroke(); }
    const hh = (v.h || 9) % 12, mm = v.m || 0, f = easeOut((t - 0.2) / 1.1), ha = (hh + mm / 60) / 12 * Math.PI * 2 * f, ma = (mm / 60 * Math.PI * 2 + Math.PI * 4 * (1 - f));
    x.lineCap = 'round';
    x.strokeStyle = P.fg; x.lineWidth = lw * 1.6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(ha) * r * 0.5, cy - Math.cos(ha) * r * 0.5); x.stroke();
    x.strokeStyle = P.ac; x.lineWidth = lw * 1.2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(ma) * r * 0.75, cy - Math.cos(ma) * r * 0.75); x.stroke();
    x.lineCap = 'butt';
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, cx, py + ph * 0.88 - sz * 0.2); x.textAlign = 'left'; }
  },
  pin(x, px, py, pw, ph, v, P, t){ // 위치: 길 + 블록 + 핀
    const lw = this._lw(pw, ph), rw = Math.min(pw, ph) * 0.07;
    x.fillStyle = mixHex(P.stage, P.fg, 0.06);
    [[0.04, 0.06, 0.24, 0.48], [0.52, 0.04, 0.44, 0.36], [0.04, 0.74, 0.34, 0.24], [0.52, 0.66, 0.44, 0.32]].forEach(b => x.fillRect(px + pw * b[0], py + ph * b[1], pw * b[2], ph * b[3]));
    x.strokeStyle = P.line; x.lineWidth = rw;
    x.beginPath(); x.moveTo(px, py + ph * 0.66); x.lineTo(px + pw, py + ph * 0.56); x.stroke();
    x.beginPath(); x.moveTo(px + pw * 0.36, py); x.lineTo(px + pw * 0.46, py + ph); x.stroke();
    x.strokeStyle = mixHex(P.line, P.fg, 0.3); x.lineWidth = Math.max(2, rw * 0.08); x.setLineDash([rw * 0.5, rw * 0.5]);
    x.beginPath(); x.moveTo(px, py + ph * 0.66); x.lineTo(px + pw, py + ph * 0.56); x.stroke(); x.setLineDash([]);
    const r = Math.min(pw, ph) * 0.13, cx = px + pw * 0.6, base = py + ph * 0.38, f = easeOut((t - 0.25) / 0.45), cy = base - (1 - f) * ph * 0.4;
    const rp = ((t - 0.7) % 1.6) / 1.6; // 꽂힌 자리 물결
    if (t > 0.7) { x.strokeStyle = P.ac; x.lineWidth = lw; x.globalAlpha = (1 - rp) * 0.8; x.beginPath(); x.ellipse(cx, base + r * 2.2, r * (0.4 + rp * 1.4), r * (0.15 + rp * 0.5), 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; }
    x.fillStyle = P.floor; x.beginPath(); x.ellipse(cx, base + r * 2.2, r * 0.5 * f, r * 0.18 * f, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = P.ac; x.beginPath(); x.arc(cx, cy, r, Math.PI, 0); x.lineTo(cx, cy + r * 2.2); x.closePath(); x.fill();
    x.fillStyle = P.stage; x.beginPath(); x.arc(cx, cy, r * 0.42, 0, Math.PI * 2); x.fill();
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); const tw = x.measureText(v.label).width;
      x.fillStyle = P.bg; x.fillRect(px + pw / 2 - tw / 2 - sz * 0.5, py + ph * 0.86 - sz * 0.85, tw + sz, sz * 1.5);
      x.strokeStyle = P.fg; x.lineWidth = lw; x.strokeRect(px + pw / 2 - tw / 2 - sz * 0.5, py + ph * 0.86 - sz * 0.85, tw + sz, sz * 1.5);
      x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, px + pw / 2, py + ph * 0.86 - sz * 0.1); x.textAlign = 'left'; }
  },
  price(x, px, py, pw, ph, v, P, tm){ // 가격표
    const w = Math.min(pw * 0.78, ph * 1.2), h = w * 0.46, l = px + (pw - w) / 2, t = py + (ph - h) / 2, n = h * 0.5, lw = this._lw(pw, ph);
    x.save(); x.translate(px + pw / 2, py + ph / 2); x.rotate(-0.06 - 0.12 * (1 - easeOut(tm / 0.6))); x.translate(-(px + pw / 2), -(py + ph / 2));
    x.fillStyle = P.bg; x.strokeStyle = P.fg; x.lineWidth = lw;
    x.beginPath(); x.moveTo(l + n, t); x.lineTo(l + w, t); x.lineTo(l + w, t + h); x.lineTo(l + n, t + h); x.lineTo(l, t + h / 2); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.arc(l + n * 0.62, t + h / 2, h * 0.08, 0, Math.PI * 2); x.stroke();
    const sz = this._fit(x, v.text || '', 700, w - n * 1.5, h * 0.42);
    const num = +(String(v.text || '').match(/[\d,]+/) || [''])[0].replace(/,/g, ''), f = easeOut((tm - 0.2) / 0.8);
    const shown = num && f < 1 ? String(v.text).replace(/[\d,]+/, Math.round(num * f / (num >= 1000 ? 100 : 1)) * (num >= 1000 ? 100 : 1) === 0 ? '0' : (Math.round(num * f / (num >= 1000 ? 100 : 1)) * (num >= 1000 ? 100 : 1)).toLocaleString('ko-KR')) : (v.text || '');
    x.fillStyle = P.ac; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(shown, l + n * 0.6 + (w - n * 0.6) / 2, t + h / 2 + sz * 0.04);
    x.restore(); x.textAlign = 'left';
  },
  phone(x, px, py, pw, ph, v, P, t){
    const s = Math.min(pw, ph) * 0.36, cx = px + pw / 2, cy = py + ph * 0.4, lw = this._lw(pw, ph), ring = (t % 1.6) < 0.5 && t > 0.3;
    x.save(); x.translate(cx, cy); x.rotate(ring ? Math.sin(t * 40) * 0.06 : 0); x.translate(-cx, -cy);
    x.strokeStyle = P.fg; x.lineWidth = lw; x.fillStyle = P.bg;
    const w = s * 0.62, h = s * 1.1;
    x.beginPath(); x.roundRect ? x.roundRect(cx - w / 2, cy - h / 2, w, h, w * 0.14) : x.rect(cx - w / 2, cy - h / 2, w, h); x.fill(); x.stroke();
    x.fillStyle = P.ac; x.fillRect(cx - w * 0.12, cy + h * 0.36, w * 0.24, lw * 1.6);
    x.strokeStyle = P.ac; for (let i = 1; i <= 2; i++) { x.globalAlpha = ring || t < 0.3 ? 1 : 0.35; x.beginPath(); x.arc(cx + w * 0.5, cy - h * 0.38, s * 0.16 * i, -Math.PI * 0.35, Math.PI * 0.05); x.stroke(); } x.globalAlpha = 1; x.restore();
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.1); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, cx, py + ph * 0.85); x.textAlign = 'left'; }
  },
  people(x, px, py, pw, ph, v, P, t){ // 대상·인원
    const n = Math.max(1, Math.min(5, v.n || 3)), r = Math.min(pw / (n * 3.2), ph * 0.12), cy = py + ph * 0.36, lw = this._lw(pw, ph);
    for (let i = 0; i < n; i++) {
      const cx = px + pw / 2 + (i - (n - 1) / 2) * r * 2.9;
      const f = easeOut((t - 0.2 - i * 0.12) / 0.4); if (f <= 0) continue;
      x.fillStyle = i === Math.floor(n / 2) ? P.ac : P.fg; x.globalAlpha = f;
      const dy = (1 - f) * r * 1.5;
      x.beginPath(); x.arc(cx, cy + dy, r, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(cx, cy + r * 3.1 + dy, r * 1.6, Math.PI, 0); x.fill(); x.globalAlpha = 1;
    }
    if (v.label) { const sz = this._fit(x, v.label, 700, pw * 0.86, ph * 0.09); x.fillStyle = P.fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.label, px + pw / 2, py + ph * 0.84); x.textAlign = 'left'; }
  },
  form(x, px, py, pw, ph, v, P, tm){ // 신청·지원: 서류와 체크
    const h = Math.min(ph * 0.66, pw * 0.8), w = h * 0.76, l = px + (pw - w) / 2, t = py + ph * 0.1, lw = this._lw(pw, ph);
    x.fillStyle = P.bg; x.strokeStyle = P.fg; x.lineWidth = lw; x.fillRect(l, t, w, h); x.strokeRect(l, t, w, h);
    for (let i = 0; i < 3; i++) {
      const yy = t + h * (0.24 + i * 0.24);
      x.strokeStyle = P.fg; x.strokeRect(l + w * 0.12, yy - w * 0.06, w * 0.12, w * 0.12);
      x.fillStyle = P.line; x.fillRect(l + w * 0.32, yy - lw / 2, w * 0.54, lw * 1.4);
      if (i < 2 && tm > 0.4 + i * 0.35) { x.strokeStyle = P.ac; x.lineWidth = lw * 1.4; x.beginPath(); x.moveTo(l + w * 0.13, yy); x.lineTo(l + w * 0.17, yy + w * 0.05); x.lineTo(l + w * 0.26, yy - w * 0.07); x.stroke(); x.lineWidth = lw; }
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
