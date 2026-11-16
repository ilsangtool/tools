"""일상툴 법령 기준값 자동 점검 (GitHub Actions에서 주 2회 실행)

원칙: 값은 '공식 법령 원문'에서만 바꾼다. 언론 보도는 절대 반영하지 않는다.

1) 공식 반영 (법제처 국가법령정보센터 Open API, 저장소 비밀값 LAW_OC 필요)
   - 최저시급: 고용노동부 「최저임금 고시」(행정규칙) 본문의 '시간급 ○○원'과 적용 시작일
   - 건강보험료율: 「국민건강보험법 시행령」 직장가입자 보험료율 조항
   - 장기요양보험료율: 「노인장기요양보험법 시행령」 장기요양보험료율 조항
   - 고용보험료율: 「고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령」 실업급여 보험료율
   → 시행일(from)과 함께 data/rules.json에 넣고, 근거 조문·시행일을 이슈로 알림
2) 개정 감지만 (자동 수정하지 않음 → 이슈로 '확인 필요')
   - 근로기준법(주휴), 국민연금법(단계 인상), 전자상거래법·시행령(청약철회), 병역법·시행령(복무기간),
     소비자분쟁해결기준 고시(노쇼 위약금)
3) 언론 보도(구글 뉴스)는 '미리 알림' 용도로만 사용: 공식 원문이 나오기 전 변경 예고를 알려 줌. 반영 안 함.

외부 패키지 없이 표준 라이브러리만 사용.
"""
import datetime as dt, email.utils, hashlib, json, os, re, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_P = os.path.join(REPO_ROOT, 'data', 'rules.json')
STATE_P = os.path.join(REPO_ROOT, 'data', 'law-watch-state.json')
TODAY = dt.date.fromisoformat(os.environ.get('WATCH_DATE') or dt.date.today().isoformat())
UA = {'User-Agent': 'Mozilla/5.0 (ilsangtool law-watch; +https://github.com/ilsangtool/tools)'}
OFFICIAL = '법제처 국가법령정보센터'
log = lambda *a: print('[law-watch]', *a, flush=True)

