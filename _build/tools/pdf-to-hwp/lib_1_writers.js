/* ===== 문서 저장기: HWPX(한글) · DOCX(워드) · TXT =====
   문서 모델
   - 문단 {type:'p', runs:[{t, b(굵게), sz(pt)}], align:'J'|'L'|'C'|'R', ml(왼쪽 여백 pt), fi(첫 줄 들여쓰기 pt, 음수=내어쓰기), pb(새 쪽)}
   - 표   {type:'table', cols:[너비 pt], rows:[높이 pt], cells:[{r, c, rs, cs, paras:[문단]}], pb}
*/
const xesc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- ZIP (무압축) ---- */
const ZCRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function zcrc(u){ let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = ZCRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(entries, mime){ // entries: [[이름, 문자열|Uint8Array]]
  const te = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? te.encode(content) : content, nb = te.encode(name), crc = zcrc(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(lh.buffer, nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    cen.push(ch.buffer, nb); off += 30 + nb.length + data.length;
  }
  const cs = cen.reduce((s, p) => s + (p.byteLength || p.length), 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, end.buffer], { type: mime });
}

function docPlainText(blocks){
  const out = [];
  const pt = p => p.runs.map(r => r.t).join('');
  for (const b of blocks) {
    if (b.pb && out.length) out.push('');
    if (b.type === 'p') out.push(pt(b));
    else {
      const grid = [];
      for (const c of b.cells) (grid[c.r] = grid[c.r] || [])[c.c] = c.paras.map(pt).join(' ');
      grid.forEach(row => out.push(Array.from(row || [], v => v || '').join('\t')));
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ---- HWPX ---- */
const PT2HU = 100; // 1pt = 100 HWPUNIT
function makeHwpx(blocks, title, page){
  const B = HWPX_BASE;
  let header = B['Contents/header.xml'];
  const baseChar = header.match(/<hh:charPr id="0"[\s\S]*?<\/hh:charPr>/)[0];
  const basePara = header.match(/<hh:paraPr id="0"[\s\S]*?<\/hh:paraPr>/)[0];
  const chars = [baseChar], charKey = { '1000|0|': 0 };
  const LS = Math.round(((page && page.lineH) || 1.6) * 100); // 줄 간격 %
  const paras = [basePara.replace(/<hh:lineSpacing type="PERCENT" value="160"/g, `<hh:lineSpacing type="PERCENT" value="${LS}"`)], paraKey = { 'J|0|0|0|0': 0 };
  // 글꼴: 기본(0)은 견본의 함초롬바탕, PDF에서 찾은 글꼴을 1번부터 추가
  const faces = ['함초롬바탕'], faceId = f => { if (!f) return 0; let i = faces.indexOf(f); if (i < 0) { i = faces.length; faces.push(f); } return i; };
  const charId = r => {
    const h = Math.max(100, Math.round((r.sz || 10) * 2) * 50), fid = faceId(r.ff), k = h + '|' + (r.b ? 1 : 0) + '|' + (fid || '');
    if (charKey[k] == null) {
      charKey[k] = chars.length;
      let x = baseChar.replace('id="0"', `id="${chars.length}"`).replace('height="1000"', `height="${h}"`);
      if (fid) x = x.replace(/<hh:fontRef [^>]*\/>/, `<hh:fontRef hangul="${fid}" latin="${fid}" hanja="${fid}" japanese="${fid}" other="${fid}" symbol="${fid}" user="${fid}"/>`);
      if (r.b) x = x.replace(/(<hh:offset [^>]*\/>)/, '$1<hh:bold/>');
      chars.push(x);
    }
    return charKey[k];
  };
  const paraId = p => {
    const al = { J: 'JUSTIFY', L: 'LEFT', C: 'CENTER', R: 'RIGHT' }[p.align || 'J'];
    const r50 = v => Math.round((v || 0) * PT2HU / 50) * 50;
    const ml = Math.max(0, r50(p.ml)), fi = r50(p.fi), mr = Math.max(0, r50(p.mr)), sb = Math.max(0, r50(p.sb));
    const k = `${p.align || 'J'}|${ml}|${fi}|${mr}|${sb}`;
    if (paraKey[k] == null) {
      paraKey[k] = paras.length;
      paras.push(basePara.replace('id="0"', `id="${paras.length}"`).replace('horizontal="JUSTIFY"', `horizontal="${al}"`).replace(/<hh:lineSpacing type="PERCENT" value="160"/g, `<hh:lineSpacing type="PERCENT" value="${LS}"`)
        .replace(/<hc:intent value="0"/g, `<hc:intent value="${fi}"`).replace(/<hc:left value="0"/g, `<hc:left value="${ml}"`)
        .replace(/<hc:right value="0"/g, `<hc:right value="${mr}"`).replace(/<hc:prev value="0"/g, `<hc:prev value="${sb}"`));
    }
    return paraKey[k];
  };
  const runsXml = runs => runs.filter(r => r.t).map(r => `<hp:run charPrIDRef="${charId(r)}"><hp:t>${xesc(r.t)}</hp:t></hp:run>`).join('') || '<hp:run charPrIDRef="0"><hp:t/></hp:run>';
  const pOpen = (p, pb) => `<hp:p id="0" paraPrIDRef="${paraId(p)}" styleIDRef="0" pageBreak="${pb ? 1 : 0}" columnBreak="0" merged="0">`;
  let tblId = 1000000000;
  // 쪽 크기·여백: PDF 첫 쪽 그대로 (없으면 견본의 A4)
  const PG = page ? { W: Math.round(page.W * PT2HU), H: Math.round(page.H * PT2HU), l: Math.round(page.ml * PT2HU), r: Math.round(page.mr * PT2HU), t: Math.round(page.mt * PT2HU), b: Math.round(page.mb * PT2HU) } : null;
  const TEXT_W = PG ? PG.W - PG.l - PG.r : 42520; // 본문 폭
  function tableXml(t){
    const totW = t.cols.reduce((a, b) => a + b, 0) * PT2HU, k = totW > TEXT_W ? TEXT_W / totW : 1;
    const cw = t.cols.map(w => Math.max(400, Math.round(w * PT2HU * k)));
    const rh = t.rows.map(h => Math.max(282, Math.round(h * PT2HU)));
    const W = cw.reduce((a, b) => a + b, 0), H = rh.reduce((a, b) => a + b, 0);
    const byRow = t.rows.map(() => []);
    t.cells.forEach(c => byRow[c.r].push(c));
    let x = `<hp:tbl id="${tblId++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${t.rows.length}" colCnt="${t.cols.length}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">` +
      `<hp:sz width="${W}" widthRelTo="ABSOLUTE" height="${H}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="${Math.max(0, Math.min(TEXT_W - W, Math.round((t.x1 || 0) * PT2HU)))}"/>` +
      `<hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>`;
    byRow.forEach(cells => {
      x += '<hp:tr>';
      cells.sort((a, b) => a.c - b.c).forEach(c => {
        const w = cw.slice(c.c, c.c + c.cs).reduce((a, b) => a + b, 0), h = rh.slice(c.r, c.r + c.rs).reduce((a, b) => a + b, 0);
        const ps = (c.paras.length ? c.paras : [{ runs: [], align: 'L' }]).map(p => pOpen(p) + runsXml(p.runs) + '</hp:p>').join('');
        x += `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">` +
          `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${c.va === 'T' ? 'TOP' : 'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${ps}</hp:subList>` +
          `<hp:cellAddr colAddr="${c.c}" rowAddr="${c.r}"/><hp:cellSpan colSpan="${c.cs}" rowSpan="${c.rs}"/><hp:cellSz width="${w}" height="${h}"/>` +
          `<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
      });
      x += '</hp:tr>';
    });
    return x + '</hp:tbl>';
  }
  const body = [];
  blocks.forEach((b, i) => {
    const first = i === 0;
    if (b.type === 'p') {
      body.push(pOpen(b, b.pb && !first) + (first ? B._secPrRun : '') + runsXml(b.runs) + '</hp:p>');
    } else {
      body.push(pOpen({ align: 'L' }, b.pb && !first) + (first ? B._secPrRun : '') + `<hp:run charPrIDRef="0">${tableXml(b)}<hp:t/></hp:run></hp:p>`);
    }
  });
  if (!body.length) body.push(`<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${B._secPrRun}<hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p>`);
  // 머리(header.xml): 글자·문단 모양 목록 갱신
  if (faces.length > 1) header = header.replace(/<hh:fontface lang="(\w+)" fontCnt="1">([\s\S]*?)<\/hh:fontface>/g, (m, lang, inner) => {
    const one = inner.match(/<hh:font id="0"[\s\S]*?<\/hh:font>/)[0];
    const more = faces.slice(1).map((f, i) => one.replace('id="0"', `id="${i + 1}"`).replace(/face="[^"]*"/, `face="${xesc(f)}"`)).join('');
    return `<hh:fontface lang="${lang}" fontCnt="${faces.length}">${inner}${more}</hh:fontface>`;
  });
  header = header.replace(/<hh:charProperties itemCnt="\d+">[\s\S]*?<\/hh:charProperties>/, `<hh:charProperties itemCnt="${chars.length}">${chars.join('')}</hh:charProperties>`)
                 .replace(/<hh:paraProperties itemCnt="\d+">[\s\S]*?<\/hh:paraProperties>/, `<hh:paraProperties itemCnt="${paras.length}">${paras.join('')}</hh:paraProperties>`);
  let section = B._sectionHead + body.join('') + '</hs:sec>';
  if (PG) section = section.replace(/<hp:pagePr ([^>]*)width="\d+" height="\d+"/, `<hp:pagePr $1width="${PG.W}" height="${PG.H}"`)
    .replace(/(<hp:pagePr[\s\S]*?)<hp:margin [^>]*\/>/, `$1<hp:margin header="0" footer="0" gutter="0" left="${PG.l}" right="${PG.r}" top="${PG.t}" bottom="${PG.b}"/>`)
    .replace(/landscape="\w+"/, `landscape="${PG.W > PG.H ? 'NARROWLY' : 'WIDELY'}"`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const hpf = B['Contents/content.hpf'].replace('<opf:title/>', `<opf:title>${xesc(title || '')}</opf:title>`)
    .replace(/(<opf:meta name="creator" content="text">)[^<]*/, '$1일상툴 PDF 변환').replace(/(<opf:meta name="CreatedDate" content="text">)[^<]*/, '$1' + now)
    .replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*/, '$1' + now);
  const preview = docPlainText(blocks).slice(0, 1000);
  return zipStore([
    ['mimetype', 'application/hwp+zip'],
    ['version.xml', B['version.xml']],
    ['Contents/header.xml', header],
    ['Contents/section0.xml', section],
    ['Preview/PrvText.txt', preview],
    ['settings.xml', B['settings.xml']],
    ['META-INF/container.rdf', B['META-INF/container.rdf']],
    ['Contents/content.hpf', hpf],
    ['META-INF/container.xml', B['META-INF/container.xml']],
    ['META-INF/manifest.xml', B['META-INF/manifest.xml']]
  ], 'application/hwp+zip');
}

/* ---- DOCX ---- */
const PT2TW = 20; // 1pt = 20 twip
function makeDocx(blocks, title, page){
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const jc = { J: 'both', L: 'left', C: 'center', R: 'right' };
  const LH = (page && page.lineH) || 1.6; // 줄 간격 (글자 크기 배수, PDF에서 잰 값)
  const pXml = (p, pb) => {
    const ml = Math.max(0, Math.round((p.ml || 0) * PT2TW)), fi = Math.round((p.fi || 0) * PT2TW), mr = Math.max(0, Math.round((p.mr || 0) * PT2TW));
    const ind = ml || fi || mr ? `<w:ind w:left="${ml}"${mr ? ` w:right="${mr}"` : ''}${fi < 0 ? ` w:hanging="${-fi}"` : fi > 0 ? ` w:firstLine="${fi}"` : ''}/>` : '';
    const runs = p.runs.filter(r => r.t).map(r => {
      const sz = Math.round((r.sz || 10) * 2), f = r.ff ? `<w:rFonts w:ascii="${xesc(r.ff)}" w:eastAsia="${xesc(r.ff)}" w:hAnsi="${xesc(r.ff)}" w:cs="${xesc(r.ff)}"/>` : '';
      return `<w:r><w:rPr>${f}${r.b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xesc(r.t)}</w:t></w:r>`;
    }).join('');
    // 줄 간격: PDF에서 잰 값을 글자 크기 기준 고정값으로 (글꼴마다 달라지는 줄 높이를 막음)
    const big = Math.max(...p.runs.map(r => r.sz || 10), p.sz || 0, 10);
    return `<w:p><w:pPr>${pb ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${Math.max(0, Math.round((p.sb || 0) * PT2TW))}" w:after="0" w:line="${Math.round(big * LH * PT2TW)}" w:lineRule="exact"/>${ind}<w:jc w:val="${jc[p.align || 'J']}"/></w:pPr>${runs}</w:p>`;
  };
  const PG = page ? { W: Math.round(page.W * PT2TW), H: Math.round(page.H * PT2TW), l: Math.round(page.ml * PT2TW), r: Math.round(page.mr * PT2TW), t: Math.round(page.mt * PT2TW), b: Math.round(page.mb * PT2TW) } : { W: 11906, H: 16838, l: 1134, r: 1134, t: 1134, b: 1134 };
  const TEXT_W = PG.W - PG.l - PG.r; // 본문 폭
  function tblXml(t){
    const totW = t.cols.reduce((a, b) => a + b, 0) * PT2TW, k = totW > TEXT_W ? TEXT_W / totW : 1;
    const cw = t.cols.map(w => Math.max(200, Math.round(w * PT2TW * k)));
    const owner = t.rows.map(() => t.cols.map(() => null));
    t.cells.forEach(c => { for (let r = c.r; r < c.r + c.rs; r++) for (let q = c.c; q < c.c + c.cs; q++) owner[r][q] = c; });
    const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
    const tw = cw.reduce((a, b) => a + b, 0), ind = Math.max(0, Math.min(TEXT_W - tw, Math.round((t.x1 || 0) * PT2TW)));
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/>${ind ? `<w:tblInd w:w="${ind}" w:type="dxa"/>` : ''}<w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    t.rows.forEach((h, r) => {
      x += `<w:tr><w:trPr><w:trHeight w:val="${Math.max(200, Math.round(h * PT2TW))}"/></w:trPr>`;
      for (let q = 0; q < t.cols.length;) {
        const c = owner[r][q];
        if (!c) { x += `<w:tc><w:tcPr><w:tcW w:w="${cw[q]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; q++; continue; }
        const span = c.cs, w = cw.slice(c.c, c.c + span).reduce((a, b) => a + b, 0);
        const vm = c.rs > 1 ? (c.r === r ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
        const inner = c.r === r ? (c.paras.length ? c.paras.map(p => pXml(p)).join('') : '<w:p/>') : '<w:p/>';
        x += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${vm}<w:vAlign w:val="${c.va === 'T' ? 'top' : 'center'}"/></w:tcPr>${inner}</w:tc>`;
        q += span;
      }
      x += '</w:tr>';
    });
    return x + '</w:tbl>';
  }
  let body = '';
  blocks.forEach((b, i) => {
    if (b.type === 'p') body += pXml(b, b.pb && i > 0);
    else body += (b.pb && i > 0 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + tblXml(b) + '<w:p/>';
  });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="${PG.W}" w:h="${PG.H}"${PG.W > PG.H ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${PG.t}" w:right="${PG.r}" w:bottom="${PG.b}" w:left="${PG.l}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/document.xml', doc],
    ['word/styles.xml', styles],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title || '')}</dc:title><dc:creator>일상툴 PDF 변환</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`]
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
