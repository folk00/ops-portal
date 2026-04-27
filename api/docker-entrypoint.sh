#!/bin/sh
set -eu

cd /app/api

python - <<'PY'
import time

from sqlalchemy import create_engine, text

from app.core.config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url, future=True)

for attempt in range(60):
    try:
        with engine.connect() as connection:
            connection.execute(text("select 1"))
        print("Database connection ready.")
        break
    except Exception as exc:
        if attempt == 59:
            raise
        print(f"Waiting for database ({attempt + 1}/60): {exc}")
        time.sleep(2)
PY

alembic upgrade head
python ../scripts/sample_seed.py

exec uvicorn main:app --host 0.0.0.0 --port 8010
