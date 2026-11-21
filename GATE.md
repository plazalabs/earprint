# EARPRINT 콘텐츠 연결 가능성 검증 문서 (GATE)

- **최종 확인일**: 2026-11-21 (UTC)
- **검증 목적**: EARPRINT가 별도의 화자 녹음 없이 기존 공개 영상 위에 청취 적합도 탐색·매칭 엔진을 얹을 수 있는지, YouGlish API/위젯 및 YouTube Data API v3 / YouTube 공식 임베드(`<iframe>`) 정책을 공식 출처 기준으로 검증한다.
- **검증 원칙**: 공식 출처 페이지에서 직접 확인된 내용만 사실로 기록하고, 공식 출처 원문을 직접 확인할 수 없었던 항목은 모두 **미확인**으로 표기한다. 제3자 블로그·비교 사이트 요약은 공식 근거로 채택하지 않는다.

---

## 1. 출발 가설 검증 요약

| # | 출발 가설 | 판정 | 요약 |
|---|---|---|---|
| ① | YouGlish의 Commercial Use는 구매한 플랜에 명시된 경우에만 허용되고, 위젯의 상업적 사용과 모바일 앱 사용은 별도 허가가 필요하다. | **미확인** | 본 검증 환경에서 `youglish.com` 공식 도메인 원문(`/terms`, `/api`, `/api/doc/widget` 등)에 직접 접근하거나 검색 인덱스에서 공식 원문 발췌를 확보할 수 없었다. 공식 원문 확인 전까지 사실로 단정하지 않는다. |
| ② | YouTube는 공식 임베드 재생이 허용된 기본 경로이며 Data API에는 쿼터가 있다. | **확인 (조건부 허용)** | 공식 문서에서 `<iframe>` 임베드 및 IFrame Player API가 공식 재생 경로임을 확인했다. 단, YouTube API Services Terms of Service·Developer Policies·Required Minimum Functionality(최소 뷰포트, HTTP `Referer`, 과금/게이팅 금지, 독립적 가치 요건 등)가 적용된다. YouTube Data API v3는 기본 일일 쿼터(`search.list` 100회, `videos.insert` 100회, 기타 엔드포인트 합산 10,000 units/일)가 있으며 증설 시 Compliance Audit가 필요하다. |

---

## 2. YouGlish API 및 위젯 상업적 사용 가능 범위

### 2.1 공식 출처 확인 결과

- **확인 상태**: **미확인** (확인 시도일: `2026-11-21`)
- **사유**:
  - 본 환경에서 웹 검색(`site:youglish.com`) 결과가 반환되지 않았고, 외부 URL 직접 열람(`browse`)도 제한되어 있어 YouGlish 공식 약관 및 API 문서 원문을 직접 검증하지 못했다.
  - 제3자 사이트(비교 글·플러그인 문서 등)에서 위젯의 비상업적 교육 용도 무료 여부나 유료 REST API 플랜에 대한 언급이 관찰되었으나, 이는 공식 출처가 아니므로 검증 근거에서 제외한다.

### 2.2 항목별 판정 및 추후 직접 확인 대상 URL

| 검증 항목 | 판정 | 직접 확인이 필요한 공식 URL |
|---|---|---|
| Commercial Use의 구매 플랜 명시 요건 | **미확인** | `https://youglish.com/terms`, `https://youglish.com/api` |
| 위젯(Widget)의 상업적 사용 별도 허가 요건 | **미확인** | `https://youglish.com/api/doc/widget`, `https://youglish.com/terms` |
| 모바일 앱 내 위젯/API 사용 별도 허가 요건 | **미확인** | `https://youglish.com/api/doc/widget`, `https://youglish.com/api/doc/js-api`, `https://youglish.com/terms` |
| REST API 요금제·일일 호출 제한·출처 표기(attribution) 조건 | **미확인** | `https://youglish.com/api` |

### 2.3 게이트 판단 (YouGlish)

