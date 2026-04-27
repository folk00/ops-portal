from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.db.session import SessionLocal
from app.services.imports import import_from_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Import an Ops workbook into the Ops Portal database.")
    parser.add_argument("workbook", help="Path to the xlsx workbook")
    parser.add_argument("--imported-by", type=int, default=None)
    args = parser.parse_args()

    workbook_path = Path(args.workbook)
    if not workbook_path.exists():
        raise FileNotFoundError(f"Workbook not found: {workbook_path}")

    with SessionLocal() as db:
        result = import_from_path(db, workbook_path, imported_by=args.imported_by)
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
