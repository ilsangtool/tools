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
  // 휴대폰 + 손
  const rise = 1 - easeOut((t - 0.1) / 0.7);
  const Hh = ph * (pw > ph * 1.3 ? 0.98 : 0.86), Ww = Hh * 0.47, cx = px + pw * (pw > ph * 1.3 ? 0.66 : 0.64), cy = py + ph * 0.58 + rise * ph * 0.25;
  const skin = '#E6B190', skinD = '#CF9474', sleeve = fire ? '#3B3A36' : K.tone(P.ac, -0.35);
  x.save(); x.translate(cx, cy); x.rotate(-0.09 + Math.sin(t * 0.9) * 0.008);
  // 소매·손목 (오른쪽 아래에서 들어옴)
  x.save(); x.rotate(0.5); x.fillStyle = sleeve; x.fillRect(-Ww * 0.2, Hh * 0.5, Ww * 1.1, Hh * 0.9);
  if (fire) { x.fillStyle = '#E8D44D'; x.fillRect(-Ww * 0.2, Hh * 0.62, Ww * 1.1, Hh * 0.035); x.fillStyle = '#C9CDD2'; x.fillRect(-Ww * 0.2, Hh * 0.655, Ww * 1.1, Hh * 0.025); x.fillStyle = '#E8D44D'; x.fillRect(-Ww * 0.2, Hh * 0.68, Ww * 1.1, Hh * 0.035); }
  x.restore();
  K.el(x, skinD, Ww * 0.05, Hh * 0.42, Ww * 0.62, Hh * 0.2); // 손바닥
  K.el(x, skin, Ww * 0.02, Hh * 0.4, Ww * 0.6, Hh * 0.19);
  // 오른쪽에서 감싼 손가락 (휴대폰 뒤)
  [-0.12, 0.0, 0.12, 0.23].forEach((fy, i) => { x.fillStyle = i % 2 ? skinD : skin; x.beginPath(); x.roundRect(Ww * 0.36, Hh * fy, Ww * 0.26, Hh * 0.075, Hh * 0.037); x.fill(); });
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
  // 왼쪽 엄지 (휴대폰 앞)
  x.save(); x.translate(l - Ww * 0.02, Hh * 0.2); x.rotate(-0.55);
  x.fillStyle = skinD; x.beginPath(); x.roundRect(-Ww * 0.08, -Hh * 0.02, Ww * 0.2, Hh * 0.22, Ww * 0.1); x.fill();
  x.fillStyle = skin; x.beginPath(); x.roundRect(-Ww * 0.09, -Hh * 0.03, Ww * 0.19, Hh * 0.2, Ww * 0.095); x.fill();
  x.fillStyle = '#F2C9AE'; x.beginPath(); x.roundRect(-Ww * 0.05, -Hh * 0.02, Ww * 0.1, Hh * 0.05, Ww * 0.05); x.fill(); // 손톱
  x.restore();
  x.restore();
};
