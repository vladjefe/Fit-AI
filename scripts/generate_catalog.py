"""Собирает frontend/src/data/exerciseCatalog.ts из серверного каталога.

Демо-сборки работают без бэкенда, поэтому каталог дублируется на фронте.
Генерация вместо ручной копии гарантирует, что списки не разойдутся.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.exercise_catalog import CATALOG  # noqa: E402

TARGET = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "exerciseCatalog.ts"

HEADER = '''import type { CatalogExercise } from "../types";

/**
 * Копия серверного каталога для демо-режима без бэкенда.
 * Генерируется скриптом scripts/generate_catalog.py — руками не править.
 */
export const mockCatalog: CatalogExercise[] = [
'''


def main() -> None:
    rows = [
        "  {{ id: {id}, name: {name}, muscleGroup: {group}, "
        "equipment: {equipment}, unit: {unit}, imageKey: {image}, isCustom: false }},".format(
            id=index,
            name=json.dumps(entry.name, ensure_ascii=False),
            group=json.dumps(entry.muscle_group, ensure_ascii=False),
            equipment=json.dumps(entry.equipment, ensure_ascii=False),
            unit=json.dumps(entry.unit, ensure_ascii=False),
            image=json.dumps(entry.image_key, ensure_ascii=False) if entry.image_key else "null",
        )
        for index, entry in enumerate(CATALOG, start=1)
    ]
    io.open(TARGET, "w", encoding="utf-8").write(HEADER + "\n".join(rows) + "\n];\n")
    print(f"{TARGET.relative_to(Path.cwd())}: {len(CATALOG)} упражнений")


if __name__ == "__main__":
    main()
