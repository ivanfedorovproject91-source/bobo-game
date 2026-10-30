# От бомжа до миллиардера — Telegram Mini App

## 1. Бот и GitHub Pages
1. GitHub: репозиторий → залей `index.html` → Settings → Pages → Branch `main` / root. Получишь `https://<ник>.github.io/<репо>/`.
2. @BotFather → `/newbot` (если бота нет) → `/newapp` или Bot Settings → Menu Button → вставь ссылку Pages.
3. Уже на этом шаге игра работает: прогресс хранится на устройстве и в Telegram Cloud (синхронизация между устройствами).

## 2. Серверное сохранение и рейтинг (Supabase, бесплатно)
1. supabase.com → New project.
2. SQL Editor → вставь `supabase/schema.sql` → Run.
3. Edge Functions → Create function, имя `game-api` → вставь код из `supabase/functions/game-api/index.ts` → Deploy.
   В настройках функции **выключи «Verify JWT»** (доступ защищён подписью Telegram).
   (Через CLI: `supabase functions deploy game-api --no-verify-jwt`)
4. Edge Functions → Secrets → добавь `BOT_TOKEN` = токен бота из @BotFather.
5. В `index.html` найди `const API_URL = '';` и вставь:
   `https://<project-ref>.supabase.co/functions/v1/game-api`
6. Залей обновлённый `index.html` на GitHub.

## Как это работает
- Игрок опознаётся по подписи Telegram, токен бота хранится только на сервере.
- Сервер отсекает накрутку: прирост заработка ограничен временем и доходом.
- Рейтинг — по лучшему результату за всё время (сброс жизни место не обнуляет). Публично видно только имя в Telegram.
- Если играл до подключения сервера и накопил больше 2 000 000 ₽, первое сохранение отклонится — подними `FIRST_SAVE_LIMIT` в функции или нажми «Новая жизнь».
- Проверять рейтинг можно только внутри Telegram (в обычном браузере `initData` нет).
