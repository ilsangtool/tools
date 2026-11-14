/* ===== 손에 든 휴대폰 장면 =====
   넣은 화면 캡처를 휴대폰 화면에 넣고, 손으로 들고 있는 모습을 그림. 뒤에는 내용에 맞는 배경
   (소방: 아파트 단지와 소방차 / 그 밖: 가게가 늘어선 거리). 소방 장면이면 소매에 반사띠가 있는 방화복 */
function isTallShot(m){
  if (!m || m.type !== 'image') return false;
  const w = m.el.naturalWidth, h = m.el.naturalHeight;
  return w && h && h / w > 1.6;
}
Graphics.handheld = function(x, px, py, pw, ph, v, P, t, media){
  const fire = v.bg === 'fire', K = ArtKit, drift = Math.min(1, t / 6) * pw * 0.02;
  // 배경
  const gy = py + ph * 0.8;
  x.save(); x.translate(-drift, 0);
  const bcol = mixHex(P.stage, P.fg, 0.1), wcol = mixHex(P.stage, P.fg, 0.2);
  const blds = fire ? [[0.02, 0.3, 0.2], [0.25, 0.18, 0.18], [0.46, 0.34, 0.2], [0.7, 0.22, 0.2], [0.93, 0.3, 0.14]] : [[0.0, 0.48, 0.24], [0.26, 0.4, 0.22], [0.5, 0.52, 0.24], [0.76, 0.44, 0.28]];
  blds.forEach(([l, top, w], i) => {
    const bx = px + pw * l, by = py + ph * top, bw = pw * w, bh = gy - by;
    x.fillStyle = bcol; x.fillRect(bx, by, bw, bh);
    const cols = fire ? 4 : 3, rows = Math.floor(bh / (ph * (fire ? 0.05 : 0.08)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = (r * 7 + c * 3 + i) % 5 === 0;
      x.fillStyle = lit ? P.ac : wcol; x.globalAlpha = lit ? 0.55 : 1;
      x.fillRect(bx + bw * (0.12 + c * 0.8 / cols), by + ph * 0.025 + r * bh / rows, bw * 0.12, ph * 0.018);
    }
    x.globalAlpha = 1;
    if (!fire) { x.fillStyle = i % 2 ? P.ac : mixHex(P.ac, P.stage, 0.4); x.fillRect(bx + bw * 0.08, gy - ph * 0.12, bw * 0.84, ph * 0.025); }
  });
  x.fillStyle = P.floor; x.fillRect(px - pw, gy, pw * 3, py + ph - gy);
  x.fillStyle = mixHex(P.floor, P.fg, 0.15); for (let k = 0; k < 8; k++) x.fillRect(px + pw * k * 0.16, gy + ph * 0.09, pw * 0.08, ph * 0.008);
  if (fire) { // 소방차
    const tw = pw * 0.5, th = ph * 0.17, tl = px + pw * 0.02, tt = gy - th + ph * 0.02, red = '#C8202F';
    x.fillStyle = red; x.fillRect(tl, tt + th * 0.18, tw, th * 0.66);
    x.fillStyle = K.tone(red, -0.2); x.fillRect(tl + tw * 0.74, tt, tw * 0.26, th * 0.84);
    x.fillStyle = '#BFD6E2'; x.fillRect(tl + tw * 0.79, tt + th * 0.1, tw * 0.17, th * 0.3);
    x.fillStyle = '#C9CDD2'; x.fillRect(tl + tw * 0.04, tt + th * 0.04, tw * 0.62, th * 0.08);
    for (let k = 0; k < 9; k++) x.fillRect(tl + tw * (0.06 + k * 0.068), tt, tw * 0.012, th * 0.16);
    x.fillStyle = '#F4F1EA'; x.fillRect(tl, tt + th * 0.5, tw, th * 0.07);
    for (let k = 0; k < 3; k++) { x.fillStyle = '#2B2D30'; x.fillRect(tl + tw * (0.05 + k * 0.17), tt + th * 0.25, tw * 0.13, th * 0.2); }
    [0.16, 0.42, 0.84].forEach(k => { K.el(x, '#1D1F22', tl + tw * k, tt + th * 0.86, th * 0.16, th * 0.16); K.el(x, '#8C929A', tl + tw * k, tt + th * 0.86, th * 0.07, th * 0.07); });
    const blink = Math.floor(t * 3) % 2;
    K.el(x, blink ? '#E63946' : '#3A6EA5', tl + tw * 0.82, tt - th * 0.02, th * 0.07, th * 0.05);
  }
  x.restore();
  // 휴대폰 + 손 (오른손: 손바닥은 휴대폰 뒤, 네 손가락 끝은 오른쪽 가장자리, 엄지는 왼쪽 가장자리 앞)
  const rise = 1 - easeOut((t - 0.1) / 0.7), wide = pw > ph * 1.3;
  const Hh = ph * (wide ? 0.86 : 0.78), Ww = Hh * 0.47, cx = px + pw * (wide ? 0.66 : 0.62), cy = py + ph * (wide ? 0.55 : 0.53) + rise * ph * 0.25;
  const skin = '#E2AD8B', skinD = '#C98E6C', skinL = '#EDC2A4', sleeve = fire ? '#3B3A36' : K.tone(P.ac, -0.35);
  x.save(); x.translate(cx, cy); x.rotate(-0.09 + Math.sin(t * 0.9) * 0.008);
  const W2 = Ww / 2, H2 = Hh / 2;
  // 소매: 손목 아래 오른쪽으로
  x.save(); x.translate(W2 * 0.35, H2 * 1.32); x.rotate(-0.35);
  x.fillStyle = sleeve; x.fillRect(-Ww * 0.42, 0, Ww * 0.95, Hh * 0.6);
  if (fire) { x.fillStyle = '#E8D44D'; x.fillRect(-Ww * 0.42, Hh * 0.07, Ww * 0.95, Hh * 0.028); x.fillStyle = '#C9CDD2'; x.fillRect(-Ww * 0.42, Hh * 0.098, Ww * 0.95, Hh * 0.02); x.fillStyle = '#E8D44D'; x.fillRect(-Ww * 0.42, Hh * 0.118, Ww * 0.95, Hh * 0.028); }
  else { x.fillStyle = K.tone(sleeve, -0.2); x.fillRect(-Ww * 0.42, 0, Ww * 0.95, Hh * 0.03); }
  x.restore();
  // 휴대폰 뒤 손: 손목·손바닥 + 오른쪽 가장자리로 나온 손가락 네 개 (한 덩어리 윤곽)
  const fx0 = W2 * 0.96, fingers = [[-0.16, 0.13], [0.0, 0.16], [0.16, 0.155], [0.31, 0.12]];
  x.fillStyle = skin; x.beginPath();
  x.moveTo(-W2 * 0.55, H2 * 1.45);
  x.bezierCurveTo(-W2 * 0.75, H2 * 1.1, -W2 * 0.6, H2 * 0.85, -W2 * 0.2, H2 * 0.8);
  x.lineTo(fx0, H2 * 0.75);
  x.bezierCurveTo(fx0 + W2 * 0.2, H2 * 0.72, fx0 + W2 * 0.18, H2 * 0.62, fx0, H2 * 0.58);
  for (let i = fingers.length - 1; i >= 0; i--) { // 아래 손가락부터 위로
    const [fy, len] = fingers[i], yb = fy * Hh + Hh * 0.075, ytp = fy * Hh - Hh * 0.062, out = fx0 + Ww * len;
    x.lineTo(fx0 + Ww * 0.02, yb);
    x.bezierCurveTo(out, yb + Hh * 0.006, out + Ww * 0.03, ytp + Hh * 0.01, fx0 + Ww * len * 0.55, ytp);
  }
  x.lineTo(fx0 - W2 * 0.1, fingers[0][0] * Hh - Hh * 0.07); x.lineTo(0, 0);
  x.lineTo(W2 * 0.9, H2 * 1.5); x.closePath(); x.fill();
  // 손가락 사이 주름과 손가락 끝 그늘
  x.strokeStyle = skinD; x.lineWidth = Math.max(2, Ww * 0.012); x.lineCap = 'round';
  fingers.forEach(([fy, len], i) => {
    if (i) { const y = fy * Hh - Hh * 0.065; x.beginPath(); x.moveTo(fx0 + Ww * 0.01, y); x.lineTo(fx0 + Ww * len * 0.5, y + Hh * 0.004); x.stroke(); }
  });
  // 휴대폰
  const r = Ww * 0.13, l = -Ww / 2, tp = -Hh / 2;
  x.fillStyle = '#16171A'; x.beginPath(); x.roundRect(l, tp, Ww, Hh, r); x.fill();
  const bz = Ww * 0.035, sl = l + bz, st = tp + bz, sw = Ww - bz * 2, sh = Hh - bz * 2;
  x.save(); x.beginPath(); x.roundRect(sl, st, sw, sh, r * 0.8); x.clip();
  x.fillStyle = '#FFFFFF'; x.fillRect(sl, st, sw, sh);
  const el = media && media.el, iw = el && el.naturalWidth, ih = el && el.naturalHeight;
  if (iw && ih) {
    const s = sw / iw, h = ih * s, f = Math.min(1, Math.max(0, (t - 1) / 4)), off = Math.max(0, h - sh) * (f * f * (3 - 2 * f)) * 0.35;
    x.drawImage(el, sl, st - off, sw, h);
  }
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.moveTo(sl, st); x.lineTo(sl + sw * 0.55, st); x.lineTo(sl, st + sh * 0.45); x.fill(); // 화면 반사
  x.restore();
  K.el(x, '#16171A', 0, tp + bz * 2.2, Ww * 0.045, Ww * 0.045); // 카메라 구멍
  // 왼쪽 엄지: 아래에서 올라와 휴대폰 왼쪽 가장자리 위에 얹힘. 손톱은 끝쪽, 엄지 방향으로
  const thumb = () => { x.beginPath();
    x.moveTo(-W2 * 1.22, H2 * 1.3);
    x.bezierCurveTo(-W2 * 1.2, H2 * 0.9, -W2 * 1.12, H2 * 0.45, -W2 * 0.98, H2 * 0.28);
    x.bezierCurveTo(-W2 * 0.88, H2 * 0.16, -W2 * 0.68, H2 * 0.18, -W2 * 0.66, H2 * 0.32);
    x.bezierCurveTo(-W2 * 0.64, H2 * 0.5, -W2 * 0.66, H2 * 0.78, -W2 * 0.6, H2 * 1.0);
    x.lineTo(-W2 * 0.56, H2 * 1.3); x.closePath(); };
  x.fillStyle = skin; thumb(); x.fill();
  x.save(); thumb(); x.clip(); // 바깥쪽 그늘
  x.fillStyle = skinD; x.beginPath(); x.ellipse(-W2 * 1.28, H2 * 0.9, W2 * 0.28, H2 * 0.75, 0, 0, Math.PI * 2); x.fill(); x.restore();
  x.save(); x.translate(-W2 * 0.82, H2 * 0.3); x.rotate(0.12);
  x.fillStyle = skinL; x.beginPath(); x.ellipse(0, 0, W2 * 0.12, H2 * 0.075, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = skinD; x.lineWidth = Math.max(1.5, Ww * 0.008); x.stroke(); x.restore();
  x.restore();
  x.restore();
};
