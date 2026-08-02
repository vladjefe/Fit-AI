"""Каталог упражнений для конструктора тренировок.

Состав опирается на набор оборудования типового зала DDX Fitness: блочные и
рычажные тренажёры, рама Смита, кроссовер, гравитрон, свободные веса и
функциональная зона. Список намеренно ограничен ходовыми движениями — в
конструкторе на телефоне листать сотни позиций невозможно.

`image_key` заполнен там, где есть иллюстрация в assets/exercises; для
остальных упражнений frontend показывает заглушку по типу оборудования.
"""

from __future__ import annotations

from typing import NamedTuple


class CatalogEntry(NamedTuple):
    name: str
    muscle_group: str
    equipment: str
    image_key: str | None


CHEST = "Грудь"
BACK = "Спина"
SHOULDERS = "Плечи"
ARMS = "Руки"
LEGS = "Ноги"
GLUTES = "Ягодицы"
CORE = "Пресс"
CARDIO = "Кардио"

MUSCLE_GROUPS = (CHEST, BACK, SHOULDERS, ARMS, LEGS, GLUTES, CORE, CARDIO)

BARBELL = "Штанга"
DUMBBELL = "Гантели"
MACHINE = "Тренажёр"
CABLE = "Блок"
SMITH = "Смита"
BODYWEIGHT = "Своё тело"
KETTLEBELL = "Гиря"
FUNCTIONAL = "Функциональное"
CARDIO_MACHINE = "Кардио"

EQUIPMENT = (
    BARBELL,
    DUMBBELL,
    MACHINE,
    CABLE,
    SMITH,
    BODYWEIGHT,
    KETTLEBELL,
    FUNCTIONAL,
    CARDIO_MACHINE,
)

