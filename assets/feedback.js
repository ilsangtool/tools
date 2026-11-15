/* 일상툴 의견 받기 (v1.0)
   - 도구를 실제로 쓴 뒤(결과 복사·파일 저장, 또는 1분 넘게 여러 번 입력) 아래에서 작은 창이 올라옴
   - 모든 입력은 선택. 닫으면 그만이고, 같은 기기에서는 자주 묻지 않음
   - 보내는 내용: 도구 이름, 고른 느낌, 적은 글, 휴대폰/PC 구분, 시각. 이름·연락처·기기 식별값은 보내지 않음
   - 저장: 개발자 구글 시트 (Apps Script 웹 앱, apps-script/feedback.gs). 읽기·관리는 비밀 낱말이 있어야만 됨 */
(function () {
  'use strict';
  // 구글 시트 Apps Script 웹 앱 주소. 비어 있으면 의견 창을 띄우지 않음 (보낼 곳이 없으므로)
  var ENDPOINT = '';
  window.ILSANG_FEEDBACK_URL = ENDPOINT;
  var MAX = 1000;
  var ASK_AGAIN_DAYS = 14, AFTER_SENT_DAYS = 120, MAX_LATER = 2;
  var NAMES = {
    'pdf-to-hwp': 'PDF 한글 변환·나누기·합치기', 'image-resize': '사진 용량 줄이기', 'id-photo': '증명사진 자르기',
    'weekly-pay': '주휴수당·월급 계산기', 'dutch-pay': '더치페이 정산', 'date-calc': 'D-day·만 나이 계산기',
    'refund-policy': '환불·교환 규정 생성기', 'noshow-policy': '노쇼 규정 문구 생성기', 'review-policy': '리뷰 운영정책 고지문',
    'closed-notice': '휴무 안내문 만들기', 'short-video': '숏폼 영상 만들기'
  };
  // 주소에서 도구 이름 찾기: /tools/weekly-pay/ → weekly-pay
  var parts = location.pathname.split('/').filter(function (p) { return p && p !== 'tools' && p !== 'index.html'; });
  var APP = parts.length ? parts[parts.length - 1] : '';
  if (!ENDPOINT || !APP || !NAMES[APP]) return; // 주소가 없거나 첫 화면·관리 화면이면 묻지 않음
  var KEY = 'ilsang_fb_' + APP;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function keep(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function canAsk() {
    var s = load(), now = Date.now(), day = 864e5;
    if (s.sent && now - s.sent < AFTER_SENT_DAYS * day) return false;
    if (s.later && now - s.later < ASK_AGAIN_DAYS * day) return false;
    if ((s.n || 0) >= MAX_LATER && !s.sent) return false;
    return true;
  }

  /* ---- 화면 ---- */
  var css = '' +
    '.fb-sheet{position:fixed;left:50%;bottom:16px;transform:translate(-50%,16px);width:calc(100% - 24px);max-width:440px;background:#fff;border:1px solid var(--line,#e8e0d6);border-radius:14px;box-shadow:0 12px 32px -12px rgba(42,35,36,.28);padding:20px 20px 16px;z-index:80;opacity:0;transition:opacity .2s,transform .2s;font-size:15px;color:var(--ink,#2a2324)}' +
    '.fb-sheet.show{opacity:1;transform:translate(-50%,0)}' +
    '.fb-sheet h2{font-family:var(--serif,serif);font-size:18px;font-weight:600;margin:0 32px 4px 0;line-height:1.45;letter-spacing:-.02em}' +
    '.fb-sheet p.fb-sub{margin:0 0 14px;font-size:13.5px;color:var(--sub,#6b605c);line-height:1.6}' +
    '.fb-x{position:absolute;right:10px;top:10px;min-height:0!important;width:36px;height:36px;padding:0!important;border:0!important;background:none!important;color:var(--faint,#8c7f78)!important;font-size:22px!important;line-height:1;border-radius:8px}' +
    '.fb-x:hover{background:var(--fill,#fbf9f5)!important;color:var(--ink,#2a2324)!important}' +
    '.fb-moods{display:flex;gap:8px;margin:0 0 12px}' +
    '.fb-moods button{flex:1;min-height:42px!important;padding:8px 6px!important;font-size:14px!important;font-weight:500!important;background:#fff!important;color:var(--ink2,#3d3536)!important;border:1px solid var(--line2,#d6cabd)!important;border-radius:10px}' +
    '.fb-moods button[aria-pressed=true]{border-color:var(--accent,#6d1f2c)!important;background:var(--accent-soft,#f6ecec)!important;color:var(--accent,#6d1f2c)!important;font-weight:700!important;box-shadow:inset 0 0 0 1px var(--accent,#6d1f2c)}' +
    '.fb-sheet label{display:block;font-size:13.5px;font-weight:600;margin:0 0 6px;color:var(--ink2,#3d3536)}' +
    '.fb-sheet textarea{width:100%;min-height:84px!important;resize:vertical;font:inherit;font-size:15px;padding:10px 12px;border:1px solid var(--line,#e8e0d6);border-radius:10px;background:#fff;color:inherit;box-sizing:border-box}' +
    '.fb-sheet textarea:focus{outline:none;border-color:var(--accent,#6d1f2c);box-shadow:var(--ring,0 0 0 3px rgba(109,31,44,.14))}' +
    '.fb-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--faint,#8c7f78);margin:6px 0 12px;line-height:1.5}' +
    '.fb-row{display:flex;gap:8px;justify-content:flex-end}' +
    '.fb-row button{min-height:44px!important;padding:10px 16px!important;font-size:14.5px!important}' +
    '.fb-done{font-size:15px;line-height:1.6;margin:4px 0 0}' +
    '@media(prefers-reduced-motion:reduce){.fb-sheet{transition:none}}';
  var MOODS = [['good', '편했어요'], ['ok', '보통이에요'], ['bad', '불편했어요']];

  var shown = false;
  function open(reason) {
    if (shown || !canAsk() || document.querySelector('.fb-sheet')) return;
    shown = true;
    if (!document.getElementById('fb-css')) { var st = document.createElement('style'); st.id = 'fb-css'; st.textContent = css; document.head.appendChild(st); }
    var el = document.createElement('section');
    el.className = 'fb-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'fb-t');
    el.innerHTML =
      '<button type="button" class="fb-x" aria-label="닫기">×</button>' +
      '<h2 id="fb-t">더 개선할 점이 있을까요?</h2>' +
      '<p class="fb-sub">짧게 남겨 주시면 다음 업데이트에 반영하겠습니다. 그냥 닫으셔도 괜찮습니다.</p>' +
      '<div class="fb-moods" role="group" aria-label="사용 느낌 (선택)">' +
      MOODS.map(function (m) { return '<button type="button" data-m="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<label for="fb-m">불편했던 점이나 있었으면 하는 기능 <span style="font-weight:400;color:var(--faint,#8c7f78)">(선택)</span></label>' +
      '<textarea id="fb-m" maxlength="' + MAX + '" placeholder="예: 결과를 이미지로도 저장하고 싶어요"></textarea>' +
      '<div class="fb-meta"><span>이름·연락처는 적지 말아 주세요. 남긴 글은 개발자만 확인합니다.</span><span class="fb-n">0/' + MAX + '</span></div>' +
      '<div class="fb-row"><button type="button" class="ghost fb-later">다음에</button><button type="button" class="fb-send" disabled>보내기</button></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var mood = null, ta = el.querySelector('#fb-m'), send = el.querySelector('.fb-send');
    function upd() { el.querySelector('.fb-n').textContent = ta.value.length + '/' + MAX; send.disabled = !mood && !ta.value.trim(); }
    el.querySelectorAll('.fb-moods button').forEach(function (b) {
      b.addEventListener('click', function () {
        mood = mood === b.dataset.m ? null : b.dataset.m;
        el.querySelectorAll('.fb-moods button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.m === mood)); });
        upd();
      });
    });
    ta.addEventListener('input', upd);
    function close(later) {
      if (later) { var s = load(); s.later = Date.now(); s.n = (s.n || 0) + 1; keep(s); }
      el.classList.remove('show'); setTimeout(function () { el.remove(); }, 220);
      document.removeEventListener('keydown', esc);
    }
    function esc(e) { if (e.key === 'Escape') close(true); }
    document.addEventListener('keydown', esc);
    el.querySelector('.fb-x').addEventListener('click', function () { close(true); });
    el.querySelector('.fb-later').addEventListener('click', function () { close(true); });
    send.addEventListener('click', function () {
      var body = { a: APP, t: Date.now(), r: mood || '', m: ta.value.trim().slice(0, MAX), d: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'm' : 'p', w: reason || '' };
      send.disabled = true; send.textContent = '보내는 중…';
      var payload = JSON.stringify(body);
      // 일반 텍스트로 보내 브라우저 사전 확인 요청을 피함. 응답을 못 읽는 환경(일부 휴대폰)이면 응답 없이 한 번 더 보냄
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j || !j.ok) throw new Error(j && j.err || 'fail'); }, function () {
          return fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload });
        })
        .then(function () {
          var s = load(); s.sent = Date.now(); keep(s);
          el.querySelector('.fb-moods').remove(); el.querySelector('label').remove(); ta.remove(); el.querySelector('.fb-meta').remove(); el.querySelector('.fb-sub').remove();
          el.querySelector('h2').textContent = '남겨 주셔서 감사합니다. 꼭 살펴보겠습니다.';
          el.querySelector('.fb-row').innerHTML = '<button type="button" class="fb-ok">닫기</button>';
          el.querySelector('.fb-ok').addEventListener('click', function () { close(false); });
          setTimeout(function () { if (document.body.contains(el)) close(false); }, 2500);
        })
        .catch(function () { send.disabled = false; send.textContent = '다시 보내기'; el.querySelector('.fb-meta span').textContent = '보내지 못했습니다. 인터넷 연결을 확인해 주세요.'; });
    });
  }

  /* ---- 언제 묻나: 결과를 실제로 쓴 뒤 ---- */
  var t0 = Date.now(), acts = 0, timer = null;
  function used(reason) { if (shown || timer) return; timer = setTimeout(function () { open(reason); }, 1800); }
  // 1) 결과 복사
  document.addEventListener('copy', function () { used('copy'); });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    var w = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (s) { var p = w(s); p.then(function () { used('copy'); }, function () {}); return p; };
  }
  // 2) 파일 저장(내려받기)
  var ac = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) used('save'); return ac.apply(this, arguments); };
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[download]'); if (a) used('save'); }, true);
  // 3) 계산기처럼 복사·저장이 없는 도구: 1분 넘게 쓰고 5번 넘게 입력했을 때
  ['input', 'change'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      if (e.target && e.target.closest && e.target.closest('.fb-sheet')) return;
      acts++; if (acts >= 5 && Date.now() - t0 > 60000) used('use');
    }, true);
  });
  setInterval(function () { if (acts >= 5 && Date.now() - t0 > 60000) used('use'); }, 15000);
})();
