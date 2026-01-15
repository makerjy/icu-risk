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

### 전체 파이프라인 (FE/BE 연결 흐름)
1) 사용자 브라우저에서 Frontend가 로드됨 (Vite dev 서버 또는 정적 빌드)
2) Frontend는 `/api/*`로 FastAPI에 요청
3) FastAPI는
   - 메모리 기반 환자 시뮬레이션 데이터를 주기적으로 업데이트
   - DB(Postgres)에 저장된 규칙/즐겨찾기/로그를 읽고 씀
   - 모델 로딩 상태에 따라 위험도 추정값을 반영
4) 응답된 JSON을 Frontend가 받아 대시보드/상세 화면에 반영

### 프론트엔드 동작 개요
- 진입점: `src/main.tsx` → `src/app/App.tsx`
- 환자 목록, 상세, 알림 설정 UI는 `src/app/components/`에 분리되어 있음
- `/api` 프록시는 `vite.config.ts`에서 설정됨 (로컬 개발 시 `http://127.0.0.1:8000`)

### 백엔드 동작 개요
- 엔트리 포인트: `server_fastapi/app.py`
- 주요 엔드포인트
  - `GET /api/patients`: 환자 목록
  - `GET /api/patients/{icu_id}`: 환자 상세
  - `GET /api/status`: 모델 로딩 상태
  - `GET/PUT /api/patient-alert-rules`: 알림 규칙
  - `GET/POST /api/favorites`: 즐겨찾기
  - `GET/POST /api/alert-logs`: 알림 로그
- 주기 업데이트 루프가 환자 데이터/위험도를 갱신함

### 모델 연결 구조
- `server_fastapi/model_adapter.py`가 모델 로딩과 추론을 담당
- 실제 모델 구조는 `server_fastapi/model_impl.py`
- 로딩 대상:
  - `model/RealMIP_Pre.pth`
  - `model/RealMIP_Gen.pth`
  - `model/data_scaler.pkl`
- 환경변수로 모델 경로를 변경 가능:
  - `MODEL_PATH`, `MODEL_GEN_PATH`, `MODEL_SCALER_PATH`

### 데이터/DB 연동 구조
- `DATABASE_URL` 환경변수를 통해 Postgres 연결
- 테이블은 서버 시작 시 `ensure_tables()`로 생성됨
- 환자 규칙/즐겨찾기/로그는 DB에 저장되고 목록은 메모리 데이터와 합쳐져 UI에 반영됨

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

## 배포 서버 실행 (Docker Compose)
배포 서버에서는 정적 빌드를 만든 뒤 Nginx 컨테이너로 서빙합니다.

### 1) 프론트엔드 빌드
```bash
npm install
npm run build
```

### 2) 환경변수 확인
`.env`에 DB/모델 경로를 설정합니다.
```bash
DATABASE_URL=postgresql://icu:icu@db:5432/icu_risk
MODEL_PATH=/app/model/RealMIP_Pre.pth
MODEL_GEN_PATH=/app/model/RealMIP_Gen.pth
MODEL_SCALER_PATH=/app/model/data_scaler.pkl
```

### 3) 전체 서비스 실행
```bash
docker compose up -d
```

### 4) 접속
- 웹: `http://서버IP` (80)
- API: `http://서버IP:8000`

### 5) 중지/재시작
```bash
docker compose down
docker compose restart
```

---

## 운영 업데이트 (로컬 -> VM 배포)
로컬 변경사항을 VM에 반영하는 흐름입니다.

### 1) 로컬 변경사항 전송
rsync 사용 예시:
```bash
rsync -avz --delete --exclude node_modules --exclude .venv --exclude dist \
  -e "ssh -i /path/to/instance-team6.key" \
  ./ opc@서버IP:~/icu-risk/
```

### 2) VM에서 빌드 및 반영
프론트 변경 시:
```bash
cd ~/icu-risk
npm install
npm run build
sudo docker compose restart web
```

백엔드 변경 시:
```bash
cd ~/icu-risk
sudo docker compose up -d --build api
```

환경변수/설정 변경 시:
```bash
cd ~/icu-risk
sudo docker compose up -d
```

### 3) 상태 확인
```bash
sudo docker compose ps
curl http://서버IP:8000/api/status
```

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
