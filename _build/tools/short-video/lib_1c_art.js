/* ===== 사진이 없을 때 직접 그리는 그림 =====
   모든 그림은 100×100 칸 안에 그림(바닥선 y=84). 재료 색(빵·컵·화분 등)은 실제 색을 쓰고, 포인트는 고른 색 조합의 강조색.
   t: 장면 시작 뒤 지난 초. 김·꽃·깃발처럼 원래 움직이는 것만 천천히 움직임 */
const ArtKit = {
  tone(c, k){ return k >= 0 ? mixHex(c, '#FFFFFF', k) : mixHex(c, '#000000', -k); },
  rr(x, c, a, b, w, h, r){ x.fillStyle = c; x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r || 0); else x.rect(a, b, w, h); x.fill(); },
  el(x, c, cx, cy, rx, ry, a0, a1){ x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, a0 || 0, a1 == null ? Math.PI * 2 : a1); x.fill(); },
  pg(x, c, pts){ x.fillStyle = c; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); },
  ln(x, c, w, pts, cap){ x.strokeStyle = c; x.lineWidth = w; x.lineCap = cap || 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke(); },
  ground(x, P, w){ this.el(x, P.floor, 50, 84, w || 36, 4.5); },
  steam(x, P, t, xs, top){
    xs.forEach((sx, i) => {
      const pts = []; for (let k = 0; k <= 12; k++) { const yy = top - k * 1.6; pts.push([sx + Math.sin(k * 0.7 + t * 2.2 + i * 2) * 2.2, yy]); }
      x.globalAlpha *= 0.55; this.ln(x, P.fg, 1.6, pts); x.globalAlpha /= 0.55;
    });
  }
};

