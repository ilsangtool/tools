/* ===== 보안(암호)이 걸린 PDF 풀기 — 나누기·합치기용 =====
   PDF 표준 보안 처리기(Standard Security Handler)를 그대로 구현: RC4 40·128비트(R2~R4), AES-128(R4), AES-256(R5·R6).
   여는 암호가 없는 문서(인쇄·편집만 막은 공문 등)는 바로 풀고, 여는 암호가 있으면 입력받은 암호로 풉니다.
   pdf-lib가 문서를 읽는 동안 '개체 묶음(ObjStm)'을 잠시 미뤄 두었다가, 풀고 나서 펼칩니다. */
const PdfUnlock = (() => {
  const PAD = new Uint8Array([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; a.forEach(x => { o.set(x, p); p += x.length; }); return o; };
  const eq = (a, b, n) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
  const subtle = () => (globalThis.crypto || {}).subtle;

  // MD5 (WebCrypto에 없어 직접 계산)
  function md5(d){
    const K = new Int32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const n = d.length, m = new Uint8Array(((n + 8 >> 6) + 1) * 64); m.set(d); m[n] = 0x80;
    const bits = n * 8, dv = new DataView(m.buffer); dv.setUint32(m.length - 8, bits >>> 0, true); dv.setUint32(m.length - 4, Math.floor(bits / 4294967296), true);
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let o = 0; o < m.length; o += 64) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const s = S[(i >> 4) * 4 + (i & 3)], t = (A + F + K[i] + dv.getInt32(o + g * 4, true)) | 0;
        A = D; D = C; C = B; B = (B + ((t << s) | (t >>> (32 - s)))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16), ov = new DataView(out.buffer);
    [a0, b0, c0, d0].forEach((v, i) => ov.setInt32(i * 4, v, true));
    return out;
  }
  function rc4(key, data){
    const s = new Uint8Array(256); for (let i = 0; i < 256; i++) s[i] = i;
    for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t; }
    const out = new Uint8Array(data.length);
    for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + s[i]) & 255; const t = s[i]; s[i] = s[j]; s[j] = t; out[k] = data[k] ^ s[(s[i] + s[j]) & 255]; }
    return out;
  }
  async function aesKey(k, use){ return subtle().importKey('raw', k, { name: 'AES-CBC' }, false, [use]); }
  async function aesEncNoPad(k, iv, data){ // 덧붙임 없이 암호화: 마지막 덧붙임 블록을 버림
    return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, await aesKey(k, 'encrypt'), data)).slice(0, data.length);
  }
  async function aesDecNoPad(k, iv, data){ // 덧붙임 없는 암호문: 올바른 덧붙임 블록을 만들어 붙인 뒤 풂
    const last = data.slice(data.length - 16), padBlk = await aesEncNoPad(k, last, new Uint8Array(16).fill(16));
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, await aesKey(k, 'decrypt'), cat(data, padBlk)));
  }
  async function aesDecPdf(k, data){ // 앞 16바이트는 IV, 끝은 PKCS#7 덧붙임
    if (data.length < 32 || data.length % 16) return data.length < 16 ? new Uint8Array(0) : await aesDecNoPad(k, data.slice(0, 16), data.slice(16, 16 + Math.floor((data.length - 16) / 16) * 16)).catch(() => new Uint8Array(0));
    try { return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: data.slice(0, 16) }, await aesKey(k, 'decrypt'), data.slice(16))); }
    catch (e) { return aesDecNoPad(k, data.slice(0, 16), data.slice(16)); } // 덧붙임이 틀린 파일
  }
  const sha = async (alg, d) => new Uint8Array(await subtle().digest(alg, d));
  async function hash2B(pw, salt, udata, R){ // ISO 32000-2 알고리즘 2.B (R6)
    let K = await sha('SHA-256', cat(pw, salt, udata));
    if (R < 6) return K;
    for (let i = 0; ; i++) {
      const K1 = new Uint8Array((pw.length + K.length + udata.length) * 64), unit = cat(pw, K, udata);
      for (let j = 0; j < 64; j++) K1.set(unit, j * unit.length);
      const E = await aesEncNoPad(K.slice(0, 16), K.slice(16, 32), K1);
      let mod = 0; for (let j = 0; j < 16; j++) mod += E[j]; mod %= 3;
      K = await sha(['SHA-256', 'SHA-384', 'SHA-512'][mod], E);
      const r = i + 1; if (r >= 64 && E[E.length - 1] <= r - 32) break;
    }
    return K.slice(0, 32);
  }
  const utf8 = s => new TextEncoder().encode(s.normalize ? s.normalize('NFKC') : s).slice(0, 127);
  const latin = s => { const o = new Uint8Array(Math.min(32, s.length)); for (let i = 0; i < o.length; i++) o[i] = s.charCodeAt(i) & 255; return o; };
  const padPw = p => cat(p.slice(0, 32), PAD.slice(0, 32 - Math.min(32, p.length)));

  // 파일 키 구하기. 맞지 않으면 null
  async function fileKey(E, id0, password){
    const { V, R, O, U, P, n, meta } = E;
    if (R >= 5) {
      const pw = utf8(password);
      if (eq(await hash2B(pw, U.slice(32, 40), new Uint8Array(0), R), U, 32)) return aesDecNoPad(await hash2B(pw, U.slice(40, 48), new Uint8Array(0), R), new Uint8Array(16), E.UE);
      const u48 = U.slice(0, 48);
      if (eq(await hash2B(pw, O.slice(32, 40), u48, R), O, 32)) return aesDecNoPad(await hash2B(pw, O.slice(40, 48), u48, R), new Uint8Array(16), E.OE);
      return null;
    }
    const pBytes = new Uint8Array(4); new DataView(pBytes.buffer).setInt32(0, P, true);
    const keyFrom = pw => {
      let h = md5(cat(padPw(pw), O, pBytes, id0, R >= 4 && !meta ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)));
      if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.slice(0, n));
      return h.slice(0, n);
    };
    const checkUser = key => {
      if (R === 2) return eq(rc4(key, PAD), U, 32);
      let x = rc4(key, md5(cat(PAD, id0)));
      for (let i = 1; i <= 19; i++) x = rc4(key.map(b => b ^ i), x);
      return eq(x, U, 16);
    };
    const pw = latin(password);
    let key = keyFrom(pw); if (checkUser(key)) return key;
    // 소유자 암호로 넣었을 때: 소유자 암호로 O를 풀면 사용자 암호가 나옴
    let h = md5(padPw(pw)); if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
    const ok = h.slice(0, n); let up = O;
    if (R === 2) up = rc4(ok, O); else for (let i = 19; i >= 0; i--) up = rc4(ok.map(b => b ^ i), up);
    key = keyFrom(up); return checkUser(key) ? key : null;
  }

  const bytesOf = o => o.asBytes ? o.asBytes() : new Uint8Array(0);
  function readEncrypt(L, ctx){
    const tr = ctx.trailerInfo, ed = ctx.lookup(tr.Encrypt), g = k => ed.lookup(L.PDFName.of(k));
    const num = k => { const v = g(k); return v && v.asNumber ? v.asNumber() : (v && v.numberValue != null ? v.numberValue : undefined); };
    const filt = g('Filter'); if (filt && filt.asString && filt.asString() !== '/Standard') throw new Error('UNSUPPORTED');
    const V = num('V') || 0, R = num('R') || 2;
    let cfm = V >= 4 ? 'V2' : 'V2', cfStr = cfm;
    if (V >= 4) {
      const cf = g('CF'), name = k => { const v = g(k); return v ? v.asString().slice(1) : 'Identity'; };
      const method = nm => { if (nm === 'Identity' || !cf) return 'None'; const d = cf.lookup(L.PDFName.of(nm)); const m = d && d.lookup(L.PDFName.of('CFM')); return m ? m.asString().slice(1) : 'None'; };
      cfm = method(name('StmF')); cfStr = method(name('StrF'));
    }
    const em = g('EncryptMetadata');
    const idArr = ctx.lookup(tr.ID), id0 = idArr && idArr.size && idArr.size() ? bytesOf(idArr.lookup(0)) : new Uint8Array(0);
    const Ln = num('Length');
    return { V, R, O: bytesOf(g('O')), U: bytesOf(g('U')), OE: g('OE') ? bytesOf(g('OE')) : null, UE: g('UE') ? bytesOf(g('UE')) : null, P: num('P') | 0,
      n: V === 1 || R === 2 ? 5 : Ln ? Math.min(16, Ln / 8 | 0) : (V >= 4 ? 16 : 5), meta: !(em && em.asBoolean && em.asBoolean() === false), stm: cfm, str: cfStr, id0, ref: tr.Encrypt };
  }

  async function objCrypt(E, key, ref, method, data){
    if (method === 'None' || method === 'Identity') return data;
    if (method === 'AESV3') return aesDecPdf(key, data);
    const ob = new Uint8Array([ref.objectNumber & 255, ref.objectNumber >> 8 & 255, ref.objectNumber >> 16 & 255, ref.generationNumber & 255, ref.generationNumber >> 8 & 255]);
    const aes = method === 'AESV2', k = md5(cat(key, ob, aes ? new Uint8Array([0x73, 0x41, 0x6C, 0x54]) : new Uint8Array(0))).slice(0, Math.min(16, key.length + 5));
    return aes ? aesDecPdf(k, data) : rc4(k, data);
  }
  const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  async function fixStrings(L, E, key, ref, o){
    if (o instanceof L.PDFString || o instanceof L.PDFHexString) return L.PDFHexString.of(toHex(await objCrypt(E, key, ref, E.str, o.asBytes())));
    if (o instanceof L.PDFArray) { for (let i = 0; i < o.size(); i++) { const v = o.get(i), nv = await fixStrings(L, E, key, ref, v); if (nv !== v) o.set(i, nv); } return o; }
    if (o instanceof L.PDFDict) { for (const [k, v] of o.entries()) { const nv = await fixStrings(L, E, key, ref, v); if (nv !== v) o.set(k, nv); } return o; }
    return o;
  }

  /* bytes → 보안이 풀린 PDFDocument. 여는 암호가 필요하면 askPw()로 받음(취소하면 null) */
  async function load(L, bytes, askPw){
    const deferred = []; let lastRef = null;
    const H = L.PDFParser.prototype, oHead = H.parseIndirectObjectHeader, oFor = L.PDFObjectStreamParser.forStream;
    H.parseIndirectObjectHeader = function(){ const r = oHead.call(this); lastRef = r; return r; };
    L.PDFObjectStreamParser.forStream = (raw, tick) => ({ parseIntoContext: async () => { deferred.push({ ref: lastRef, raw, tick }); } });
    let ctx;
    try { ctx = await L.PDFParser.forBytesWithOptions(bytes, 100, false, false).parseDocument(); }
    finally { H.parseIndirectObjectHeader = oHead; L.PDFObjectStreamParser.forStream = oFor; }
    deferred.forEach(d => ctx.assign(d.ref, d.raw)); // 우선 그대로 넣어 둠

    const enc = ctx.trailerInfo.Encrypt && ctx.lookup(ctx.trailerInfo.Encrypt);
    if (enc) {
      const E = readEncrypt(L, ctx);
      if (!subtle() && (E.stm.indexOf('AES') === 0 || E.R >= 5)) throw new Error('이 브라우저는 AES 암호를 풀 수 없습니다');
      let key = await fileKey(E, E.id0, ''), tries = 0;
      while (!key) {
        const pw = askPw ? await askPw(tries++) : null; if (pw == null) return null;
        key = await fileKey(E, E.id0, pw);
      }
      const encRef = E.ref instanceof L.PDFRef ? E.ref : null;
      for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
        if (encRef && ref === encRef) continue;
        if (obj instanceof L.PDFRawStream) {
          const ty = obj.dict.lookup(L.PDFName.of('Type'));
          if (ty === L.PDFName.of('XRef')) continue;
          if (!(ty === L.PDFName.of('Metadata') && !E.meta)) obj.contents = await objCrypt(E, key, ref, E.stm, obj.contents);
          await fixStrings(L, E, key, ref, obj.dict);
        } else await fixStrings(L, E, key, ref, obj);
      }
      if (encRef) ctx.delete(encRef);
      delete ctx.trailerInfo.Encrypt;
    }
    // 개체 묶음 펼치기 (묶음 안 글자는 따로 암호화돼 있지 않음)
    for (const d of deferred) { ctx.delete(d.ref); await oFor(d.raw, d.tick).parseIntoContext(); }
    const doc = new L.PDFDocument(ctx, true, false); doc.unlocked = !!enc; return doc;
  }
  return { load, _md5: md5 };
})();
