FROM python:3.11-slim

WORKDIR /app

COPY server_fastapi/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server_fastapi ./server_fastapi
COPY model ./model

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ["uvicorn", "server_fastapi.app:app", "--host", "0.0.0.0", "--port", "8000"]