const ART = {
  bread(x, P){ const K = ArtKit, crust = '#C8833A', dark = '#99581F', light = '#E9B56B';
    K.ground(x, P, 40);
    K.rr(x, dark, 14, 60, 50, 24, 8); K.rr(x, crust, 14, 52, 50, 28, 9); K.el(x, crust, 39, 54, 25, 15);
    x.globalAlpha *= 0.7; K.ln(x, light, 3, [[20, 52], [24, 45], [32, 41]]); x.globalAlpha /= 0.7;
    for (let i = 0; i < 9; i++) K.el(x, dark, 20 + (i * 37) % 40, 62 + (i * 13) % 14, 0.6, 0.4);
    [[27, 43, 33, 55], [37, 41, 43, 54], [47, 43, 53, 55]].forEach(([a, b, c, d]) => K.ln(x, light, 2.6, [[a, b], [c, d]]));
    // 크루아상: 마디 다섯 개
    [[-0.9, 0.62], [-0.45, 0.86], [0, 1], [0.45, 0.86], [0.9, 0.62]].forEach(([a, s], i) => {
      x.save(); x.translate(76, 75); x.rotate(a); K.el(x, i % 2 ? light : crust, 0, -10, 6 * s + 1.5, 7 * s + 2); K.ln(x, dark, 1, [[-5 * s, -10], [5 * s, -10]]); x.restore();
    });
  },
  cake(x, P){ const K = ArtKit;
    K.ground(x, P, 38); K.el(x, '#F4F1EA', 50, 82, 36, 5.5); K.el(x, '#DCD6CB', 50, 83.5, 30, 3.5);
    K.rr(x, '#E9C98F', 22, 52, 56, 28, 3); K.rr(x, '#FFFFFF', 22, 63, 56, 5); K.rr(x, '#D9B074', 22, 74, 56, 6, [0, 0, 3, 3]);
    K.rr(x, '#FFF8F0', 20, 45, 60, 9, 4);
    for (let i = 0; i < 6; i++) K.el(x, '#FFF8F0', 25 + i * 10, 54, 3.4, 3.4 + (i % 2) * 1.6, 0, Math.PI);
    [[34, 40], [50, 38], [66, 40]].forEach(([cx, cy]) => { K.el(x, '#D7263D', cx, cy, 5, 5.5); K.el(x, '#F26A6A', cx - 1.6, cy - 1.8, 1.6, 1.4); K.pg(x, '#3F7D4E', [[cx - 3, cy - 5], [cx, cy - 8], [cx + 3, cy - 5]]); });
  },
  coffee(x, P, t){ const K = ArtKit;
    K.ground(x, P, 38); K.el(x, '#E6E0D5', 50, 81, 32, 5.5); K.el(x, '#F6F2EA', 50, 79.5, 30, 4.5);
    K.ln(x, '#E2DCD0', 4, [[69, 53], [79, 55], [78, 66], [67, 70]]);
    K.pg(x, '#FAF7F2', [[27, 44], [73, 44], [67, 78], [33, 78]]); K.pg(x, '#E7E1D6', [[60, 44], [73, 44], [67, 78], [58, 78]]);
    x.save(); x.beginPath(); x.moveTo(27, 44); x.lineTo(73, 44); x.lineTo(67, 78); x.lineTo(33, 78); x.closePath(); x.clip();
    K.rr(x, P.ac, 20, 56, 60, 11); K.rr(x, K.tone(P.ac, -0.18), 60, 56, 20, 11); x.restore();
    K.el(x, '#FAF7F2', 50, 44, 23, 4.2); K.el(x, '#6B4226', 50, 44.4, 20.5, 3.2); K.el(x, '#8A5A37', 46, 44, 6, 1.2);
    K.steam(x, P, t, [42, 50, 58], 38);
  },
  bowl(x, P, t){ const K = ArtKit, b = P.ac, bd = K.tone(P.ac, -0.25);
    K.ground(x, P, 38); K.steam(x, P, t, [40, 50, 60], 44);
    K.rr(x, bd, 40, 76, 20, 6, 2);
    K.el(x, b, 50, 56, 36, 26, 0, Math.PI); K.el(x, bd, 62, 60, 18, 18, 0, Math.PI * 0.5);
    K.el(x, b, 50, 56, 36, 6.5); K.el(x, bd, 50, 56.5, 32.5, 5); K.el(x, '#E4B86A', 50, 57, 31, 4.2);
    for (let i = 0; i < 6; i++) { const pts = []; for (let k = 0; k <= 10; k++) pts.push([24 + k * 5.2, 56 + Math.sin(k * 1.3 + i) * 1.4 + (i - 2.5) * 0.5]); K.ln(x, '#F7E4B8', 1.4, pts); }
    K.el(x, '#FFFFFF', 36, 54, 6, 3.4); K.el(x, '#F2A93B', 36, 54, 2.8, 1.8);
    [[56, 54], [61, 55.5], [66, 54.5], [59, 53]].forEach(([cx, cy]) => K.el(x, '#5FA35A', cx, cy, 1.6, 1.1));
    K.ln(x, '#8B5A2B', 2.4, [[58, 30], [86, 52]]); K.ln(x, '#A9713C', 2.4, [[63, 27], [89, 49]]);
  },
  dish(x, P, t){ const K = ArtKit, up = easeOut((t - 0.5) / 0.9) * 13;
    K.ground(x, P, 40); K.el(x, '#DCD6CB', 50, 80, 38, 6.5); K.el(x, '#F4F1EA', 50, 78.5, 36, 5.5);
    K.el(x, '#B5552B', 50, 74, 20, 7, Math.PI, 0); K.el(x, '#D9822B', 46, 72, 12, 5); K.el(x, '#F2B84B', 42, 70.5, 5, 2.2);
    [[60, 72], [56, 70], [64, 73]].forEach(([cx, cy]) => K.el(x, '#4E9A55', cx, cy, 2.6, 1.6));
    x.save(); x.translate(0, -up);
    K.el(x, '#B9BEC5', 50, 76, 31, 28, Math.PI, 0); K.el(x, '#D7DBE0', 44, 70, 16, 18, Math.PI, Math.PI * 1.6);
    K.rr(x, '#9097A0', 19, 74.5, 62, 3.5, 1.5); K.el(x, '#9097A0', 50, 46, 4, 3); x.restore();
  },
  flower(x, P, t){ const K = ArtKit;
    K.ground(x, P, 28);
    [[-9, 34, 0], [0, 26, 1], [10, 36, 2]].forEach(([dx, top, i]) => {
      const sw = Math.sin(t * 1.4 + i) * 1.6, tx = 50 + dx + sw;
      K.ln(x, '#3F7D4E', 2, [[50 + dx * 0.4, 62], [50 + dx * 0.8 + sw * 0.5, (62 + top) / 2], [tx, top]]);
      K.el(x, '#4E9A55', 50 + dx * 0.6 + 4, 50, 4.5, 2);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + i; K.el(x, i === 1 ? P.ac : K.tone(P.ac, 0.3), tx + Math.cos(a) * 4.4, top + Math.sin(a) * 4.4, 3.8, 3.8); }
      K.el(x, '#F6D365', tx, top, 2.6, 2.6);
    });
    K.pg(x, '#C8693F', [[35, 62], [65, 62], [61, 84], [39, 84]]); K.pg(x, '#AE5833', [[55, 62], [65, 62], [61, 84], [53, 84]]); K.rr(x, '#B25A33', 32, 60, 36, 6, 1.5);
  },
  shirt(x, P, t){ const K = ArtKit, a = Math.sin(t * 1.2) * 0.03, c = P.ac, cd = K.tone(P.ac, -0.22);
    x.save(); x.translate(50, 16); x.rotate(a); x.translate(-50, -16);
    K.ln(x, '#7A7F87', 2, [[50, 22], [50, 18], [53, 15], [50, 12], [47, 14]]);
    K.ln(x, '#7A7F87', 2.4, [[22, 34], [50, 22], [78, 34]]);
    K.pg(x, c, [[34, 30], [42, 27], [50, 32], [58, 27], [66, 30], [82, 42], [76, 52], [67, 47], [67, 82], [33, 82], [33, 47], [24, 52], [18, 42]]);
    K.pg(x, cd, [[58, 30], [66, 30], [82, 42], [76, 52], [67, 47], [67, 82], [58, 82]]);
    K.el(x, cd, 50, 30, 7, 4, 0, Math.PI); K.ln(x, K.tone(P.ac, 0.2), 1, [[40, 50], [44, 76]]);
    x.restore(); K.ground(x, P, 22);
  },
  beauty(x, P, t){ const K = ArtKit, o = 0.22 + Math.sin(t * 2) * 0.06;
    K.ground(x, P, 36);
    K.rr(x, K.tone(P.ac, -0.15), 58, 30, 9, 50, 2); for (let i = 0; i < 9; i++) K.rr(x, K.tone(P.ac, -0.15), 52, 34 + i * 5, 7, 2.4, 1);
    [[-o, 0], [o, 1]].forEach(([r, i]) => {
      x.save(); x.translate(38, 54); x.rotate(r);
      K.pg(x, i ? '#AEB4BC' : '#C9CDD2', [[-2, 0], [2, 0], [1, -34], [-0.5, -32]]);
      x.lineWidth = 3; x.strokeStyle = P.ac; x.beginPath(); x.ellipse(i ? 5 : -5, 12, 5, 7, 0, 0, Math.PI * 2); x.stroke();
      K.ln(x, P.ac, 3, [[0, 0], [i ? 3 : -3, 5]]); x.restore();
    });
    K.el(x, '#6B7078', 38, 54, 1.4, 1.4);
  },
  fitness(x, P, t){ const K = ArtKit, lift = Math.abs(Math.sin(t * 1.8)) * 4;
    K.ground(x, P, 40); K.rr(x, K.tone(P.ac, 0.45), 12, 80, 76, 4, 2);
    const bell = (cx, cy, s) => { K.rr(x, '#8C929A', cx - 18 * s, cy - 1.6 * s, 36 * s, 3.2 * s, 1); [-1, 1].forEach(d => { K.rr(x, K.tone(P.ac, -0.2), cx + d * 12 * s - 3 * s, cy - 9 * s, 6 * s, 18 * s, 1.5); K.rr(x, P.ac, cx + d * 16 * s - 2 * s, cy - 7 * s, 4 * s, 14 * s, 1.5); }); };
    bell(50, 52 - lift, 1.3); bell(70, 74, 0.7);
  },
  books(x, P){ const K = ArtKit;
    K.ground(x, P, 38);
    [[20, 70, 60, P.ac], [24, 60, 54, '#3E5C76'], [18, 50, 58, K.tone(P.ac, -0.3)]].forEach(([l, y, w, c]) => { K.rr(x, c, l, y, w, 10, 1.5); K.rr(x, '#F6F2EA', l + w - 6, y + 2, 5, 6); K.rr(x, K.tone(c, 0.25), l + 4, y + 4, w * 0.4, 1.6); });
    x.save(); x.translate(54, 40); x.rotate(-0.5); K.rr(x, '#F2C14E', -16, -2.5, 30, 5); K.pg(x, '#F1D9B5', [[14, -2.5], [20, 0], [14, 2.5]]); K.pg(x, '#3A3A3A', [[18.4, -0.8], [20, 0], [18.4, 0.8]]); K.rr(x, '#E58A9A', -19, -2.5, 3.5, 5); x.restore();
  },
  market(x, P, t){ const K = ArtKit, wood = '#9A6B43';
    K.ground(x, P, 44);
    K.rr(x, wood, 16, 30, 3, 54); K.rr(x, wood, 81, 30, 3, 54);
    const n = 8, w = 72 / n;
    for (let i = 0; i < n; i++) { K.rr(x, i % 2 ? '#FFFFFF' : P.ac, 14 + i * w, 22, w, 12); K.el(x, i % 2 ? '#FFFFFF' : P.ac, 14 + i * w + w / 2, 34, w / 2, 3.2 + Math.sin(t * 2 + i) * 0.4, 0, Math.PI); }
    K.rr(x, K.tone(P.ac, -0.25), 13, 20, 74, 3, 1);
    K.rr(x, '#B07A47', 12, 62, 76, 6, 1); K.rr(x, '#8A5D36', 16, 68, 68, 16);
    [[22, '#F28C28'], [42, '#D7263D'], [62, '#6BAF4F']].forEach(([l, c]) => { K.rr(x, '#C99561', l, 54, 16, 9, 1); for (let k = 0; k < 3; k++) K.el(x, c, l + 4 + k * 4, 52.5 - (k % 2), 2.6, 2.6); });
  },
  extinguisher(x, P, t){ const K = ArtKit, red = '#D7263D';
    K.ground(x, P, 24);
    K.ln(x, '#2B2D30', 2.4, [[44, 24], [36, 26], [30, 36], [30, 54]]); K.rr(x, '#2B2D30', 27, 53, 6, 7, 1);
    K.rr(x, red, 38, 32, 24, 52, [12, 12, 3, 3]); K.rr(x, K.tone(red, -0.2), 54, 34, 8, 50, [0, 10, 3, 0]);
    K.rr(x, '#F4F1EA', 41, 50, 18, 16, 1.5); K.rr(x, red, 44, 54, 12, 2); K.rr(x, '#2B2D30', 44, 59, 8, 1.4);
    K.rr(x, '#2B2D30', 45, 24, 10, 9, 1.5); K.ln(x, '#2B2D30', 2.6, [[48, 24], [60, 18]]); K.ln(x, '#55595F', 2.6, [[48, 27], [61, 25]]);
    K.el(x, '#FFFFFF', 57, 28, 3.2, 3.2); x.lineWidth = 1.2; x.strokeStyle = '#4E9A55'; x.beginPath(); x.arc(57, 28, 2.2, Math.PI, Math.PI * 1.6); x.stroke();
  },
  building(x, P, t){ const K = ArtKit, wall = '#EDE8DF', sh = '#D6CFC2';
    K.ground(x, P, 44);
    K.rr(x, sh, 14, 78, 72, 6); K.rr(x, '#E3DDD2', 18, 74, 64, 5);
    K.rr(x, wall, 20, 44, 60, 30); for (let i = 0; i < 4; i++) { K.rr(x, '#FAF7F2', 25 + i * 14, 46, 6, 28); K.rr(x, sh, 29 + i * 14, 46, 2, 28); }
    K.pg(x, wall, [[16, 44], [50, 28], [84, 44]]); K.pg(x, sh, [[50, 28], [84, 44], [50, 44]]); K.rr(x, sh, 16, 42, 68, 3);
    K.rr(x, '#7A7F87', 49, 8, 1.4, 21);
    const pts = []; for (let k = 0; k <= 8; k++) pts.push([50.5 + k * 2.2, 9 + Math.sin(k * 0.8 - t * 3) * 1.3]);
    for (let k = 8; k >= 0; k--) pts.push([50.5 + k * 2.2, 18 + Math.sin(k * 0.8 - t * 3) * 1.3]);
    K.pg(x, P.ac, pts);
  },
  badge(x, P, t){ const K = ArtKit, a = Math.sin(t * 1.5) * 0.05;
    x.save(); x.translate(50, 6); x.rotate(a); x.translate(-50, -6);
    K.ln(x, P.ac, 4, [[38, 0], [47, 34]], 'butt'); K.ln(x, P.ac, 4, [[62, 0], [53, 34]], 'butt'); K.rr(x, '#9097A0', 46, 32, 8, 6, 1.5);
    K.rr(x, '#D6D1C7', 31, 37, 40, 50, 4); K.rr(x, '#FFFFFF', 30, 36, 40, 50, 4); K.rr(x, P.ac, 30, 36, 40, 10, [4, 4, 0, 0]);
    K.el(x, '#C9CDD2', 50, 58, 7, 7); K.el(x, '#AEB4BC', 50, 74, 11, 6, Math.PI, 0);
    K.rr(x, '#D6D1C7', 37, 78, 26, 2.4, 1); x.restore();
  },
  gift(x, P, t){ const K = ArtKit, hop = Math.max(0, Math.sin(t * 3)) * 3, c = P.ac, cd = K.tone(P.ac, -0.22), rb = K.tone(P.ac, 0.7);
    K.ground(x, P, 34);
    K.rr(x, c, 26, 52, 48, 32, 1.5); K.rr(x, cd, 56, 52, 18, 32); K.rr(x, rb, 46, 52, 8, 32);
    x.save(); x.translate(0, -hop); K.rr(x, c, 22, 42, 56, 11, 1.5); K.rr(x, cd, 58, 42, 20, 11); K.rr(x, rb, 46, 42, 8, 11);
    K.el(x, rb, 42, 38, 8, 4.5); K.el(x, rb, 58, 38, 8, 4.5); K.el(x, K.tone(P.ac, 0.45), 50, 40, 3.2, 3.2); x.restore();
  },
  store(x, P, t, v){ const K = ArtKit, wall = '#F2ECE2', sh = '#DED5C6';
    K.ground(x, P, 46);
    K.rr(x, wall, 12, 24, 76, 60); K.rr(x, sh, 74, 24, 14, 60);
    K.rr(x, '#2B2D30', 16, 10, 68, 13, 1.5);
    if (v && v.label) { x.fillStyle = '#FFFFFF'; x.textAlign = 'center'; x.textBaseline = 'middle'; let s = 7; x.font = `700 ${s}px ${FONT}`; while (x.measureText(v.label).width > 60 && s > 3) { s -= 0.3; x.font = `700 ${s}px ${FONT}`; } x.fillText(v.label, 50, 16.8); x.textAlign = 'left'; }
    const n = 8, w = 80 / n;
    for (let i = 0; i < n; i++) { K.pg(x, i % 2 ? '#FFFFFF' : P.ac, [[10 + i * w, 24], [10 + (i + 1) * w, 24], [10 + (i + 1) * w, 33], [10 + i * w, 33]]); K.el(x, i % 2 ? '#FFFFFF' : P.ac, 10 + i * w + w / 2, 33, w / 2, 3, 0, Math.PI); }
    K.rr(x, '#BFD6E2', 17, 44, 34, 30, 1); K.pg(x, '#DCEAF1', [[22, 44], [30, 44], [20, 74], [17, 74], [17, 52]]); K.rr(x, sh, 17, 72, 34, 3);
    K.rr(x, '#4A3B2F', 58, 44, 18, 40, 1); K.el(x, '#E8B04B', 72, 65, 1.3, 1.3); K.rr(x, '#BFD6E2', 61, 47, 12, 12, 1);
    K.pg(x, '#C8693F', [[80, 76], [88, 76], [87, 84], [81, 84]]); K.el(x, '#4E9A55', 84, 72, 5, 6);
  }
};

