# Deploy assets

Перед копированием замените `fit.example.com` и, если нужно, пути/пользователя `fitai`.

Создание пользователя и прав:

```bash
sudo useradd --system --home /opt/fit-ai --shell /usr/sbin/nologin fitai
sudo chown -R fitai:fitai /opt/fit-ai
sudo chmod 600 /opt/fit-ai/.env
sudo -u fitai /opt/fit-ai/.venv/bin/alembic -c /opt/fit-ai/alembic.ini upgrade head
```

Установка unit-файлов и nginx описана в корневом README. После изменений:

```bash
sudo systemctl daemon-reload
sudo systemctl restart fit-ai-backend fit-ai-bot
sudo nginx -t && sudo systemctl reload nginx
```

`ProtectSystem=strict` разрешает запись только в `/opt/fit-ai/data`. Если добавляется локальное хранилище фото, создайте отдельный каталог и добавьте его в `ReadWritePaths` обоих сервисов, которым он действительно нужен.