- 공식 약관 원문 확인 및 상업적 라이선스 확보 전까지 **EARPRINT MVP 및 상용 경로에서 YouGlish API/위젯은 채택하지 않는다(보류)**.

---

## 3. YouTube 공식 임베드(`<iframe>`) 정책

- **확인일**: `2026-11-21`
- **공식 인용 URL**:
  1. Embed videos & playlists (YouTube Help): `https://support.google.com/youtube/answer/171780?hl=en`
  2. YouTube Embedded Players and Player Parameters: `https://developers.google.com/youtube/player_parameters`
  3. YouTube Player API Reference for iframe Embeds: `https://developers.google.com/youtube/iframe_api_reference`
  4. YouTube API Services - Required Minimum Functionality: `https://developers.google.com/youtube/terms/required-minimum-functionality`
  5. YouTube API Services - Developer Policies: `https://developers.google.com/youtube/terms/developer-policies`
  6. Complying with YouTube's Developer Policies: `https://developers.google.com/youtube/terms/developer-policies-guide`
  7. Commercial uses of the YouTube website (YouTube Help): `https://support.google.com/youtube/answer/71011?hl=en`
  8. Restrict embedding (YouTube Help): `https://support.google.com/youtube/answer/6301625?hl=en`
  9. Ads on embedded videos (YouTube Help): `https://support.google.com/youtube/answer/132596?hl=en`

### 3.1 확인된 공식 정책 내용

1. **기본 임베드 경로 및 약관 적용 범위**
   - 웹사이트는 표준 `<iframe>` 태그(`https://www.youtube.com/embed/VIDEO_ID`) 또는 YouTube IFrame Player API를 사용해 영상을 임베드할 수 있으며, `start` 파라미터로 시작 초를 지정할 수 있다(`player_parameters`, `iframe_api_reference`).
   - IFrame Player API를 이용한 임베드 재생은 사용자 로그인 인증을 요구하지 않는다(`developer-policies`).
   - 모든 YouTube 임베드 플레이어 접근·사용에는 **YouTube API Terms of Service 및 Developer Policies**가 적용된다(`answer/171780`).
   - 개인정보 강화 모드(`https://www.youtube-nocookie.com`)는 웹사이트 임베드에서 제공되며, 이 경우에도 동일한 YouTube API 약관·개발자 정책이 적용된다(`answer/171780`).

2. **기술적 필수 요구사항 (Required Minimum Functionality)**
   - **HTTP `Referer` 식별 필수**: 임베드 플레이어를 사용하는 클라이언트는 HTTP `Referer` 요청 헤더로 출처를 식별해야 하며, `Referer`가 누락되면 재생이 차단되고 오류 화면(`error 153`)이 표시된다. 공식 문서는 `Referrer-Policy`로 `strict-origin-when-cross-origin` 사용을 권장한다(`required-minimum-functionality`, `answer/171780`).
   - **최소 플레이어 크기**: 임베드 플레이어 뷰포트는 최소 `200px × 200px` 이상이어야 하며, 16:9 플레이어는 `480px × 270px` 이상이 권장된다(`required-minimum-functionality`, `player_parameters`).
   - **자동재생 및 스크립트 재생 제한**: 자동재생은 플레이어 면적의 50% 초과가 화면에 노출된 이후에만 시작해야 하며, 한 페이지·화면에 동시에 둘 이상의 YouTube 플레이어가 자동재생되어서는 안 된다(`required-minimum-functionality`).