CATALOG: tuple[CatalogEntry, ...] = (
    # Грудь
    CatalogEntry("Жим штанги лёжа", CHEST, BARBELL, "barbell-bench-press"),
    CatalogEntry("Жим штанги на наклонной", CHEST, BARBELL, None),
    CatalogEntry("Жим гантелей лёжа", CHEST, DUMBBELL, "dumbbell-bench-press"),
    CatalogEntry("Жим гантелей на наклонной", CHEST, DUMBBELL, None),
    CatalogEntry("Разводка гантелей лёжа", CHEST, DUMBBELL, None),
    CatalogEntry("Жим в тренажёре сидя", CHEST, MACHINE, "lever-chest-press"),
    CatalogEntry("Баттерфляй", CHEST, MACHINE, None),
    CatalogEntry("Сведение рук в кроссовере", CHEST, CABLE, "standing-cable-fly"),
    CatalogEntry("Жим в раме Смита", CHEST, SMITH, None),
    CatalogEntry("Отжимания на брусьях", CHEST, BODYWEIGHT, None),
    CatalogEntry("Отжимания от пола", CHEST, BODYWEIGHT, None),
    # Спина
    CatalogEntry("Подтягивания", BACK, BODYWEIGHT, None),
    CatalogEntry("Подтягивания в гравитроне", BACK, MACHINE, None),
    CatalogEntry("Тяга верхнего блока", BACK, MACHINE, "lever-lat-pulldown"),
    CatalogEntry("Тяга верхнего блока узким хватом", BACK, CABLE, "close-grip-lat-pulldown"),
    CatalogEntry("Тяга горизонтального блока", BACK, MACHINE, "lever-seated-row"),
    CatalogEntry("Тяга Т-грифа", BACK, BARBELL, "t-bar-row"),
    CatalogEntry("Тяга штанги в наклоне", BACK, BARBELL, None),
    CatalogEntry("Тяга гантели одной рукой", BACK, DUMBBELL, None),
    CatalogEntry("Становая тяга", BACK, BARBELL, None),
    CatalogEntry("Румынская тяга", BACK, BARBELL, None),
    CatalogEntry("Гиперэкстензия", BACK, BODYWEIGHT, None),
    CatalogEntry("Шраги с гантелями", BACK, DUMBBELL, None),
    CatalogEntry("Пулловер на блоке", BACK, CABLE, None),
    # Плечи
    CatalogEntry("Жим гантелей сидя", SHOULDERS, DUMBBELL, "dumbbell-shoulder-press"),
    CatalogEntry("Жим штанги стоя", SHOULDERS, BARBELL, None),
    CatalogEntry("Жим в раме Смита сидя", SHOULDERS, SMITH, None),
    CatalogEntry("Махи гантелями в стороны", SHOULDERS, DUMBBELL, "lateral-raise"),
    CatalogEntry("Махи в стороны на блоке", SHOULDERS, CABLE, None),
    CatalogEntry("Обратная бабочка", SHOULDERS, MACHINE, "reverse-pec-deck"),
    CatalogEntry("Разведение в наклоне", SHOULDERS, DUMBBELL, None),
    CatalogEntry("Тяга штанги к подбородку", SHOULDERS, BARBELL, None),
    CatalogEntry("Подъём гантелей перед собой", SHOULDERS, DUMBBELL, None),
    # Руки
    CatalogEntry("Подъём штанги на бицепс", ARMS, BARBELL, "barbell-curl"),
    CatalogEntry("Подъём гантелей на бицепс", ARMS, DUMBBELL, None),
    CatalogEntry("Молот", ARMS, DUMBBELL, None),
    CatalogEntry("Сгибание на скамье Скотта", ARMS, MACHINE, None),
    CatalogEntry("Сгибание на нижнем блоке", ARMS, CABLE, None),
    CatalogEntry("Разгибание на верхнем блоке", ARMS, CABLE, "rope-triceps-pushdown"),
    CatalogEntry("Французский жим", ARMS, BARBELL, None),
    CatalogEntry("Разгибание гантели из-за головы", ARMS, DUMBBELL, None),
    CatalogEntry("Отжимания узким хватом", ARMS, BODYWEIGHT, None),
    CatalogEntry("Обратные отжимания от скамьи", ARMS, BODYWEIGHT, None),
    # Ноги
    CatalogEntry("Присед со штангой", LEGS, BARBELL, None),
    CatalogEntry("Присед в гакке", LEGS, MACHINE, "hack-squat"),
    CatalogEntry("Присед в раме Смита", LEGS, SMITH, None),
    CatalogEntry("Жим ногами", LEGS, MACHINE, "leg-press"),
    CatalogEntry("Разгибание голени сидя", LEGS, MACHINE, "seated-leg-extension"),
    CatalogEntry("Сгибание голени лёжа", LEGS, MACHINE, "lying-leg-curl"),
    CatalogEntry("Сгибание голени сидя", LEGS, MACHINE, "seated-leg-curl"),
    CatalogEntry("Выпады с гантелями", LEGS, DUMBBELL, None),
    CatalogEntry("Болгарский присед", LEGS, DUMBBELL, None),
    CatalogEntry("Подъём на носки", LEGS, MACHINE, "calf-raise"),
    CatalogEntry("Приведение бедра", LEGS, MACHINE, None),
    CatalogEntry("Гоблет-присед", LEGS, KETTLEBELL, None),
    # Ягодицы
    CatalogEntry("Ягодичный мост", GLUTES, BARBELL, "hip-thrust"),
    CatalogEntry("Отведение бедра в тренажёре", GLUTES, MACHINE, None),
    CatalogEntry("Отведение ноги на блоке", GLUTES, CABLE, None),
    CatalogEntry("Ягодичный мост в тренажёре", GLUTES, MACHINE, None),
    CatalogEntry("Зашагивания на тумбу", GLUTES, DUMBBELL, None),
    # Пресс
    CatalogEntry("Скручивания на скамье", CORE, BODYWEIGHT, None),
    CatalogEntry("Подъём ног в висе", CORE, BODYWEIGHT, None),
    CatalogEntry("Скручивания на блоке", CORE, CABLE, None),
    CatalogEntry("Планка", CORE, BODYWEIGHT, None),
    CatalogEntry("Скручивания в тренажёре", CORE, MACHINE, None),
    CatalogEntry("Русский твист", CORE, FUNCTIONAL, None),
    CatalogEntry("Колесо для пресса", CORE, FUNCTIONAL, None),
    # Кардио
    CatalogEntry("Беговая дорожка", CARDIO, CARDIO_MACHINE, None),
    CatalogEntry("Эллипс", CARDIO, CARDIO_MACHINE, None),
    CatalogEntry("Велотренажёр", CARDIO, CARDIO_MACHINE, None),
    CatalogEntry("Гребной тренажёр", CARDIO, CARDIO_MACHINE, None),
    CatalogEntry("Лестница", CARDIO, CARDIO_MACHINE, None),
    CatalogEntry("Скакалка", CARDIO, FUNCTIONAL, None),
    CatalogEntry("Канаты", CARDIO, FUNCTIONAL, None),
)
