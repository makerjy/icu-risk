## ICU Risk Dashboard

### Tech stack
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: FastAPI (Python)
- DB: Postgres (Docker)
- Model: PyTorch + joblib (server-side inference)

### Repository structure
- Frontend: `src/`
- Backend: `server_fastapi/`
- DB init SQL: `server_fastapi/sql/init.sql`
- Docker: `docker-compose.yml`
- Environment: `.env`

### Prerequisites
- Node.js
- Python 3.11 (or the version in `.python-version`)
- Docker Desktop

### 1) Start Postgres (Docker)
```bash
docker compose up -d db
```

Check DB connectivity:
```bash
docker compose exec db psql -U icu -d icu_risk -c "SELECT current_user;"
```

### 2) Start FastAPI server
Create venv + install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r server_fastapi/requirements.txt
```

Run server with env file:
```bash
uvicorn server_fastapi.app:app --reload --env-file .env
```

### 3) Start frontend (Vite)
```bash
npm install
npm run dev
```

Open:
- `http://localhost:5173`

### 4) API quick checks
```bash
curl http://localhost:8000/api/status
curl http://localhost:8000/api/patients
```

### 5) DB schema check
```bash
docker compose exec db psql -U icu -d icu_risk
```

Inside psql:
```sql
\dt
\d patient_alert_rules
\d favorites
\d alert_logs
```

### Environment
`.env` should contain:
```
DATABASE_URL=postgresql://icu:icu@127.0.0.1:5433/icu_risk
```

### Notes
- Vite dev server proxies `/api` to `http://127.0.0.1:8000` (see `vite.config.ts`).
- Docker DB port mapping should be `5433:5432` if local Postgres is running.