def http(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')

def rule_at(lst, d):
    out = {}
    for x in sorted([x for x in lst if x['from'] <= d], key=lambda x: x['from']): out.update(x)
    return out

def ymd8(s):  # '20270101' → '2027-01-01'
    s = re.sub(r'\D', '', str(s or ''))
    return f'{s[:4]}-{s[4:6]}-{s[6:8]}' if len(s) >= 8 else None

def flat(o):
    """API 응답(JSON) 안의 모든 문자열을 이어 붙여 본문 텍스트로 만듦"""
    if isinstance(o, dict): return '\n'.join(flat(v) for v in o.values())
    if isinstance(o, list): return '\n'.join(flat(v) for v in o)
    return str(o) if o is not None else ''

# ---------- 국가법령정보센터 Open API ----------
class LawAPI:
    BASE = 'https://www.law.go.kr/DRF/'
    def __init__(self, oc):
        self.oc, self.error = oc, None
        self.fx = json.load(open(os.environ['LAW_FIXTURE'], encoding='utf-8')) if os.environ.get('LAW_FIXTURE') else None
    def call(self, path, **p):
        key = path + '|' + '|'.join(f'{k}={p[k]}' for k in sorted(p))
        if self.fx is not None:
            return self.fx.get(key)
        url = self.BASE + path + '?' + urllib.parse.urlencode({'OC': self.oc, 'type': 'JSON', **p})
        try:
            txt = http(url)
        except Exception as e:
            self.error = f'{type(e).__name__}: {e}'; log('API 실패', key, self.error); return None
        if '시스템 점검' in txt[:600]:
            self.error = 'MAINTENANCE: 국가법령정보센터 시스템 점검 중'; return None
        if '검증에 실패' in txt or ('차단' in txt[:300]):
            self.error = '인증 실패(OC 값, 승인 여부, 등록 IP 확인 필요): ' + re.sub(r'\s+', ' ', txt[:200]); return None
        try: return json.loads(txt)
        except Exception:
            self.error = '응답 해석 실패: ' + re.sub(r'\s+', ' ', txt[:200]); return None

    def law_versions(self, name):
        """같은 이름 법령의 현행·시행예정 버전들: [{mst, eff, prom, name}]"""
        # eflaw = 시행일 기준 법령 목록 (현행 + 공포됐지만 아직 시행 전인 판 포함) — 건축앱과 같은 방식
        j = self.call('lawSearch.do', target='eflaw', query=name, display=100, sort='efdes')
        if not j: return None
        rows = j.get('LawSearch', {}).get('law', [])
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for r in rows:
            if str(r.get('법령명한글', '')).replace(' ', '') != name.replace(' ', ''): continue
            out.append({'mst': str(r.get('법령일련번호')), 'eff': ymd8(r.get('시행일자')), 'prom': ymd8(r.get('공포일자')),
                        'status': r.get('현행연혁코드', ''), 'name': r.get('법령명한글')})
        return out

    def law_text(self, mst, eff=None):
        p = {'target': 'eflaw', 'MST': mst}
        if eff: p['efYd'] = eff.replace('-', '')
        j = self.call('lawService.do', **p)
        return flat(j) if j else None

    def admrul_versions(self, query, must):
        j = self.call('lawSearch.do', target='admrul', query=query, display=50)
        if not j: return None
        rows = j.get('AdmRulSearch', {}).get('admrul', [])
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for r in rows:
            nm = str(r.get('행정규칙명', ''))
            if all(m in nm for m in must):
                out.append({'id': str(r.get('행정규칙일련번호')), 'eff': ymd8(r.get('시행일자')), 'prom': ymd8(r.get('발령일자')), 'name': nm})
        return out

    def admrul_text(self, rid):
        j = self.call('lawService.do', target='admrul', ID=rid)
        return flat(j) if j else None

def law_link(name): return 'https://www.law.go.kr/법령/' + urllib.parse.quote(name.replace(' ', ''))

# ---------- 본문에서 값 뽑기 ----------
DEN = {'천': 1000, '만': 10000, '십만': 100000, '백만': 1000000}
def fraction_after(text, anchor, span=160):
    """'anchor ... 1만분의 719' → 0.0719 (비율). 못 찾으면 None"""
    pat = r'\s*'.join(map(re.escape, anchor.replace(' ', '')))
    for m in re.finditer(pat, text):
        seg = text[m.end(): m.end() + span]
        f = re.search(r'(\d*)\s*(백만|십만|만|천)분의\s*([\d.]+)', seg)
        if f:
            return float(f.group(3)) / (int(f.group(1) or 1) * DEN[f.group(2)])
    return None

def parse_min_wage(text, eff):
    m = re.search(r'시간급\s*([\d,]+)\s*원', text)
    if not m: return None
    v = int(m.group(1).replace(',', ''))
    y = re.search(r'(20\d\d)\s*[.년]\s*0?1\s*[.월]\s*0?1\s*[.일]?\s*(?:부터|~|∼)', text)
    if y: year = int(y.group(1))
    elif eff: year = int(eff[:4]) if eff[5:7] == '01' else int(eff[:4]) + 1
    else: return None
    return (year, v)

# ---------- 공식 점검 ----------
VALUE_LAWS = {
    '국민건강보험법 시행령': [('hi', '직장가입자의 보험료율은', (0.06, 0.095))],
    '노인장기요양보험법 시행령': [('ltcIncome', '장기요양보험료율은', (0.006, 0.016))],
    '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령': [('ei', '실업급여의 보험료율', (0.014, 0.026))],
}
WATCH_ONLY_LAWS = {
    '근로기준법': 'weekly-pay (주휴수당 조건, 제55조)', '근로기준법 시행령': 'weekly-pay (주휴일, 제30조)',
    '국민연금법': 'weekly-pay (국민연금 보험료율 단계 인상)',
    '전자상거래 등에서의 소비자보호에 관한 법률': 'refund-policy (청약철회 제17조·제18조)',
    '전자상거래 등에서의 소비자보호에 관한 법률 시행령': 'refund-policy',
    '병역법': 'date-calc (복무기간)', '병역법 시행령': 'date-calc (복무기간)',
    '부가가치세법 시행령': 'tax-calc·account-book (간이과세 업종별 부가가치율 제111조)',
    '조세특례제한법': 'tax-calc (중소기업 감면·최저한세 등)',
    '관공서의 공휴일에 관한 규정': 'tax-calc 신고 일정 (공휴일·대체공휴일 규칙) — _build/lib/holidays.js',
    '공휴일에 관한 법률': 'tax-calc 신고 일정 (공휴일 종류) — _build/lib/holidays.js',
}
WATCH_ONLY_ADMRUL = {'소비자분쟁해결기준': 'noshow-policy (외식업 예약부도 위약금)'}
LABEL = {'hi': '건강보험료율', 'ei': '실업급여 보험료율', 'ltcRatio': '장기요양보험료율'}

def set_insurance(R, frm, field, val, src):
    ent = next((x for x in R['insurance'] if x['from'] == frm), None)
    if not ent:
        ent = {'from': frm}; R['insurance'].append(ent); R['insurance'].sort(key=lambda x: x['from'])
    ent[field] = val
    pend = ent.get('pending') or []
    if field in pend: pend.remove(field)
    if pend: ent['pending'] = pend
    else: ent.pop('pending', None)
    srcs = [s for s in re.split(r'\s*/\s*', ent.get('source', '')) if s and not s.startswith(field + ':')]
    ent['source'] = ' / '.join(srcs + [src])

def official_check(api, R, S, notes):
    """공식 원문 기준으로 R(rules)을 고치고, 알릴 내용을 notes에 담음. 성공한 조회 수 반환"""
    ok = 0
    base = S.setdefault('official', {})
    # 1) 최저임금 고시
    vers = api.admrul_versions('최저임금', ('최저임금', '고시'))
    if vers is not None:
        ok += 1
        for v in sorted(vers, key=lambda x: x['eff'] or '')[-3:]:
            t = api.admrul_text(v['id'])
            p = parse_min_wage(t, v['eff']) if t else None
            if not p: continue
            year, wage = p
            frm = f'{year}-01-01'
            prev = rule_at(R['minWage'], f'{year - 1}-01-01').get('hourly') or wage
            if not (prev * 0.9 <= wage <= prev * 1.4):
                notes.append(('[확인 필요] 최저임금 고시 값이 정상 범위를 벗어남', f'{v["name"]}: 시간급 {wage:,}원 (직전 {prev:,}원). 자동 반영하지 않았습니다.')); continue
            cur = next((x for x in R['minWage'] if x['from'] == frm), None)
            src = f'{v["name"]} (발령 {v["prom"]}, {OFFICIAL})'
            if cur and cur['hourly'] == wage and cur.get('official'): continue
            R['minWage'] = [x for x in R['minWage'] if x['from'] != frm] + [{'from': frm, 'hourly': wage, 'source': src, 'official': True}]
            R['minWage'].sort(key=lambda x: x['from'])
            if not cur or cur['hourly'] != wage:
                notes.append((f'[공식 반영] {year}년 최저시급 {wage:,}원', f'근거: {src}\n적용: {frm}부터\n\n{year}.1.1부터 도구에 자동 적용됩니다.'))
            else:
                notes.append((f'[공식 확인] {year}년 최저시급 {wage:,}원이 고시 원문과 일치', f'근거: {src}'))
    # 2) 보험료율 시행령 (현행 + 시행 예정 버전)
    for law, specs in VALUE_LAWS.items():
        vers = api.law_versions(law)
        if vers is None: continue
        ok += 1
        for v in sorted(vers, key=lambda x: x['eff'] or ''):
            if not v['eff'] or v['eff'] < f'{TODAY.year - 1}-01-01': continue
            t = api.law_text(v['mst'], v['eff'])
            if not t: continue
            for key, anchor, (lo, hi_) in specs:
                f = fraction_after(t, anchor)
                if f is None:
                    notes.append((f'[확인 필요] {law}에서 보험료율 조항을 찾지 못함', f'조문 표현이 바뀌었을 수 있습니다. 찾은 기준 문구: "{anchor}"\n{law_link(law)}')); continue
                if not (lo <= f <= hi_):
                    notes.append((f'[확인 필요] {law} 보험료율이 정상 범위 밖', f'{f*100:.4f}% — 자동 반영하지 않았습니다.\n{law_link(law)}')); continue
                frm = v['eff']
                if key == 'ltcIncome':
                    field, val = 'ltcRatio', round(f / (rule_at(R['insurance'], frm)['hi'] * 2), 6)
                else:
                    field, val = key, round(f / 2, 6)
                now = rule_at(R['insurance'], frm)
                cur = now.get(field)
                ent = next((x for x in R['insurance'] if x['from'] == frm), {})
                pending = field in (ent.get('pending') or []) or (field in (now.get('pending') or []))
                if cur is not None and abs(cur - val) < 5e-5 and not pending: continue
                set_insurance(R, frm, field, val, f'{field}: {law} (시행 {frm}, {OFFICIAL})')
                if cur is None or abs(cur - val) >= 5e-5:
                    notes.append((f'[공식 반영] {frm} 시행 {LABEL[field]} {f*100:.4g}%', f'근거: {law}\n시행일: {frm}\n원문: {law_link(law)}\n\n시행일부터 도구에 자동 적용됩니다.'))
                else:
                    notes.append((f'[공식 확인] {frm} {LABEL[field]} {f*100:.4g}%가 법령 원문과 일치', f'미리 넣어 둔 값을 {law} 원문으로 확정했습니다.'))
    # 3) 개정 감지만
    def watch(key, sig, title, body):
        old = base.get(key); base[key] = sig
        if old is not None and sig != old: notes.append((title, body))
    for law, tool in WATCH_ONLY_LAWS.items():
        vers = api.law_versions(law)
        if vers is None: continue
        ok += 1
        sig = sorted([v['mst'], v['eff']] for v in vers)
        new = [v for v in vers if [v['mst'], v['eff']] not in (base.get(law) or [])]
        watch(law, sig, f'[확인 필요] {law} 개정 감지 — {tool}',
              '새 버전: ' + ', '.join(f'시행 {v["eff"]} (공포 {v["prom"]})' for v in new) + f'\n원문: {law_link(law)}\n\n'
              '바뀐 조문이 도구에 영향을 주면 `data/rules.json`에 새 시행일 항목을 추가해 주세요.')
    for q, tool in WATCH_ONLY_ADMRUL.items():
        vers = api.admrul_versions(q, (q,))
        if vers is None: continue
        ok += 1
        watch('admrul:' + q, sorted([v['id'], v['eff']] for v in vers), f'[확인 필요] {q} 고시 개정 감지 — {tool}',
              f'국가법령정보센터 행정규칙에서 새 버전이 확인됐습니다.\nhttps://www.law.go.kr/행정규칙/{urllib.parse.quote(q)}')
    return ok


# ---------- 세무 앱(장부·세무 계산기) 값: 세율표·간이과세 기준·간이세액표·공휴일 ----------
WAGE_P = os.path.join(REPO_ROOT, 'data', 'wage-table.json')
HOL_P = os.path.join(REPO_ROOT, 'data', 'holidays.json')

def kamount(s):
    """'1억5천만' → 150000000, '3천억' → 300000000000, '1,400만' → 14000000"""
    s = re.sub(r'[\s,]', '', s or '')
    def small(t):
        if not t: return 0
        m = re.fullmatch(r'(?:(\d+)천)?(?:(\d+)백)?(\d+)?', t)
        if not m: raise ValueError(t)
        return int(m.group(1) or 0) * 1000 + int(m.group(2) or 0) * 100 + int(m.group(3) or 0)
    total = 0
    if '억' in s:
        a, s = s.split('억', 1); total += small(a) * 10 ** 8
    if s.endswith('만'): total += small(s[:-1]) * 10 ** 4
    elif s: total += small(s)
    return total

MONEY = r'(\d[\d,]*(?:\s*[억천백만]\s*\d*[\d,]*)*\s*[억천백만]?)원'
def article(text, no, nxt):
    """본문에서 '제55조(' ~ 다음 조문 앞까지 (조문 제목이 붙은 첫 위치)"""
    m = re.search(r'제\s*' + no + r'\s*조\s*\(', text)
    if not m: return None
    a, _, b = nxt.partition('조의')
    e = re.search(r'제\s*' + a + (r'\s*조의\s*' + b if b else r'\s*조') + r'\s*\(', text[m.end():])
    return text[m.start(): m.end() + (e.start() if e else 6000)]

def article_json(j, no):
    """API 응답(JSON)에서 제no조 제1항(표가 든 첫 호까지)의 글자. 장·절 제목 줄은 건너뜀"""
    units = (((j or {}).get('법령') or {}).get('조문') or {}).get('조문단위') or []
    units = units if isinstance(units, list) else [units]
    for u in units:
        if str(u.get('조문번호')) != str(no) or u.get('조문가지번호') or u.get('조문여부') == '전문': continue
        out = [str(u.get('조문내용') or '')]
        hang = u.get('항') or []
        hang = hang if isinstance(hang, list) else [hang]
        if hang:
            h = hang[0]; out.append(str(h.get('항내용') or ''))
            ho = h.get('호') or []
            for x in (ho if isinstance(ho, list) else [ho]):
                out.append(str(x.get('호내용') or ''))
                if '┌' in str(x.get('호내용') or ''): break
        return '\n'.join(out)
    return None

def parse_brackets(seg):
    """세율표: '○○원 이하' 경계와 'N퍼센트'/'100분의 N' 세율. 실패하면 None"""
    if not seg: return None
    first = seg if '┌' in seg or not re.search(r'②', seg) else re.split(r'②', seg, maxsplit=1)[0]
    th = [kamount(m) for m in re.findall(MONEY + r'\s*이하', first)]
    rates = [float(a or b) / 100 for a, b in re.findall(r'100분의\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*퍼센트', first)]
    th = [t for i, t in enumerate(th) if i == 0 or t > th[i - 1]]
    if len(th) < 3 or len(rates) < len(th) + 1: return None
    rates = rates[:len(th) + 1]
    if any(not 0 < r < 0.6 for r in rates) or any(rates[i] >= rates[i + 1] for i in range(len(rates) - 1)): return None
    return [[t, r] for t, r in zip(th, rates)] + [[None, rates[-1]]]

TAX_VALUE_LAWS = [  # (법령, 조, 다음 조, rules 키, 필드, 해석 함수, 이름)
    ('소득세법', '55', '56', 'incomeTax', 'brackets', parse_brackets, '종합소득세 세율'),
    ('법인세법', '55', '55조의2', 'corpTax', 'brackets', parse_brackets, '법인세 세율'),
    ('부가가치세법 시행령', '109', '110', 'vat', 'simpleLimit',
     lambda s: (lambda m: kamount(m.group(1)) if m else None)(re.search(MONEY + r'을\s*말한다', s or '')), '간이과세 기준금액'),
    ('부가가치세법', '69', '70', 'vat', 'simpleExempt',
     lambda s: (lambda m: kamount(m.group(1)) if m else None)(re.search(MONEY + r'\s*미만', s or '')), '간이과세자 납부의무 면제 기준'),
]
RANGE = {'simpleLimit': (5e7, 3e8), 'simpleExempt': (2e7, 1.5e8)}

def tax_law_check(api, R, S, notes):
    ok = 0
    for law, no, nxt, key, field, fn, label in TAX_VALUE_LAWS:
        vers = api.law_versions(law)
        if vers is None: continue
        ok += 1
        cur_v = [v for v in vers if v['status'] == '현행' and v['eff']]
        check = sorted(cur_v, key=lambda x: x['eff'])[-1:] + [v for v in vers if v['status'] == '시행예정' and v['eff'] and v['eff'] > TODAY.isoformat()
                                                              and (not cur_v or v['prom'] >= max(c['prom'] or '' for c in cur_v))]
        failed = []
        for v in sorted(check, key=lambda x: x['eff']):
            j = api.call('lawService.do', target='eflaw', MST=v['mst'], efYd=v['eff'].replace('-', ''))
            if not j: continue
            seg = article_json(j, no)
            got = fn(seg) if seg else None
            if got is None or (field in RANGE and not RANGE[field][0] <= got <= RANGE[field][1]):
                failed.append(v['eff']); continue
            cur = rule_at(R[key], v['eff']).get(field)
            if cur == got: continue
            odd = (field == 'brackets' and cur and (len(cur) != len(got) or any(abs(a[1] - b[1]) > 0.05 for a, b in zip(cur, got)))) or \
                  (field != 'brackets' and cur and not 0.5 <= got / cur <= 2)
            if odd:
                notes.append((f'[확인 필요] {law} 제{no}조 {label}이 크게 달라 자동 반영하지 않음',
                              f'시행 {v["eff"]} 판에서 읽은 값: {got}\n지금 값: {cur}\n원문을 확인해 data/rules.json에 직접 넣어 주세요.\n{law_link(law)}'))
                continue
            ent = next((x for x in R[key] if x['from'] == v['eff']), None)
            if not ent: ent = {'from': v['eff']}; R[key].append(ent); R[key].sort(key=lambda x: x['from'])
            ent[field] = got; ent['official'] = True
            ent['source'] = (ent.get('source', '') + ' / ' if ent.get('source') else '') + f'{field}: {law} 제{no}조 (시행 {v["eff"]}, {OFFICIAL})'
            show = ', '.join(f'{"초과" if c is None else f"{c:,}원 이하"} {r*100:g}%' for c, r in got) if field == 'brackets' else f'{got:,}원'
            notes.append((f'[공식 반영] {v["eff"]} 시행 {label} 변경', f'근거: {law} 제{no}조\n새 값: {show}\n이전 값: {cur}\n원문: {law_link(law)}\n\n시행일부터 장부·세무 계산기에 자동 적용됩니다.'))
        if failed:   # 법령마다 한 건만, 같은 실패는 한 번만 알림 (once 키가 제목·본문 기준)
            notes.append((f'[확인 필요] {law} 제{no}조에서 {label}을 읽지 못함',
                          f'조문 표현이 바뀌었을 수 있습니다. 값은 바꾸지 않았습니다.\n{law_link(law)}'))
    return ok

# --- 근로소득 간이세액표 (소득세법 시행령 별표 2) ---
def parse_wage_text(text):
    """별표 2 PDF를 글자로 바꾼 내용에서 표·자녀 공제·10,000천원 초과 계산식을 읽음. 이상하면 ValueError"""
    rows, last = [], None
    for line in text.splitlines():
        s = line.replace('　', ' ')
        if re.search(r'10,000\s*천원(?!\s*(초과|을))', s) and not re.search(r'초과|이하|미만', s):
            nums = re.findall(r'\d[\d,]*|-', s.split('천원', 1)[1])
            if len(nums) >= 11: last = [0 if x == '-' else int(x.replace(',', '')) for x in nums[:11]]
            continue
        toks = re.findall(r'(?<![\d.])\d[\d,]*(?![\d.])|(?<!\S)[-－](?!\S)', s)
        if len(toks) < 13: continue
        vals = [0 if x in '-－' else int(x.replace(',', '')) for x in toks[:13]]
        lo, hi = vals[0], vals[1]
        if 500 <= lo < hi <= 10000: rows.append([lo, hi] + vals[2:13])
    rows.sort(key=lambda r: r[0])
    uniq = []
    for r in rows:
        if not uniq or uniq[-1][0] != r[0]: uniq.append(r)
    rows = uniq
    if len(rows) < 600 or not last: raise ValueError(f'표 줄을 {len(rows)}개만 읽음 (10,000천원 줄 {"있음" if last else "없음"})')
    for a, b in zip(rows, rows[1:]):
        if a[1] != b[0]: raise ValueError(f'구간이 끊김: {a[:2]} → {b[:2]}')
        if any(b[i] < a[i] for i in range(2, 13)): raise ValueError(f'월급이 늘었는데 세액이 줄어듦: {b[:2]}')
    if rows[-1][1] != 10000: raise ValueError('마지막 구간이 10,000천원이 아님')
    for r in rows + [[0, 0] + last]:
        if any(r[i] < r[i + 1] for i in range(2, 12)): raise ValueError(f'가족이 늘었는데 세액이 늘어남: {r[:2]}')
    rows.append([10000, 10000] + last)
    flat_t = re.sub(r'\s+', ' ', text)
    c1 = re.search(r'자녀가\s*1명인\s*경우\s*:?\s*([\d,]+)\s*원', flat_t)
    c2 = re.search(r'자녀가\s*2명인\s*경우\s*:?\s*([\d,]+)\s*원', flat_t)
    c3 = re.search(r'3명\s*이상인\s*경우\s*:?\s*[\d,]+\s*원\s*\+\s*2명\s*초과\s*자녀\s*1명당\s*([\d,]+)\s*원', flat_t)
    child = [int(m.group(1).replace(',', '')) for m in (c1, c2, c3)] if c1 and c2 and c3 else None
    over = []
    for m in re.finditer(r'([\d,]+)\s*천원\s*초과\s*(?:([\d,]+)\s*천원\s*이하)?\s*[^()]{0,40}?\(\s*10,000\s*천원인\s*경우의\s*해당\s*세액\s*\)(.{0,160}?)상당액', flat_t):
        body = m.group(3)
        p = re.search(r'([\d,]+)\s*천원을\s*초과하는\s*금액(?:에\s*(\d+)\s*%를\s*곱한\s*금액)?의\s*(\d+)\s*%', body)
        add = re.findall(r'\(\s*([\d,]+)\s*원\s*\)', body) or re.findall(r'\(\s*([\d,]+)\s*원\s*\)', flat_t[m.end(): m.end() + 30])
        if not p: continue
        over.append([int(m.group(2).replace(',', '')) if m.group(2) else None, int(p.group(1).replace(',', '')),
                     int(p.group(2)) / 100 if p.group(2) else 1, int(p.group(3)) / 100, int(add[0].replace(',', '')) if add else 0])
    for i in range(len(over) - 1): over[i][0] = over[i + 1][1]   # 구간 끝 = 다음 구간 시작
    if over: over[-1][0] = None
    if len(over) < 3 or any(over[i][1] >= over[i + 1][1] for i in range(len(over) - 1)): over = None
    return rows, child, over

def wage_table_check(api, S, notes):
    """법제처 별표 목록에서 소득세법 시행령 별표 2가 새로 공포되면 PDF를 받아 data/wage-table.json에 새 시행일 판을 더함"""
    j = api.call('lawSearch.do', target='licbyl', query='근로소득 간이세액표', display=50)
    if not j: return 0
    found = []
    def walk(o):
        if isinstance(o, dict):
            if any('별표명' in k for k in o): found.append(o)
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(j)
    cand = [r for r in found if '간이세액표' in str(r.get('별표명', '')) and '소득세법' in str(r.get('관련법령명', '')) and '시행령' in str(r.get('관련법령명', ''))]
    if not cand: return 1
    r = max(cand, key=lambda x: str(x.get('공포일자', '')))
    prom = ymd8(r.get('공포일자'))
    sig = f'{r.get("별표일련번호")}|{prom}'
    base = S.setdefault('official', {})
    if base.get('wageTable') == sig: return 1
    W = json.load(open(WAGE_P, encoding='utf-8'))
    if prom and any(prom <= v['from'] for v in W['versions']) and base.get('wageTable') is None:
        base['wageTable'] = sig; return 1   # 처음 실행: 이미 넣어 둔 판과 같음
    links = [str(v) for k, v in r.items() if 'PDF' in k.upper() and v] + [str(v) for k, v in r.items() if '링크' in k and 'flDownload' in str(v)]
    link = next((l for l in links if l), None)
    page = law_link('소득세법 시행령')
    if not link:
        notes.append(('[확인 필요] 근로소득 간이세액표 개정 감지 — PDF 주소를 찾지 못함', f'공포 {prom}. 별표 2 원문을 확인해 주세요.\n{page}')); return 1
    url = link if link.startswith('http') else 'https://www.law.go.kr' + link
    try:
        import subprocess, tempfile
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as resp: pdf = resp.read()
        fd, path = tempfile.mkstemp(suffix='.pdf'); os.write(fd, pdf); os.close(fd)
        text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, timeout=120).stdout
        rows, child, over = parse_wage_text(text)
    except Exception as e:
        notes.append(('[확인 필요] 근로소득 간이세액표 개정 감지 — 자동 반영 실패', f'공포 {prom}, 원문 {url}\n오류: {e}\n\n표는 바꾸지 않았습니다. 다음 점검 때 다시 시도합니다.')); return 1
    vers = api.law_versions('소득세법 시행령') or []
    eff = min([v['eff'] for v in vers if v['prom'] == prom and v['eff']] or [prom])
    cur = {}
    for v in sorted(W['versions'], key=lambda x: x['from']):
        if v['from'] <= eff: cur.update(v)
    new = {'from': eff, 'source': f'소득세법 시행령 별표 2 ({prom.replace("-", ".")} 개정, {OFFICIAL} 원문 자동 반영)', 'official': True}
    if rows != cur.get('rows'): new['rows'] = rows
    if child and child != cur.get('child'): new['child'] = child
    if over and over != cur.get('over'): new['over'] = over
    changed = [k for k in ('rows', 'child', 'over') if k in new]
    base['wageTable'] = sig
    if not changed:   # 별표가 다시 공포됐지만 표·자녀 공제·계산식이 그대로면 파일은 두고 확인만 알림
        notes.append((f'[공식 확인] 근로소득 간이세액표 재공포({prom}) — 내용 같음', f'원문: {url}\n표 {len(rows)}줄·자녀 공제·10,000천원 초과 계산식이 지금 값과 같아 바꾸지 않았습니다.'))
        return 1
    W['versions'] = [v for v in W['versions'] if v['from'] != eff] + [new]
    W['versions'].sort(key=lambda x: x['from']); W['checkedAt'] = TODAY.isoformat()
    def dump(v):
        head = '    ' + json.dumps({k: x for k, x in v.items() if k != 'rows'}, ensure_ascii=False)
        return head if 'rows' not in v else head[:-1] + ', "rows": [\n' + ',\n'.join('      ' + json.dumps(r) for r in v['rows']) + '\n    ]}'
    txt = json.dumps({k: v for k, v in W.items() if k != 'versions'}, ensure_ascii=False, indent=2)[:-2] + ',\n  "versions": [\n' + ',\n'.join(dump(v) for v in W['versions']) + '\n  ]\n}\n'
    open(WAGE_P, 'w', encoding='utf-8').write(txt)
    base['wageTable'] = sig
    notes.append((f'[공식 반영] 근로소득 간이세액표 {eff} 적용분', f'근거: 소득세법 시행령 별표 2 (공포 {prom})\n원문: {url}\n바뀐 부분: {", ".join(changed) or "없음(표 본문 같음)"}\n표 {len(rows)}줄, 자녀 공제 {child or "기존 값 유지"}\n\n{eff}부터 장부 급여대장·세무 계산기에 자동 적용됩니다.'))
    return 1

