/* ---- 한국 공휴일 (연도 제한 없음) ----
   1) 양력 공휴일 + 대체공휴일 규칙(관공서의 공휴일에 관한 규정, 2026.5.11 개정 반영)
   2) 설·부처님오신날·추석: 음력 날짜를 천문 계산(삭·중기, 한국 표준시)으로 구함
   3) 임기만료 선거일: 공직선거법 제34조 규칙으로 계산
   4) data/holidays.json(한국천문연구원 특일정보, 임시공휴일 포함)이 있으면 그 해는 공식 자료를 그대로 씀 */
const KHol = (function(){
  const D2R = Math.PI / 180, sin = d => Math.sin(d * D2R);
  const norm = a => ((a % 360) + 360) % 360;
  // 율리우스일 ↔ 날짜
  const jdOf = (y, m, d) => { if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; };
  function dateOfJd(jd){ // 한국 표준시 날짜 (jd는 세계시)
    const z = Math.floor(jd + 0.5 + 9 / 24), f = 0; let A = z;
    if (z >= 2299161) { const al = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + al - Math.floor(al / 4); }
    const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), Dd = Math.floor(365.25 * C), E = Math.floor((B - Dd) / 30.6001);
    const day = B - Dd - Math.floor(30.6001 * E) + f, mon = E < 14 ? E - 1 : E - 13, yr = mon > 2 ? C - 4716 : C - 4715;
    return new Date(yr, mon - 1, day);
  }
  function deltaT(y){ // 초 (Espenak·Meeus 다항식)
    if (y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
    if (y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (y < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
    return -20 + 32 * ((y - 1820) / 100) ** 2;
  }
  // 삭(새달) 시각: Meeus 49장. k = 2000년 1월 기준 삭 번호
  function newMoon(k){
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
    const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
    const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
    const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
    jde += -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M)
      - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
    const A = [[299.77 + 0.107408 * k - 0.009173 * T2, 325], [251.88 + 0.016321 * k, 165], [251.83 + 26.651886 * k, 164], [349.42 + 36.412478 * k, 126],
      [84.66 + 18.206239 * k, 110], [141.74 + 53.303771 * k, 62], [207.14 + 2.453732 * k, 60], [154.84 + 7.30686 * k, 56], [34.52 + 27.261239 * k, 47],
      [207.19 + 0.121824 * k, 42], [291.34 + 1.844379 * k, 40], [161.72 + 24.198154 * k, 37], [239.56 + 25.513099 * k, 35], [331.55 + 3.592518 * k, 23]];
    A.forEach(([a, c]) => jde += c * 1e-6 * sin(a));
    return jde - deltaT(2000 + k / 12.3685) / 86400;
  }
  // 태양 겉보기 황경 (Meeus 25장, 지구 궤도 보정 포함)
  function sunLon(jd){
    const T = (jd - 2451545) / 36525;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T, M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    return norm(L0 + C - 0.00569 - 0.00478 * sin(125.04 - 1934.136 * T));
  }
  function termJd(year, lon){ // 그 해 태양 황경이 lon이 되는 세계시
    let jd = jdOf(year, 1, 1) + norm(lon - 280) / 360 * 365.2422;
    for (let i = 0; i < 30; i++) { const dl = norm(lon - sunLon(jd) + 180) - 180; jd += dl / 360 * 365.2422; if (Math.abs(dl) < 1e-7) break; }
    return jd - deltaT(year) / 86400;
  }
  const dayNo = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  // 중기(lon)가 든 음력 달의 초하루(한국 날짜)
  function monthStartWith(year, lon){
    const tj = termJd(year, lon), td = dayNo(dateOfJd(tj));
    let k = Math.floor((tj - 2451550.1) / 29.530588861) + 1;
    while (dayNo(dateOfJd(newMoon(k))) > td) k--;
    return dateOfJd(newMoon(k));
  }
  const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // 음력 달 번호: 동지가 든 달을 11월로 두고, 두 동지 달 사이가 13달이면 중기 없는 첫 달을 윤달로 봄
  const kstMid = d => jdOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) - 9 / 24;
  function monthsOf(y){ // y년 1~12월(윤달 제외) 초하루
    const s1 = monthStartWith(y - 1, 270), s2 = monthStartWith(y, 270);
    let k = Math.round((jdOf(s1.getFullYear(), s1.getMonth() + 1, s1.getDate()) - 2451550.1) / 29.530588861) - 1;
    while (dayNo(dateOfJd(newMoon(k))) < dayNo(s1)) k++;
    const starts = []; for (let i = 0; i < 15; i++) { const d = dateOfJd(newMoon(k + i)); if (dayNo(d) > dayNo(s2)) break; starts.push(d); }
    const leapNeeded = starts.length === 14; // s1..s2 포함 14개 = 사이 13달
    let leapDone = !leapNeeded, num = 11; const M = {};
    for (let i = 0; i < starts.length - 1; i++) {
      const a = Math.floor(sunLon(kstMid(starts[i])) / 30), b = Math.floor(sunLon(kstMid(starts[i + 1])) / 30);
      if (!leapDone && a === b) { leapDone = true; continue; } // 중기 없는 달 = 윤달
      if (i > 0) num = num % 12 + 1;
      if (num <= 10 && i > 0) M[num] = starts[i];
      if (i === 0) num = 11;
    }
    return M;
  }
  function lunarDays(y){
    const M = monthsOf(y);
    return { seol: M[1], budda: add(M[4], 7), chu: add(M[8], 14) };
  }
  // 공직선거법 제34조: 임기만료 선거일 = 만료일 전 n일 이후 첫 수요일 (그날·전날·다음날이 공휴일이면 다음 주 수요일)
  function electionDay(endY, endM, endD, before, isHol){
    let d = add(new Date(endY, endM - 1, endD), -before);
    while (d.getDay() !== 3) d = add(d, 1);
    if (isHol(d) || isHol(add(d, -1)) || isHol(add(d, 1))) d = add(d, 7);
    return d;
  }
  const cache = {}; let official = null;
  function build(y){
    if (official && official[y]) return official[y];
    if (cache[y]) return cache[y];
    const H = {}, put = (d, n) => { H[key(d)] = H[key(d)] ? H[key(d)] + '·' + n : n; };
    const fixed = [[1, 1, '신정', 0], [3, 1, '삼일절', 1], [5, 5, '어린이날', 2], [6, 6, '현충일', 0], [8, 15, '광복절', 1], [10, 3, '개천절', 1], [10, 9, '한글날', 1], [12, 25, '성탄절', 1]];
    if (y >= 2026) fixed.push([5, 1, '노동절', 1], [7, 17, '제헌절', 1]);
    fixed.forEach(([m, d, n]) => put(new Date(y, m - 1, d), n));
    const L = lunarDays(y), seolDays = [add(L.seol, -1), L.seol, add(L.seol, 1)], chuDays = [add(L.chu, -1), L.chu, add(L.chu, 1)];
    seolDays.forEach(d => put(d, '설날')); chuDays.forEach(d => put(d, '추석')); put(L.budda, '부처님오신날');
    // 선거일(임기만료): 지방 6/30 만료 30일 전, 국회 5/29 만료 50일 전, 대통령 6/3 만료 70일 전 (2030년부터 5년마다)
    const isH = d => !!H[key(d)] || d.getDay() === 0;
    if (y >= 2018 && (y - 2018) % 4 === 0) put(electionDay(y, 6, 30, 30, isH), '전국동시지방선거');
    if (y >= 2020 && (y - 2020) % 4 === 0) put(electionDay(y, 5, 29, 50, isH), '국회의원선거');
    if (y >= 2030 && (y - 2030) % 5 === 0) put(electionDay(y, 6, 3, 70, isH), '대통령선거');
    // 대체공휴일
    const base = Object.assign({}, H), taken = d => !!H[key(d)] || d.getDay() === 0 || d.getDay() === 6;
    const sub = (d, name) => { let x = add(d, 1); while (taken(x)) x = add(x, 1); H[key(x)] = name + ' 대체공휴일'; };
    const multi = (days, name) => { // 설·추석: 일요일 또는 다른 공휴일과 겹치면 연휴 다음 첫 평일
      const hit = days.some(d => d.getDay() === 0 || base[key(d)] !== name);
      if (hit) sub(days[2], name);
    };
    multi(seolDays, '설날'); multi(chuDays, '추석');
    // 국경일·부처님오신날·성탄절·노동절·제헌절: 토·일과 겹칠 때 / 어린이날: 토·일·다른 공휴일과 겹칠 때 (같은 날은 한 번만)
    const done = {};
    fixed.filter(f => f[3]).map(([m, d, n, t]) => [new Date(y, m - 1, d), n, t]).concat([[L.budda, '부처님오신날', 1]]).forEach(([d, n, t]) => {
      if (y < 2023 && n !== '어린이날' && !(y >= 2021 && ['삼일절', '광복절', '개천절', '한글날'].includes(n))) return;
      const we = d.getDay() === 0 || d.getDay() === 6, other = t === 2 && (base[key(d)] || '').includes('·');
      if ((we || other) && !done[key(d)]) { done[key(d)] = 1; sub(d, n); }
    });
    return (cache[y] = H);
  }
  return {
    list: y => build(y),
    is: d => d.getDay() === 0 || d.getDay() === 6 || !!build(d.getFullYear())[key(d)],
    name: d => build(d.getFullYear())[key(d)] || '',
    lunar: lunarDays,
    setOfficial(j){ // {"2027": {"2027-01-01": "1월1일", ...}}
      if (!j || typeof j !== 'object') return; official = {};
      Object.keys(j.years || j).forEach(y => { const v = (j.years || j)[y]; if (v && typeof v === 'object' && Object.keys(v).length >= 10) official[+y] = v; });
    },
    hasOfficial: y => !!(official && official[y])
  };
})();
