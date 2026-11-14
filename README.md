# 생활·업무 무료 도구 모음

설치 없이 브라우저에서 바로 쓰는 무료 웹 도구 모음입니다. 입력 내용과 사진은 서버로 전송되지 않습니다.

- 사이트: https://ilsangtool.github.io/tools/

| 도구 | 설명 | 바로가기 |
|---|---|---|
| 숏폼 영상 만들기 | 내용 입력 → 빠진 항목 질문 → 구성안 3종 → 장면 다듬기 → 9:16·16:9·1:1 영상 저장. 사진 없으면 정보 그림으로 채움 | [열기](https://ilsangtool.github.io/tools/short-video/) |
| PDF → 한글·워드 변환 | 서버 업로드 없이 PDF를 HWPX·DOCX·TXT로. 표·합친 칸·글자 모양 유지, 스캔 PDF 한국어 글자 인식 | [열기](https://ilsangtool.github.io/tools/pdf-to-hwp/) |
| 리뷰 운영정책 고지문 생성기 | 2026년 개정 전자상거래법 리뷰 공개 의무 대응. 질문 6개에 답하면 고지문과 HTML 코드가 완성됩니다. | [열기](https://ilsangtool.github.io/tools/review-policy/) |
| 환불·교환 규정 고지문 생성기 | 온라인 7일 청약철회 기준 반영. 법에 어긋나는 "세일 상품 환불 불가" 문구는 자동으로 걸러냅니다. | [열기](https://ilsangtool.github.io/tools/refund-policy/) |
| 예약·노쇼 규정 문구 생성기 | 2025.12 개정 노쇼 위약금 기준(20%·40%) 반영. 예약 확정 문자와 매장 공지를 한 번에. | [열기](https://ilsangtool.github.io/tools/noshow-policy/) |
| 휴무·임시휴업 안내문 만들기 | 날짜만 고르면 A4 인쇄용 안내문, SNS 이미지, 네이버 플레이스 공지 문구가 완성됩니다. | [열기](https://ilsangtool.github.io/tools/closed-notice/) |
| 알바 주휴수당·월급 계산기 | 2026년 10,320원 · 2027년 10,700원 반영. 주휴수당, 월급, 3.3%·4대보험 실수령액까지. | [열기](https://ilsangtool.github.io/tools/weekly-pay/) |
| 더치페이·모임 정산 계산기 | 1차·2차 결제자가 달라도 누가 누구에게 얼마 보내면 되는지 송금 횟수를 최소로 정리합니다. | [열기](https://ilsangtool.github.io/tools/dutch-pay/) |
| D-day·전역일·만나이 계산기 | 디데이, 100일·1000일 기념일, 날짜 더하기, 군 전역일, 만 나이를 한 화면에서. | [열기](https://ilsangtool.github.io/tools/date-calc/) |
| 사진 용량 줄이기·HEIC 변환 | 서버 업로드 없이 여러 장을 목표 용량(KB) 이하로 줄이고, 아이폰 HEIC를 JPG로 바꿉니다. | [열기](https://ilsangtool.github.io/tools/image-resize/) |
| 증명사진 규격 자르기 | 여권·반명함·비자 규격으로 자르고 편의점에서 뽑는 4×6 인화용 판까지 만듭니다. | [열기](https://ilsangtool.github.io/tools/id-photo/) |

## 구조
```
/                       도구 목록 (index.html)
/review-policy/        리뷰 운영정책 고지문 생성기
/refund-policy/        환불·교환 규정 고지문 생성기
/noshow-policy/        예약·노쇼 규정 문구 생성기
/closed-notice/        휴무·임시휴업 안내문 만들기
/weekly-pay/           알바 주휴수당·월급 계산기
/dutch-pay/            더치페이·모임 정산 계산기
/date-calc/            D-day·전역일·만나이 계산기
/image-resize/         사진 용량 줄이기·HEIC 변환
/id-photo/             증명사진 규격 자르기
/short-video/          숏폼 영상 만들기
/pdf-to-hwp/           PDF → 한글·워드 변환
/vendor/               변환 라이브러리 자체 호스팅 (pdf.js, Tesseract) — vendor/README.md 참고
robots.txt, sitemap.xml   검색엔진 등록용
```

새 도구는 폴더를 하나 추가하고 `index.html` 목록, `sitemap.xml`, 이 README 표에 함께 등록합니다.

## 법령 기준값 자동 반영
법이 바뀌는 값은 도구 코드가 아니라 `data/rules.json` 한 곳에 있습니다. 도구는 열릴 때마다 이 파일을 읽어 **시행일(`from`)이 지난 값을 자동으로** 씁니다.

**원칙: 값은 법제처 국가법령정보센터의 법령·고시 원문에서만 바꿉니다. 언론 보도는 반영하지 않습니다.**

| 항목 | 공식 근거 (자동으로 읽는 원문) | 처리 |
|---|---|---|
| 최저시급 | 고용노동부 「최저임금 고시」 시간급·적용기간 | 자동 반영 |
| 건강보험료율 | 국민건강보험법 시행령 (직장가입자 보험료율) | 자동 반영 |
| 장기요양보험료율 | 노인장기요양보험법 시행령 | 자동 반영 |
| 고용보험료율 | 보험료징수법 시행령 (실업급여 보험료율) | 자동 반영 |
| 국민연금 보험료율 | 국민연금법 (2033년까지 단계 인상표 입력됨) | 개정 감지 → 확인 요청 |
| 주휴수당 조건 | 근로기준법·시행령 | 개정 감지 → 확인 요청 |
| 청약철회 기간 | 전자상거래법·시행령 | 개정 감지 → 확인 요청 |
| 노쇼 위약금 상한 | 소비자분쟁해결기준(공정위 고시) | 개정 감지 → 확인 요청 |
| 군 복무기간 | 병역법·시행령 | 개정 감지 → 확인 요청 |

이슈 말머리
- `[공식 반영]` 원문 값으로 바뀜 (이미 적용, 확인만) · `[공식 확인]` 기존 값이 원문과 일치
- `[확인 필요]` 개정 감지·조문 해석 실패 → 사람이 확인 · `[보도 알림 · 미반영]` 언론 예고만, 반영 안 함
- `[설정 필요]`/`[점검 실패]` 국가법령정보센터 연결 문제

설정
- 저장소 Settings → Secrets and variables → Actions에 `LAW_OC`(국가법령정보 공동활용 Open API 인증값: 가입 이메일 @ 앞부분) 저장. 없으면 값은 절대 바뀌지 않고 보도 알림만 옵니다.
- 점검: `.github/workflows/law-watch.yml`, 매주 월·목 오전 9시(한국시간). Actions → **Run workflow**로 즉시 실행 가능.
- 페이지 원본은 `_build/tools/<도구>/`. 원본을 고치고 `python _build/build.py` 실행. 결과 `index.html`을 직접 고치면 다음 점검 때 덮어써집니다.