# --- 공휴일: 한국천문연구원 특일정보 (공공데이터포털, 비밀값 HOLIDAY_KEY) ---
def holiday_sync(notes):
    key = (os.environ.get('HOLIDAY_KEY') or '').strip()
    if not key: return None
    H = json.load(open(HOL_P, encoding='utf-8')) if os.path.exists(HOL_P) else {'years': {}}
    years = H.setdefault('years', {})
    changed = []
    for y in range(TODAY.year - 1, TODAY.year + 3):
        got = {}
        url = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?' + urllib.parse.urlencode(
            {'serviceKey': key, 'solYear': y, 'numOfRows': 100, '_type': 'json'}, safe='%')
        try: j = json.loads(http(url, timeout=40))
        except Exception as e: log('공휴일 API 실패', y, e); continue
        items = (((j.get('response') or {}).get('body') or {}).get('items') or {})
        items = items.get('item', []) if isinstance(items, dict) else []
        for it in (items if isinstance(items, list) else [items]):
            if it.get('isHoliday') == 'Y' and ymd8(it.get('locdate')):
                d = ymd8(it['locdate']); got[d] = (got[d] + '·' if d in got else '') + str(it.get('dateName', '공휴일'))
        if got is None or len(got) < 10: continue   # 아직 발표 전인 해는 계산값을 그대로 씀
        if years.get(str(y)) != got:
            old = years.get(str(y)) or {}
            years[str(y)] = got
            add = sorted(set(got) - set(old))
            if old: changed.append(f'{y}년: ' + ', '.join(f'{d} {got[d]}' for d in add) if add else f'{y}년 명칭·구성 변경')
    H['source'] = '한국천문연구원 특일정보 (공공데이터포털)'; H['checkedAt'] = TODAY.isoformat()
    json.dump(H, open(HOL_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(HOL_P, 'a').write('\n')
    if changed: notes.append(('[공식 반영] 공휴일 변경 (임시공휴일 등)', '\n'.join(changed) + '\n\n세무 신고 일정의 기한 계산에 자동 반영됩니다.'))
    return True

# ---------- 언론 보도: 미리 알림만 (반영 안 함) ----------
def news(query, days=21):
    if os.environ.get('NEWS_FIXTURE'):
        return [x for x in json.load(open(os.environ['NEWS_FIXTURE'], encoding='utf-8')) if x.get('q') == query]
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q': f'{query} when:{days}d', 'hl': 'ko', 'gl': 'KR', 'ceid': 'KR:ko'})
    try: root = ET.fromstring(http(url))
    except Exception as e: log('뉴스 조회 실패', query, e); return []
    out = []
    for it in root.iter('item'):
        title, src = (it.findtext('title') or '').strip(), (it.findtext('source') or '').strip()
        if src and title.endswith(' - ' + src): title = title[: -len(src) - 3]
        try: d = email.utils.parsedate_to_datetime(it.findtext('pubDate')).date()
        except Exception: d = TODAY
        out.append({'title': title, 'link': it.findtext('link') or '', 'source': src, 'date': d.isoformat()})
    return out

NUM = r'\d[\d,]*\s*(?:원|%)|\d만\s*\d*\s*원'
FOREIGN = ['프랑스', '미국', '일본', '중국', '독일', '영국', '호주', '캐나다', '베트남', '해외', '각국']
HEADS_UP = [
    ('최저임금 결정', ['최저임금'], ['결정', '확정', '의결', '고시'], NUM),
    ('건강보험료율 결정', ['건강보험료율'], ['결정', '인상', '동결', '의결'], NUM),
    ('장기요양보험료율 결정', ['장기요양보험료율'], ['결정', '인상', '동결', '의결'], NUM),
    ('고용보험료율 인상', ['고용보험료율', '실업급여 보험료율'], ['인상', '결정', '조정'], NUM),
    ('노쇼 위약금 소비자분쟁해결기준', ['노쇼', '예약부도'], ['개정', '상향', '변경'], None),
    ('전자상거래법 청약철회 개정', ['청약철회'], ['개정', '변경'], None),
    ('병 복무기간 단축', ['복무기간', '복무 기간'], ['단축', '개정', '변경'], None),
    ('주휴수당 근로기준법 개정', ['주휴수당'], ['개정', '폐지', '국회 통과'], None),
]

# ---------- GitHub 이슈 ----------
def issue(title, body):
    tok, repo = os.environ.get('GITHUB_TOKEN'), os.environ.get('GITHUB_REPOSITORY')
    if not tok or not repo:
        log('ISSUE (로컬 출력)', title); print(body); return
    req = urllib.request.Request(f'https://api.github.com/repos/{repo}/issues', method='POST',
        data=json.dumps({'title': title, 'body': body}).encode(),
        headers={'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json', **UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: log('이슈 생성', r.status, title)
    except Exception as e: log('이슈 생성 실패', e)

def main():
    R = json.load(open(RULES_P, encoding='utf-8'))
    S = json.load(open(STATE_P, encoding='utf-8')) if os.path.exists(STATE_P) else {}
    seen = set(S.get('seen', []))
    def once(key, title, body):
        if key in seen: return
        seen.add(key); issue(title, body)

    oc = (os.environ.get('LAW_OC') or os.environ.get('LAW_API_OC') or '').strip()
    notes = []
    if oc:
        api = LawAPI(oc)
        n = official_check(api, R, S, notes)
        n += tax_law_check(api, R, S, notes)
        n += wage_table_check(api, S, notes)
        status = {'officialOk': n, 'officialError': api.error}
        if n == 0:
            # 사이트 점검·일시 장애는 흔하므로, 연속 2회 실패할 때만 알림 (점검 중이면 알림 안 함)
            fails = (S.get('status') or {}).get('consecutiveFail', 0) + 1
            status['consecutiveFail'] = fails
            maint = (api.error or '').startswith('MAINTENANCE')
            if fails >= 2 and not maint:
                wk = TODAY.isocalendar()
                once(f'offfail:{wk[0]}-{wk[1]}', '[점검 실패] 국가법령정보센터에 연속으로 접속하지 못했습니다',
                     f'오류: {api.error}\n\n값은 바꾸지 않았습니다. 비밀값 LAW_API_OC(가입 이메일 @ 앞부분)를 확인해 주세요. 다음 점검 때 다시 시도합니다.')
        else:
            status['consecutiveFail'] = 0
            R['officialCheckedAt'] = TODAY.isoformat()
    else:
        status = {'officialOk': 0, 'officialError': 'LAW_OC 없음'}
        once('setup:law_oc', '[설정 필요] 공식 법령 자동 반영을 켜려면 LAW_OC가 필요합니다',
             '지금은 공식 원문을 읽지 못해 **어떤 값도 자동으로 바꾸지 않고** 보도 알림만 보냅니다.\n\n'
             '1. https://open.law.go.kr 가입 → OPEN API 신청 (법령·행정규칙 체크)\n'
             '2. 승인 후 가입 이메일의 @ 앞부분(OC)을 저장소 Settings → Secrets and variables → Actions → New repository secret 에 이름 `LAW_OC`로 저장\n'
             '3. Actions → 법령 기준값 자동 점검 → Run workflow')
    if holiday_sync(notes) is None:
        once('setup:holiday_key', '[설정 필요] 임시공휴일까지 자동 반영하려면 HOLIDAY_KEY가 필요합니다',
             '지금도 설·추석·대체공휴일·선거일은 규칙과 음력 계산으로 해마다 자동 계산됩니다. 정부가 따로 지정하는 **임시공휴일**까지 넣으려면:\n\n'
             '1. https://www.data.go.kr/data/15012690/openapi.do (한국천문연구원_특일 정보) 활용신청 — 바로 승인\n'
             '2. 마이페이지의 일반 인증키(Decoding)를 저장소 Settings → Secrets and variables → Actions에 이름 `HOLIDAY_KEY`로 저장\n'
             '3. Actions → 법령 기준값 자동 점검 → Run workflow')
    for title, body in notes:
        once('note:' + hashlib.sha1((title + body).encode()).hexdigest()[:12], title, body)

    for q, must, verbs, need in HEADS_UP:
        hits = [i for i in news(q) if any(m in i['title'] for m in must) and any(v in i['title'] for v in verbs)
                and (not need or re.search(need, i['title'])) and not any(f in i['title'] for f in FOREIGN)
                and (TODAY - dt.date.fromisoformat(i['date'])).days <= 21]
        new = [i for i in hits if 'n:' + hashlib.sha1(i['link'].encode()).hexdigest()[:12] not in seen]
        if new:
            for i in new: seen.add('n:' + hashlib.sha1(i['link'].encode()).hexdigest()[:12])
            once(f'news:{q}:{TODAY.isoformat()}', f'[보도 알림 · 미반영] {q} 관련 기사 {len(new)}건',
                 '언론 보도라서 **반영하지 않았습니다.** 법령·고시 원문이 공포되면 공식 점검에서 자동 반영됩니다.\n\n' +
                 '\n'.join(f'- [{i["source"]}] [{i["title"]}]({i["link"]}) ({i["date"]})' for i in new[:8]))

    R['checkedAt'] = TODAY.isoformat()
    json.dump(R, open(RULES_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(RULES_P, 'a').write('\n')
    S.update({'seen': sorted(seen)[-800:], 'lastRun': TODAY.isoformat(), 'status': status})
    json.dump(S, open(STATE_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(STATE_P, 'a').write('\n')
    log(f'완료: 공식 조회 성공 {status.get("officialOk")}건, 알림 후보 {len(notes)}건, 오류: {status.get("officialError")}')

if __name__ == '__main__':
    main()
