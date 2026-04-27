from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.db.session import SessionLocal
from app.services.seed import seed_demo_data


def main() -> None:
    with SessionLocal() as db:
        result = seed_demo_data(db, reset=False)
    print("Seed complete:", result)


if __name__ == "__main__":
    main()