3. **상업적 사용, 과금, 독립적 가치 및 금지 행위**
   - 개발자는 금지 행위를 위반하지 않는 범위에서 API 클라이언트를 배포하거나 판매할 수 있다(`developer-policies`, Section III.G Distribution and Commercial Use).
   - **시청 과금 및 게이팅 금지**: 임베드 플레이어로 영상을 시청하는 행위 자체에 요금을 부과할 수 없으며, 재생 버튼 클릭 외의 추가 행위(설문 완료, 구독, 공유 등)를 영상 시청의 선행 조건으로 강제할 수 없다(`developer-policies`, `developer-policies-guide`).
   - **독립적 가치 요건**: YouTube API/임베드 위에 광고·스폰서십·프로모션을 판매하려면, YouTube 데이터를 제거하더라도 자체 콘텐츠·기능만으로 충분한 독립적 가치가 성립해야 한다. 단순히 임베드 영상을 모아 광고 수익을 노리는 사이트는 약관 위반 대상이다(`developer-policies` III.G, `developer-policies-guide`, `answer/71011`).
   - **임베드 광고 수익 배분**: 임베드 영상에서 재생되는 YouTube 광고 수익은 YouTube와 영상 권리자에게만 배분되며, 임베드한 웹사이트 운영자에게는 배분되지 않는다(`answer/132596`).
   - **다운로드·저장·스크래핑 금지**: YouTube의 사전 서면 승인 없이 시청각 콘텐츠를 다운로드·복제·백업·캐싱·오프라인 재생 제공하거나 YouTube 페이지를 스크래핑하는 행위는 금지된다(`developer-policies`).
   - **귀속(Attribution) 및 고지 의무**: YouTube가 제공하는 브랜드 표기 및 플레이어 귀속 표시를 가려서는 안 되며, 서비스 이용약관/개인정보처리방침을 통해 YouTube API Services 사용 사실 및 데이터 처리 내용을 고지해야 한다(`developer-policies` III.A, III.F).

4. **콘텐츠 가용성(임베드 차단) 리스크**
   - 영상 업로더는 YouTube Studio에서 개별 영상의 `Allow embedding` 옵션을 해제할 수 있으며, Content Manager 파트너는 도메인·앱 단위로 임베드를 차단할 수 있다(`answer/171780`, `answer/6301625`).

### 3.2 미확인 항목 (YouTube 임베드)

- **개별 영상의 실시간 임베드 가능 여부**: 본 환경에서 YouTube 플레이어 실재생 및 Data API `status.embeddable` 조회를 수행하지 못했으므로, MVP 데이터에 수록된 12개 영상의 현재 시점 `Allow embedding` 허용 여부는 **미확인**이다.
- **파생 지표 정책(Developer Policies III.L)의 EARPRINT 적용 범위**: 공식 변경 이력(`https://developers.google.com/youtube/terms/revision-history`)에 2026-05-04 추가 / 2026-06-01 개정된 "Additional policies on derived metrics and data storage"가 존재한다. 사용자가 직접 입력하는 주관적 청취 적합도 평가(YouTube API 통계가 아닌 사용자 설문 입력)가 해당 조항의 심사 대상에 해당하는지 여부는 **미확인**이며, 상용화 전 API Compliance Audit 또는 법률 검토가 필요하다.

---

## 4. YouTube Data API v3 정책 및 쿼터

- **확인일**: `2026-11-21`
- **공식 인용 URL**:
  1. YouTube API Services Terms of Service: `https://developers.google.com/youtube/terms/api-services-terms-of-service`
  2. YouTube Data API - Quota Calculator: `https://developers.google.com/youtube/data/determine_quota_cost`
  3. YouTube Data API - Quota and Compliance Audits: `https://developers.google.com/youtube/data/guides/quota_and_compliance_audits`
  4. YouTube API Services Terms of Service - Revision History: `https://developers.google.com/youtube/terms/revision-history`
  5. Complying with YouTube's Developer Policies: `https://developers.google.com/youtube/terms/developer-policies-guide`
  6. YouTube API Services - Developer Policies: `https://developers.google.com/youtube/terms/developer-policies`

### 4.1 확인된 공식 정책 내용

