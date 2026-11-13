# 생활·업무 무료 도구 모음

설치 없이 브라우저에서 바로 쓰는 무료 웹 도구 모음입니다. 입력 내용과 사진은 서버로 전송되지 않습니다.

- 사이트: https://ilsangtool.github.io/tools/

| 도구 | 설명 | 바로가기 |
|---|---|---|
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
robots.txt, sitemap.xml   검색엔진 등록용
```

새 도구는 폴더를 하나 추가하고 `index.html` 목록, `sitemap.xml`, 이 README 표에 함께 등록합니다.

## 해마다 고칠 값
| 도구 | 항목 | 현재 값 |
|---|---|---|
| weekly-pay | 최저시급 `MIN` | 2026년 10,320원 / 2027년 10,700원 |
| weekly-pay | 4대보험 근로자 부담률 `RATE` | 국민연금 2026 4.75%·2027 5.0%, 건강보험 3.595%, 장기요양 건보료의 13.14%, 고용 0.9% |
| date-calc | 복무기간 | 육군·해병 18, 해군 20, 공군 21, 사회복무 21개월 |
| noshow-policy | 노쇼 위약금 상한 | 일반음식점 20%, 예약기반·단체 40% (2025.12.18 개정) |
