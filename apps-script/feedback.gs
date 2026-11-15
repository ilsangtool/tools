/**
 * 일상툴 의견함 — 구글 시트용 Apps Script (v1.0)
 *
 * 하는 일
 *  - 일상툴 도구에서 보낸 의견을 이 시트의 '의견' 탭에 한 줄씩 쌓음
 *  - 일상툴 의견함 화면(관리자)에 목록을 보내고, 확인함 표시·삭제를 처리
 *
 * 설치 (한 번만)
 *  1. 구글 시트를 새로 만들고 이름을 '일상툴 의견함'으로 정함
 *  2. 확장 프로그램 → Apps Script → 이 파일 내용을 모두 붙여 넣음
 *  3. 아래 ADMIN_KEY를 나만 아는 낱말로 바꾼 뒤 저장
 *  4. 배포 → 새 배포 → 유형: 웹 앱 → 실행 계정: 나 → 액세스 권한: 모든 사용자 → 배포
 *  5. 권한 허용 후 나오는 '웹 앱 URL'(https://script.google.com/macros/s/…/exec)을 일상툴에 연결
 *  코드를 고친 뒤에는 배포 관리 → 수정 → 버전: 새 버전 → 배포 (URL은 그대로)
 */
const ADMIN_KEY = '여기에-나만-아는-낱말';   // 의견함 화면을 열 때 넣는 비밀 낱말 (10자 이상 권장)

const SHEET = '의견';
const HEAD = ['ID', '받은 시각', '도구 키', '도구', '느낌', '의견', '기기', '물은 때', '확인'];
const NAMES = {
  'pdf-to-hwp': 'PDF 한글 변환·나누기·합치기', 'image-resize': '사진 용량 줄이기', 'id-photo': '증명사진 자르기',
  'weekly-pay': '주휴수당·월급 계산기', 'dutch-pay': '더치페이 정산', 'date-calc': 'D-day·만 나이 계산기',
  'refund-policy': '환불·교환 규정 생성기', 'noshow-policy': '노쇼 규정 문구 생성기', 'review-policy': '리뷰 운영정책 고지문',
  'closed-notice': '휴무 안내문 만들기', 'short-video': '숏폼 영상 만들기'
};
const MOOD = { good: '편했어요', ok: '보통이에요', bad: '불편했어요' };
const WHY = { copy: '결과 복사 뒤', save: '파일 저장 뒤', use: '1분 넘게 쓴 뒤' };
const DEV = { m: '휴대폰', p: 'PC' };
const MAX = 1000;

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rev_(o, v) { for (const k in o) if (o[k] === v) return k; return ''; }

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    sh.setColumnWidth(6, 420);
    sh.hideColumns(1); sh.hideColumns(3);
  }
  return sh;
}
// 셀 수식으로 읽히지 않게 (=, +, -, @ 로 시작하면 앞에 ' 붙임)
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function doGet() { return out_({ ok: true, app: '일상툴 의견함', v: 1 }); }

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, err: 'bad' }); }
  if (d && d.action) return admin_(d);

  // 새 의견
  const a = String(d.a || '');
  if (!NAMES[a]) return out_({ ok: false, err: 'app' });
  const m = String(d.m || '').trim().slice(0, MAX), r = MOOD[d.r] ? d.r : '';
  if (!m && !r) return out_({ ok: false, err: 'empty' });
  // 지나치게 많이 들어오면 잠시 막음: 1분에 30건
  const cache = CacheService.getScriptCache(), n = Number(cache.get('n') || 0);
  if (n >= 30) return out_({ ok: false, err: 'busy' });
  cache.put('n', String(n + 1), 60);

  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_();
    sh.appendRow([Utilities.getUuid().slice(0, 8), new Date(), a, NAMES[a], MOOD[r] || '', safe_(m), DEV[d.d] || '', WHY[d.w] || '', false]);
    sh.getRange(sh.getLastRow(), 9).insertCheckboxes();
  } finally { lock.releaseLock(); }
  return out_({ ok: true });
}

function admin_(d) {
  if (!ADMIN_KEY || ADMIN_KEY === '여기에-나만-아는-낱말' || String(d.key || '') !== ADMIN_KEY) return out_({ ok: false, err: 'key' });
  const sh = sheet_(), last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, HEAD.length).getValues() : [];
  const rowOf = id => { for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(id)) return i + 2; return 0; };

  if (d.action === 'list') {
    return out_({ ok: true, rows: rows.filter(r => r[0]).map(r => ({
      id: String(r[0]), t: r[1] instanceof Date ? r[1].getTime() : Date.parse(r[1]) || 0, a: String(r[2] || rev_(NAMES, r[3])),
      r: rev_(MOOD, r[4]), m: String(r[5] || '').replace(/^'/, ''), d: rev_(DEV, r[6]), w: rev_(WHY, r[7]), c: r[8] === true
    })) });
  }
  if (d.action === 'done') {
    const ids = [].concat(d.ids || d.id || []), v = d.v !== false;
    ids.forEach(id => { const row = rowOf(id); if (row) sh.getRange(row, 9).setValue(v); });
    return out_({ ok: true, n: ids.length });
  }
  if (d.action === 'del') {
    const row = rowOf(d.id); if (!row) return out_({ ok: false, err: 'none' });
    sh.deleteRow(row);
    return out_({ ok: true });
  }
  return out_({ ok: false, err: 'action' });
}