/* 글 → 그림 주제. 앞에 있는 것이 먼저 */
const ART_TOPICS = [
  ['extinguisher', /소방|화재|소화기|119|대피/], ['cake', /케이크|디저트|마카롱|쿠키|타르트|생일/], ['bread', /빵|베이커리|크루아상|식빵|베이글|도넛|제과/],
  ['coffee', /커피|카페|라떼|아메리카노|음료|에이드|티룸|찻집/], ['bowl', /국수|라면|국밥|찌개|탕|덮밥|비빔밥|떡볶이|분식|칼국수|우동|쌀국수|냉면|라멘|짬뽕/],
  ['dish', /식당|맛집|한식|양식|중식|일식|고기|갈비|삼겹|치킨|피자|버거|도시락|반찬|요리|메뉴|정식|스테이크/],
  ['flower', /꽃|플라워|화분|식물|정원|원예|다육/], ['shirt', /옷|의류|티셔츠|패션|코트|니트|셔츠|세탁|수선/], ['beauty', /미용|헤어|커트|펌|네일|화장품|피부|뷰티|바버/],
  ['fitness', /헬스|필라테스|요가|운동|PT|피티|체육|태권도|수영|크로스핏/], ['books', /학원|수업|강의|교육|도서|책|공부|강좌|과외|교실|스터디/],
  ['market', /장터|시장|바자회|플리마켓|마켓|축제|박람회|나눔/], ['gift', /할인|이벤트|선물|증정|쿠폰|세일|경품|오픈 기념/],
  ['badge', /모집|채용|직원|알바|아르바이트|봉사|구인|지원자/], ['building', /시청|구청|주민센터|기관|공단|행정|센터|협회|도서관|복지관/]
];
function artTopic(text){ const t = String(text || ''); const hit = ART_TOPICS.find(([, re]) => re.test(t)); return hit ? hit[0] : null; }
function endTopic(type, topic){
  if (type === 'org') return 'building';
  if (type === 'recruit') return topic === 'building' ? 'building' : 'badge';
  if (type === 'event') return topic === 'building' ? 'building' : 'market';
  return 'store';
}

