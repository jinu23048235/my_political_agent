# 앱 개발 환경과 현재 구현 범위

## 실행

Node.js 22 이상을 사용하며 정확한 의존성 버전은 `package-lock.json`에 고정합니다.

```bash
npm ci
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. `npm run dev`는 `.env.local`을 먼저 읽습니다. DB 설정이 없으면 가상 예시 데이터를 사용하며 실제 계정·인증으로 간주하지 않습니다. 예시 지역 코드도 실제 행정·선거구 매칭용이 아닙니다.

DB를 연결하려면 별도로 준비한 PostgreSQL 17·PostGIS 3.5에 적용합니다.

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
```

`.env.local`에 `APP_DATA_MODE=database`, `DATABASE_URL`, `APP_ORIGIN=http://localhost:3000`을 설정합니다. DB 모드에서는 실제 DB를 조회하고 테스트 계정이나 지역을 자동 생성하지 않습니다. 비밀번호·키는 저장소에 넣지 않습니다. 마이그레이션 CLI에는 셸 환경 변수로 URL을 제공합니다.

운영에서는 HTTPS `APP_ORIGIN`이 필요합니다. DB URL이 없으면 기본 빈 피드이며 `APP_DATA_MODE=sample`은 운영에서 거부합니다. `APP_DATA_MODE=empty npm run dev`로 빈 상태도 검토합니다. 운영 DB·호스팅·제공자 설정은 아직 생성하지 않았습니다.

## 검증

```bash
npm test
DB_TEST_URL='postgresql://.../neighborhood_test' npm run db:test
npm run build
DB_TEST_URL='postgresql://.../neighborhood_test' npm run test:integration
npm run typecheck
npm start
```

테스트 URL은 별도 `*_test` DB이며 운영 `DATABASE_URL`과 같으면 거부합니다. `db:test`는 마이그레이션을 유지하고 정책 fixture를 롤백합니다. 통합 검증은 별도 무작위 스키마를 만들고 실제 프로덕션 서버를 루프백 포트 3117에서 실행하며 종료 시 스키마와 서버를 정리합니다. `TEST_PORT`로 포트를 변경할 수 있습니다. 테스트가 PostGIS를 설치하고 스키마를 만들 수 있는 임시 DB 계정을 사용합니다. `db:test`와 통합 검증은 해당 테스트 DB의 PUBLIC 접근 권한을 회수하므로 운영 DB에 실행하면 안 됩니다.

통합 검증은 세션 위조·다른 출처 요청·작성자 권한·지역 만료·대표자별 상태·고정댓글·설문 비공개 및 마감·설정·역할 변경에 따른 세션 회수를 확인합니다. GitHub Actions도 DB 검사·빌드 후 통합 검증을 실행합니다.

로컬에 Python Playwright와 `/usr/bin/chromium`이 준비되어 있으면 `BROWSER_CHECK=1`을 추가하여 실제 작성·답글·고정·설문·설정 및 320~1440px 배치를 검증할 수 있습니다. 브라우저 검증은 CI의 기본 실행에는 포함하지 않습니다.

마이그레이션은 트랜잭션·advisory lock·체크섬으로 관리합니다. 이미 적용한 파일은 수정하지 않고 새 번호로 추가합니다.

## 앱과 다음 작업

Next.js App Router·React·TypeScript 앱에 DB 읽기·쓰기와 서버 세션/권한 검사, 작성·답글·고정·설문·개인설정 화면을 연결했습니다. 상세는 [서버 API](server-api.md)와 [DB 스키마](database-schema.md)를 확인합니다. 실제 소셜 로그인 제공자는 미연결이므로 일반 사용자가 아직 로그인할 수는 없습니다. `/api/health`는 앱 실행 상태만 확인합니다.

다음 작업은 카카오·네이버·구글의 제공자 등록·콜백과 가입 연결, 실제 행정 경계·대표자 자료 선정과 GPS 인증입니다. 이후 파일 저장·운영자 심사·신고·알림을 연결합니다. HTML 초안 `prototype/`은 별도 화면 검토용으로 보존합니다.