1. **쿼터 부과 근거**: YouTube API Services Terms of Service Section 15 (Usage and Quotas)에 따라 YouTube는 언제든 쿼터를 설정할 수 있으며, 개발자는 쿼터 제한을 초과하거나 우회해서는 안 된다(`api-services-terms-of-service`).
2. **기본 일일 할당량 (2026-11 공식 문서 기준)**:
   - YouTube Data API를 활성화한 프로젝트의 기본 일일 할당량은 다음으로 구성된다(`determine_quota_cost`, `quota_and_compliance_audits`):
     - `search.list`: 일 **100회** (독립 쿼터 버킷, 호출당 1)
     - `videos.insert`: 일 **100회** (독립 쿼터 버킷, 호출당 1)
     - 기타 모든 엔드포인트 합산: 일 **10,000 units**
   - 모든 API 요청(잘못된 요청 포함)은 최소 1포인트 이상의 비용이 발생하며, 일일 쿼터는 **태평양 표준시(PT) 자정**에 초기화된다(`determine_quota_cost`).
   - 페이지네이션으로 추가 페이지를 조회할 때마다 각 요청에 쿼터가 별도 부과된다(`determine_quota_cost`).
3. **쿼터 증설 및 정기 감사(Compliance Audit)**:
   - 기본 할당량을 초과해 쿼터를 증설하려면 **API Compliance Audit**를 통과해야 하며(`quota_and_compliance_audits`, `revision-history`), YouTube는 품질 관리 및 약관 준수 확인을 위해 정기 감사(Periodic Audit) 및 상시 모니터링 권한을 가진다(`api-services-terms-of-service` Section 6, `quota_and_compliance_audits`).
4. **프로젝트·자격증명 관리 제한**:
   - 단일 API 클라이언트/유스케이스에는 정확히 1개의 API 프로젝트를 생성해야 하며, 쿼터를 우회 확보하기 위해 여러 Google Cloud 프로젝트로 분산(sharding)하는 행위는 금지된다(`developer-policies`, `developer-policies-guide`).
   - API 자격증명(API Key 등)을 오픈소스 프로젝트에 포함하거나 제3자에게 공유하는 행위는 금지된다(`developer-policies`).
   - 90일 연속 비활성 상태인 API 프로젝트는 YouTube가 접근을 비활성화하거나 제한할 수 있다(`developer-policies`).

### 4.2 미확인 항목 (YouTube Data API v3)

- 개별 엔드포인트(`videos.list`, `channels.list` 등)의 전체 단위 비용 표 전문은 페이지 전문 열람 제한으로 인해 본 문서에서 일괄 검증하지 못했다(**미확인**, 확인 대상: `https://developers.google.com/youtube/data/determine_quota_cost`).

---

## 5. MVP 콘텐츠 연결 전략 결론

1. **현재 MVP (이번 세션 범위)**:
   - YouGlish API/위젯은 공식 약관 미확인 상태이므로 사용하지 않는다.
   - YouTube Data API v3 키를 클라이언트 정적 코드에 노출할 수 없고(오픈소스 자격증명 노출 금지), 정적 MVP 단계에서는 API 호출이 불필요하므로 **수동 선별한 공개 강연 메타데이터(`data/speakers.json`) + YouTube 공식 `<iframe>` 임베드**만으로 핵심 가설을 검증한다.
   - `<iframe>`에는 `referrerpolicy="strict-origin-when-cross-origin"`을 명시하고, 모바일 390px 기준 뷰포트가 최소 `200px × 200px` 조건을 충족하도록 배치하며, 자동재생을 쓰지 않고 사용자 클릭 재생(click-to-play) 방식을 사용한다.
   - 영상 시청 자체를 평가 입력으로 차단(게이팅)하지 않는다.
2. **가설 검증 이후 (상용화 전 필수 게이트)**:
   - YouGlish 도입을 재검토할 경우 공식 약관(`https://youglish.com/terms`) 및 위젯 문서 원문을 직접 확인하고 서면 허가/유료 플랜 범위를 확정한다.
   - YouTube Data API v3 연동 및 대규모 확장 시 백엔드 프록시 도입, 개인정보처리방침/YouTube 약관 고지 반영, API Compliance Audit 신청을 진행한다.
