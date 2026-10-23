# 모의고사 성적 분석 시스템 (score-reporter)

> 모의고사 성적 파일을 불러와 과목별·학급별 통계, 상위권 분포, 수능 최저학력기준 충족 인원 등을 시각화하고 리포트로 내보내는 웹 앱입니다.

성적 데이터는 브라우저 밖으로 나가지 않습니다. 파일 파싱부터 리포트 생성까지 전부 클라이언트에서 처리하며, 서버로 아무것도 전송하지 않습니다.

이 저장소는 [teacher-utility-kit](https://github.com/itmir913/teacher-utility-kit)의 `score-reporter` 폴더를 커밋 이력째 분리한 것입니다. 초기 이름이던 `grade_manager` 시절(2026-03-25 초안)부터의 이력을 담고 있습니다.

---

## 시작하기

```bash
npm ci
npm run dev
```

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | `dist/` 에 배포용 정적 파일 생성 |
| `npm run preview` | 빌드 결과를 로컬에서 확인 |
| `npm test` | Vitest 실행 |
| `npm run test:watch` | 파일 변경을 감시하며 테스트 |
| `npm run lint` | ESLint 실행 |

## 쓰는 법

1. **파일 추가**: 회차마다 받은 엑셀을 여러 개, 또는 zip 하나로 끌어다 놓습니다. 표에 파일이 한 줄씩 올라옵니다.
   - 양식은 머리글이 등록된 양식과 정확히 하나만 맞을 때 자동으로 고릅니다. 아니면 직접 고르고, 「보기」로 앞 5줄을 확인합니다.
   - 회차 이름은 파일 이름에서 제안합니다(`2026-03`, `3`, `사설` 무엇이든 됩니다). 같은 이름은 두 번 쓸 수 없습니다.
   - 암호 걸린 파일은 그 줄에 비밀번호를 넣습니다. 여러 파일이 같은 암호면 한 번에 넣을 수 있습니다.
   - 「N개 회차 불러오기」 한 번으로 모두 회차가 됩니다.
2. **상단바의 회차 칩**: 칩을 눌러 회차를 고르고, ◀ ▶ 로 순서를 바꿉니다. 이 순서가 통계 화면의 가로축입니다.
3. **보고서**: 고른 회차의 통계·상위 N·급간 분포·수능최저·학생 명단(정렬·열 검색).
4. **통계**: 회차별 전교 평균과, 한 학생의 회차별 점수·합산 석차.
5. **내보내기**: 고른 회차를 다른 프로그램 양식의 엑셀로 내보냅니다.
6. **프로젝트 파일**: 모든 회차를 `.score.json` 하나로 저장하고 다음에 엽니다. 브라우저에는 아무것도 남지 않습니다.
   이 파일에는 학생 이름과 성적이 들어 있으니 공용 PC·메신저에 두지 마세요.

### 점수 해석 규칙

정본은 [CLAUDE.md](CLAUDE.md)의 「점수 해석 원칙」입니다. 요약하면:

- 빈칸은 0점이 아닙니다. 학생의 모든 점수가 0이면 미응시로 봅니다.
- **합산 = 국어 + 수학 + 탐구평균.** 탐구를 한 과목만 본 학생은 그 과목 값이 들어갑니다. 탐구를 보지 않은 학생은 기본으로 빼고(인원을 밝힘), 「탐구 미응시 학생도 포함」을 켜면 국어+수학으로 넣습니다.
- 동점은 공동순위 1, 1, 3.
- 고른 기준(원점수·표준점수·백분위)의 값이 없는 회차는 다른 기준으로 바꾸지 않고 「이 회차에는 …가 없어 표시할 수 없습니다」를 띄우고 —로 가립니다.

## 구조

```
index.html          단일 페이지 앱의 마크업. Vite의 진입 HTML이다.
src/
  main.js           진입점. 스타일과 앱 모듈을 불러오고 data-action 을 잇는다.
  js/               앱 로직 (아래 표 참고)
  styles/
    main.css        스타일시트 로드 순서를 정하는 파일
    style.css       앱 고유 스타일(리포트·인쇄)
    tailwind.css    Tailwind v4 와 디자인 토큰(admission-outcomes 와 같은 토큰·부품)
tests/              Vitest 테스트 (baseline.test.js 는 5종 양식의 읽기·리포트·내보내기 기준선 스냅숏)
docs/migration-plan.md  다회차 마이그레이션 계획과 소유자 결정
vendor/             npm 레지스트리에서 받을 수 없는 의존성 (아래 참고)
```

| 파일 | 역할 |
| --- | --- |
| `src/js/main.js` | 앱 상태(`ST`: 회차 목록, 지금 회차), 불러오기 표 상태, 탭 전환, 내보내기 |
| `src/js/schema.js` | 양식 정의의 유일한 정본(열 매핑·머리글 줄 수·내보내기 머리글 = 양식 지문의 원천) |
| `src/js/ingest/files.js` | 업로드 전개(zip), 암호 해제, ExcelJS/SheetJS 읽기 |
| `src/js/ingest/formatMatch.js` | 머리글 지문으로 양식 자동 매칭, 값 범위 교차검증 |
| `src/js/parser.js` | 성적 파일 → 학생 레코드 |
| `src/js/core/` | 숫자 판정(`score.js`), 합산·탐구평균(`aggregate.js`) |
| `src/js/exams/` | 회차 목록·순서(`examStore.js`), 회차 사이 동일인 연결(`identity.js`), 프로젝트 파일(`projectFile.js`) |
| `src/js/trend/trend.js` | 회차별 전교·학생별 통계 계산 |
| `src/js/ui/` | 불러오기 표(`importer.js`), 회차 레일·프로젝트 저장/열기(`examRail.js`), 학생 표(`studentTable.js`, `table.js` = admission-outcomes GridTable 이식), 통계 화면(`trendView.js`), DOM 잔손질(`dom.js`) |
| `src/js/actions.js` | 마크업의 `data-action`·`data-change` → 실제 함수 |
| `src/js/xlsx-decrypt.js`, `src/js/sha.js` | 암호 걸린 xlsx 해제와 그에 쓰는 동기 해시 |
| `src/js/exporter.js` | 다른 양식으로 내보내기 |
| `src/js/report.js`, `src/js/report/` | 리포트 렌더링(통계·상위권·분포·선택과목·수능최저·모달) |
| `src/js/utils.js` | 공용 헬퍼 |

## 의존성

외부 라이브러리는 모두 npm으로 관리하며 빌드 시 번들에 포함됩니다. CDN을 실행 시점에 부르지 않습니다.

Chart.js, ExcelJS, SheetJS(xlsx), fflate(zip), Tailwind CSS v4, Font Awesome, Pretendard.

### 사용 설명서

설명서(PDF, HWPX)는 저장소에 두지 않고 `latest` 릴리스의 자산으로 올립니다. 바이너리라서 개정할 때마다 델타 압축이 듣지 않고 이력에 1MB씩 그대로 쌓이기 때문입니다.

| 자산 | 용도 |
| --- | --- |
| `score-reporter-manual.pdf` | 배포용. 앱의 '매뉴얼 PDF 다운로드' 버튼이 이 URL을 가리킨다. |
| `score-reporter-manual.hwpx` | 편집 원본. 고칠 때 여기서 받아 고치고 두 파일을 다시 올린다. |

개정 절차는 이렇습니다.

```bash
gh release download latest -p 'score-reporter-manual.hwpx'
# 고친 뒤 PDF로 내보내고
gh release upload latest score-reporter-manual.pdf score-reporter-manual.hwpx --clobber
```

배포 워크플로는 `score-reporter.zip` 만 올리므로 이 두 자산을 건드리지 않습니다.

### xlsx 가 `vendor/` 에 있는 이유

SheetJS는 0.18.5 이후 npm 레지스트리에 게시하지 않습니다. 0.19.3에서 프로토타입 오염이, 0.20.2에서 ReDoS가 고쳐졌으므로 레지스트리에 남은 0.18.5로 내려가면 알려진 취약점을 그대로 안게 됩니다.

그래서 SheetJS 공식 배포본 `xlsx-0.20.3.tgz`를 `vendor/` 에 넣고 `file:` 의존성으로 참조합니다. 이렇게 하면 `npm ci` 가 네트워크 없이도 같은 결과를 냅니다. **`vendor/` 를 지우면 설치가 실패합니다.**

버전을 올리려면 [cdn.sheetjs.com](https://cdn.sheetjs.com/)에서 새 tarball을 받아 `vendor/`에 넣고 `package.json`의 경로를 바꾼 뒤 `npm install` 하면 됩니다.

## 배포

`.github/workflows/deploy-pages.yml` 이 담당합니다. **push로는 아무 일도 일어나지 않고**, Actions 탭에서 직접 실행(workflow_dispatch)할 때에만 다음이 순서대로 이루어집니다.

1. `npm ci` → `npm run lint` → `npm test` → `npm run build`
2. `dist/` 를 GitHub Pages에 배포
3. 배포가 성공하면 `dist/` 를 묶은 `score-reporter.zip` 을 `latest` 릴리스에 올림

저장소 설정이 **Settings → Pages → Source: GitHub Actions** 여야 합니다.

`.github/workflows/ci.yml` 은 push와 PR마다 lint·test·build만 실행하고 배포는 하지 않습니다.

### 오프라인 번들

릴리스의 `score-reporter.zip` 은 압축을 해제하고 `index.html` 을 그대로 열면 동작합니다. 이를 위해 빌드가 두 가지를 지킵니다.

- 모든 경로가 상대 경로 (`base: './'`)
- 번들을 iife로 내보내고 `type="module"` 과 `crossorigin` 을 걷어냄

번들에 설명서는 들어 있지 않습니다. 앱의 설명서 버튼은 릴리스 자산을 가리키는 외부 링크이므로 오프라인에서는 열리지 않습니다.

`file://` 은 출처가 `null` 이라 모듈 스크립트와 `crossorigin` 리소스가 CORS로 막힙니다. 이 두 가지가 지켜지지 않으면 압축을 해제해 열었을 때 빈 화면이 뜹니다. 자세한 내용은 `vite.config.js` 의 주석에 적어 두었습니다.

---

## 라이선스

[PolyForm Noncommercial License 1.0.0](LICENSE.md)

- **허용**: 개인적인 용도, 학교 등 교육기관에서의 비영리적 목적의 사용 및 배포
- **금지**: 본 프로그램이나 소스코드를 활용한 모든 종류의 상업적 영리 활동

번들에 포함되는 외부 라이브러리는 각자의 라이선스를 따릅니다.

© 2026 [luminousky.com](https://luminousky.com). All rights reserved.
