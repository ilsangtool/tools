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
        if '검증에 실패' in txt or ('차단' in txt[:300]):
            self.error = '인증 실패(OC 값, 승인 여부, 등록 IP 확인 필요): ' + re.sub(r'\s+', ' ', txt[:200]); return None
        try: return json.loads(txt)
        except Exception:
            self.error = '응답 해석 실패: ' + re.sub(r'\s+', ' ', txt[:200]); return None

    def law_versions(self, name):
        """같은 이름 법령의 현행·시행예정 버전들: [{mst, eff, prom, name}]"""
        j = self.call('lawSearch.do', target='law', query=name, display=100)
        if not j: return None
        rows = j.get('LawSearch', {}).get('law', [])
        rows = rows if isinstance(rows, list) else [rows]
        out = []
        for r in rows:
            if str(r.get('법령명한글', '')).replace(' ', '') != name.replace(' ', ''): continue
            out.append({'mst': str(r.get('법령일련번호')), 'eff': ymd8(r.get('시행일자')), 'prom': ymd8(r.get('공포일자')),
                        'status': r.get('현행연혁코드', ''), 'name': r.get('법령명한글')})
        return out

    def law_text(self, mst):
        j = self.call('lawService.do', target='law', MST=mst)
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
            t = api.law_text(v['mst'])
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

HEADS_UP = [
    ('최저임금 결정', ['최저임금'], ['결정', '확정', '의결']),
    ('건강보험료율 결정', ['건강보험료율'], ['결정', '인상', '동결', '의결']),
    ('장기요양보험료율 결정', ['장기요양보험료율'], ['결정', '인상', '동결', '의결']),
    ('고용보험료율 인상', ['고용보험료율', '실업급여 보험료율'], ['인상', '결정', '조정']),
    ('노쇼 위약금 소비자분쟁해결기준', ['노쇼', '예약부도'], ['개정', '상향', '변경']),
    ('전자상거래법 청약철회 개정', ['청약철회'], ['개정', '변경']),
    ('병 복무기간 단축', ['복무기간', '복무 기간'], ['단축', '개정', '변경']),
    ('주휴수당 근로기준법 개정', ['주휴수당'], ['개정', '폐지', '국회 통과']),
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

    oc = os.environ.get('LAW_OC', '').strip()
    notes = []
    if oc:
        api = LawAPI(oc)
        n = official_check(api, R, S, notes)
        status = {'officialOk': n, 'officialError': api.error}
        if n == 0:
            wk = TODAY.isocalendar()
            once(f'offfail:{wk[0]}-{wk[1]}', '[점검 실패] 국가법령정보센터에 접속하지 못했습니다',
                 f'오류: {api.error}\n\n값은 바꾸지 않았습니다. OC 승인 상태와 등록 IP를 확인해 주세요. 다음 점검 때 다시 시도합니다.')
        else:
            R['officialCheckedAt'] = TODAY.isoformat()
    else:
        status = {'officialOk': 0, 'officialError': 'LAW_OC 없음'}
        once('setup:law_oc', '[설정 필요] 공식 법령 자동 반영을 켜려면 LAW_OC가 필요합니다',
             '지금은 공식 원문을 읽지 못해 **어떤 값도 자동으로 바꾸지 않고** 보도 알림만 보냅니다.\n\n'
             '1. https://open.law.go.kr 가입 → OPEN API 신청 (법령·행정규칙 체크)\n'
             '2. 승인 후 가입 이메일의 @ 앞부분(OC)을 저장소 Settings → Secrets and variables → Actions → New repository secret 에 이름 `LAW_OC`로 저장\n'
             '3. Actions → 법령 기준값 자동 점검 → Run workflow')
    for title, body in notes:
        once('note:' + hashlib.sha1((title + body).encode()).hexdigest()[:12], title, body)

    for q, must, verbs in HEADS_UP:
        hits = [i for i in news(q) if any(m in i['title'] for m in must) and any(v in i['title'] for v in verbs)
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
