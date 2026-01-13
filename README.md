## ICU 위험도 대시보드

실시간 환자 데이터(또는 데모 데이터)를 기반으로 사망 위험도 추이를 시각화하고,
환자별 알림 규칙/즐겨찾기/알림 로그를 관리할 수 있는 임상 의사결정 지원용 대시보드입니다.

### 주요 기능
- 실시간 위험도 모니터링 및 위험도 추이(스파크라인) 표시
- 환자별 알림 규칙 설정 및 경보 상태 표시
- 즐겨찾기 고정 및 정렬 유지
- 알림 로그(발생 이력) 조회
- 환자 상세 화면에서 활력징후/검사수치 상세 확인

### 구현 개요 (구성 및 흐름)
- Frontend(React/Vite)가 `/api`를 통해 FastAPI 서버에 데이터 요청
- FastAPI가 더미 데이터 또는 모델 기반 추론 결과로 환자 목록 생성
- Postgres에 환자별 알림 규칙/즐겨찾기/알림 로그 저장
- 모델 추론은 PyTorch 기반, 서버 시작 시 모델과 스케일러 로드

### 기술 스택
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: FastAPI (Python)
- DB: Postgres (Docker)
- Model: PyTorch + joblib (서버 내 추론)

### 폴더 구조
- Frontend: `src/`
- Backend: `server_fastapi/`
- DB 초기화 SQL: `server_fastapi/sql/init.sql`
- Docker 설정: `docker-compose.yml`
- 환경변수: `.env`

---

## 실행 방법 (로컬)

### 1) Postgres 실행 (Docker)
```bash
docker compose up -d db
```

DB 연결 확인:
```bash
docker compose exec db psql -U icu -d icu_risk -c "SELECT current_user;"
```

### 2) FastAPI 서버 실행
가상환경 생성 및 의존성 설치:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r server_fastapi/requirements.txt
```

서버 실행:
```bash
uvicorn server_fastapi.app:app --reload --env-file .env
```

### 3) 프론트엔드 실행 (Vite)
```bash
npm install
npm run dev
```

브라우저 접속:
- `http://localhost:5173`

---

## API 빠른 확인
```bash
curl http://localhost:8000/api/status
curl http://localhost:8000/api/patients
```

---

## DB 스키마 확인
```bash
docker compose exec db psql -U icu -d icu_risk
```

psql 내부에서:
```sql
\dt
\d patient_alert_rules
\d favorites
\d alert_logs
```

---

## 환경변수
`.env` 예시:
```
DATABASE_URL=postgresql://icu:icu@127.0.0.1:5433/icu_risk
```

---

## GitHub Pages 배포 참고
GitHub Pages는 정적 사이트만 지원하므로 **백엔드(API)가 동작하지 않습니다.**
따라서 배포 환경에서는 `/api` 호출이 실패할 수 있고, 이 경우 데모 데이터로 보여야 합니다.

배포 명령:
```bash
npm run build
cp dist/index.html dist/404.html
npx gh-pages -d dist
```

---

## 참고 사항
- Vite dev server는 `/api`를 `http://127.0.0.1:8000`으로 프록시합니다. (`vite.config.ts`)
- 로컬 Postgres가 이미 5432 포트를 사용 중이면 Docker 포트를 `5433:5432`로 매핑해야 합니다.