/* 화면 칸 안에 주제 그림 그리기. shot 0: 전체, 1: 가까이, 2: 왼쪽으로 비켜 가까이 */
Graphics.hero = function(x, px, py, pw, ph, v, P, local){
  const fn = ART[v.topic]; if (!fn) return Graphics.poster(x, px, py, pw, ph, v, P, local);
  const shot = v.shot || 0, s0 = Math.min(pw, ph) * (pw > ph * 1.3 ? 0.9 : 0.82) / 100;
  let zoom = [1.3, 1.7, 1.35, 2.2][shot]; let focus = [[50, 60], [50, 60], [40, 58], [48, 58]][shot];
  const tall = /store|building|badge|extinguisher|shirt/.test(v.topic); if (tall && !shot) { zoom = 1.02; focus = [50, 47]; }
  const pop = 0.94 + 0.06 * easeOut(local / 0.6);
  x.save();
  x.translate(px + pw / 2 + (shot === 2 ? pw * 0.06 : 0), py + ph * 0.5);
  x.scale(s0 * zoom * pop, s0 * zoom * pop); x.translate(-focus[0], -focus[1]);
  fn(x, P, local, v);
  x.restore();
  if (v.chip) Graphics.chip(x, px, py, pw, ph, v.chip, P, local);
};
// 그림 위 이름표: 특징 낱말
Graphics.chip = function(x, px, py, pw, ph, text, P, local){
  const u = Math.min(pw, ph) / 100, sz = Math.min(8 * u, Math.max(pw, ph) * 0.06), a = easeOut((local - 0.35) / 0.4);
  x.font = `700 ${sz}px ${FONT}`; const tw = Math.min(x.measureText(text).width, pw * 0.8);
  const l = px + pw * 0.06, t = py + ph * 0.07;
  x.save(); x.globalAlpha *= a; x.beginPath(); x.rect(l, t, (tw + sz * 1.2) * a, sz * 1.7); x.clip();
  x.fillStyle = P.ac; x.fillRect(l, t, tw + sz * 1.2, sz * 1.7);
  x.fillStyle = contrast(P.ac, '#FFFFFF') > contrast(P.ac, '#151515') ? '#FFFFFF' : '#151515'; x.textBaseline = 'middle';
  x.fillText(text, l + sz * 0.6, t + sz * 0.88, pw * 0.8); x.restore();
};
