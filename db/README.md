# PostgreSQL · PostGIS

`migrations/`는 순서대로 적용하는 SQL, `tests/`는 별도 테스트 DB에서 롤백하며 수행하는 정책 제약 검증입니다.

- `npm run db:migrate`: 명시한 `DATABASE_URL`에만 적용. PostGIS extension 설치 권한 필요.
- `npm run db:test`: 별도 `DB_TEST_URL` (`*_test`)에 적용 후 테스트. 운영 DB에는 실행하지 않음.
- 이미 적용한 파일은 수정하지 않고 새 번호의 마이그레이션을 추가.

자세한 관계·권한 경계: [DB 스키마](../docs/database-schema.md). 실행 예시: [개발 환경](../docs/development.md).
