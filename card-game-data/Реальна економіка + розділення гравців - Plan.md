
## Context

Дві проблеми, обидві виявлені вимірюванням, а не здогадом.

**1. Гравці ніяк не розділені.** `PlayersService.getCurrentPlayer()` ([players.service.ts:33](game-api/src/players/players.service.ts:33)) виконує `SELECT * FROM players ORDER BY created_at ASC LIMIT 1` на кожен запит. API взагалі не дивиться на запит, щоб вирішити, чиї дані віддати. Немає ні guard, ні JWT, ні cookie. `/api/admin/*` відкритий повністю, `enableCors({origin: true})` відбиває будь-який origin, `app.listen(port)` слухає 0.0.0.0. При цьому **дані вже готові до багатокористувацькості**: 4 з 6 таблиць мають `player_id NOT NULL` з `ON DELETE CASCADE`, і всі запити вже коректно фільтрують. Прогалина — одна функція, не архітектура.

**2. Зворотна економічна петля мертва.** Проєктний розрахунок — 61 монета повернення зі 100-монетного кейса — припускає, що кожен дроп можна продати. Але `LAST_COPY` ([inventory.service.ts:170](game-api/src/inventory/inventory.service.ts:170)) блокує продаж єдиної копії, тож дроп платить лише коли картка **вже є**. Пул виріс 110 → 432, а всі константи економіки лишились під 110.

Реальна віддача рахується як `EV = Σ w_r × sellValue_r × (owned_r / pool_r)`. При ~19 картках проти пулу 432 для Starter Chest:

```
common     0.600 × 15   × 12/180 = 0.60
uncommon   0.220 × 40   ×  4/108 = 0.33
rare       0.120 × 100  ×  2/64  = 0.38
epic       0.045 × 300  ×  1/35  = 0.39
legendary  0.013 × 900  ×  0/30  = 0
mythic     0.002 × 3000 ×  0/15  = 0
                                  ------
                                    1.70 монети зі 100  (1.7%)
```

Щоденні 500 монет купують **5.1 відкриттів замість проєктних ~13**. Щоб дійти до 61, треба володіти приблизно половиною кожного тиру (~200+ карток) — місяці. Продаж дублікатів, одне з трьох джерел доходу, фактично не працює.

**Побічні підтверджені наслідки:** `POOL_TARGET_TOTAL = 110` захардкоджений ([rarity.ts:57](packages/shared-types/src/rarity.ts:57)), тож інвентар показує прогрес проти 110 при пулі 432, а mythic `poolTarget: 2` проти 15 реальних дає «3 / 2». `'milestone'` є в enum `transaction_type`, дизайн-док обіцяє 200–2000 монет за прогрес — **нічого ніде його не пише**.

**Рішення користувача:** економіка фазами (спершу полагодити петлю, потім нові механіки); справжня автентифікація з ролями; прогрес рахується з реального пулу.

---

## Знайдені баги (виправляються по дорозі)

| Файл | Проблема |
|---|---|
| [useInventory.ts:21](game-ui/src/features/inventory/useInventory.ts:21) | `FULL_COLLECTION_LIMIT = 100` з коментарем «comfortably above POOL_TARGET_TOTAL (110)» — воно **менше** за 110 і втричі менше за 432. Прогрес рахується з перших 100 груп. |
| [CollectionProgress.tsx:14](game-ui/src/features/inventory/CollectionProgress.tsx:14) | Заголовок бере `POOL_TARGET_TOTAL`, рядки — `progress.byRarity[r].total`. Можуть розійтись. |
| [seed.ts:255](game-api/src/seed/seed.ts:255) | `--reset` робить `TRUNCATE` шести таблиць без підтвердження, проти будь-якого `DATABASE_URL`. Головна загроза даним під час цієї роботи. |
| [seed.ts:144](game-api/src/seed/seed.ts:144) | `seedCases` пропускає наявні slug — правка ціни в `CASE_SEEDS` **не доїжджає** до живої БД. Потрібна міграція. |
| `CASE_WEIGHTS` | Stoneheart Coffer строго домінований: 180 монет проти 100 у Starter Chest, гірші шанси, EV 61.3 проти 61.0 (34% проти 61%). Гравцю нема причин його брати. |

---

## Порядок і чому саме такий

```
Крок 0  Запобіжник + бекап          (нуль фіч, але захищає незамінні дані)
Крок 1  Правда про пул              (незалежний; має передувати мілстоунам)
Крок 2  Автентифікація              (чіпає всі контролери й усі 5 e2e-наборів)
Крок 3  Економіка, фаза 1           (мілстоуни, масовий продаж, trigger)
Крок 4  Економіка, фаза 2           (сети → крафт → магазин)
```

Домінуюча залежність: **auth має бути до мілстоунів.** Обидва переписують `DropsService.openCase`, і e2e для мілстоунів потребують auth-хелпера. Зворотної залежності немає.

---

## Крок 0 — Запобіжник

- [seed.ts:254](game-api/src/seed/seed.ts:254) — заблокувати гілку `--reset`, доки не задано `ALLOW_DESTRUCTIVE_SEED=1` **і** ім'я БД не `cardgame`. Друкувати резолвлений DSN перед дією.
- `.env.example` — виправити порт на 5433 (реальність), додати `JWT_SECRET`, `FORGE_SERVICE_TOKEN`, `CORS_ORIGINS`, `API_HOST`, `ALLOW_DESTRUCTIVE_SEED`.
- **Дія оператора:** `pg_dump` живої `cardgame` у файл поза репозиторієм. Усі міграції нижче написані як недеструктивні, але 432 картки й реальна історія гри заслуговують справжнього бекапу.

## Крок 1 — Правда про пул

**Видалити `POOL_TARGET_TOTAL`, а не перенацілити на 432.** Значення 432 знову протухне при наступній генерації, і протухне тихо — саме та поломка, яку лагодимо.

- [rarity.ts](packages/shared-types/src/rarity.ts) — прибрати `poolTarget` з `RarityMeta` і `POOL_TARGET_TOTAL`; додати `POOL_SEED_RATIOS` `{common:180, uncommon:108, rare:64, epic:35, legendary:30, mythic:15}` з коментарем, що це **лише** для форми синтетичного пулу в сідері, ніколи не джерело правди про прогрес.
- Новий модуль `game-api/src/collection/` — `PoolService.getApprovedCountsByRarity()` одним запитом `SELECT rarity, COUNT(*) FROM cards WHERE status='approved' GROUP BY rarity` (кожна рідкість дефолтиться в 0, щоб відсутня не стала `undefined`), in-process memo з TTL 60 с плюс `invalidate()` з `AdminService.ingest()` і `.update()`. Один Node-процес (ADR-009) — Redis не потрібен. `GET /api/me/collection` віддає наявний `CollectionProgressDto`.
- [seed.ts:85](game-api/src/seed/seed.ts:85) — `allocateRarityCounts` переходить на `POOL_SEED_RATIOS`; оновити застарілий докстрінг.
- [health.controller.spec.ts:24](game-api/src/health/health.controller.spec.ts:24) — тест перевіряє зв'язку jest↔shared-types, а не число 110. Замінити на структурне: `RARITIES` має довжину 6, `RARITY_META.mythic.sellValue === 3000`.
- **Видалити** `game-ui/src/lib/collection.ts` і його тест. `useInventory.ts` втрачає `FULL_COLLECTION_LIMIT` і другий запит `getInventory` — `Promise.all` стає `[getInventory(pageQuery), getCollectionProgress()]`. Один обмежений запит замість такого, що тихо обрізає.
- `CollectionProgress.tsx` — усюди `progress.total` / `progress.owned`.
- `mocks/handlers.ts` — хендлер `GET /me/collection`.

**Тести:** unit — `total` рахується лише з approved (draft/rejected не роздувають), рідкість без карток дає `total: 0`. E2E `collection.e2e-spec.ts` — заапрувити картку, перезапитати прогрес, `total` зрушив. Саме цей тест зловив би захардкоджені 110. Фікстури UI-тестів перевести на не-110 суму.

## Крок 2 — Автентифікація

### Схема: колонки на `players`, не окрема `accounts`

Чотири таблиці мають FK на `players.id ON DELETE CASCADE`. Окрема таблиця означала б або nullable `players.account_id` з join на кожен запит, або перепризначення FK на живих даних — деструктивно.

Міграція `<ts>-AddPlayerAuth.ts`:
1. `CREATE TYPE player_role AS ENUM ('player','admin')`.
2. `ALTER TABLE players ADD COLUMN email text NULL, password_hash text NULL, role player_role NOT NULL DEFAULT 'player', last_login_at timestamptz NULL`.
3. `CREATE UNIQUE INDEX uq_players_email ON players (lower(email)) WHERE email IS NOT NULL` — той самий патерн часткового унікального індексу, що вже вживається на `uq_case_openings_idempotency`.
4. **`ALTER TABLE players ALTER COLUMN balance_coins DROP DEFAULT`, те саме для `balance_keys`.**

Пункт 4 — структурна половина захисту ledger і коштує один рядок. Зараз **будь-який** `INSERT INTO players` без балансів тихо друкує 1000 монет + 5 ключів без рядка в ledger. Після — падає на NOT NULL. Дзеркально прибрати `default:` з [player.entity.ts:15,20](game-api/src/entities/player.entity.ts:15).

Nullable `email`/`password_hash` навмисне: дозволяє наявному рядку Molo існувати непри'вязаним до моменту прив'язки.

### Реєстрація не ламає інваріант

`AuthService.register()` — **одна** `dataSource.transaction()`: перевірка email (гонку ловить унікальний індекс, `23505` → `EMAIL_TAKEN`) → хеш пароля → `manager.save(PlayerEntity, {...})` з балансами **явно** з `INITIAL_GRANT`, ніколи не покладаючись на default → `ledgerService.recordTransaction(manager, {type:'initial_grant', ...})` → токен.

Структурно ідентично [seed.ts:109-130](game-api/src/seed/seed.ts:109), який уже робить правильно. Реєстрація — єдиний новий шлях створення балансу, і він іде через `LedgerService`, зберігаючи властивість «єдиного письменника» з ADR-008. Реєстрація завжди дає `role: 'player'`; HTTP-шляху до admin немає.

### Прив'язка наявного Molo — офлайн CLI, не HTTP

Не робити ендпоінт «claim». Неавтентифікований claim на БД, де гравець уже є, — це примітив захоплення акаунта.

Новий `game-api/src/scripts/bind-account.ts`, скрипт `account:bind` у `package.json` поряд із `seed`:

```bash
npm run account:bind -- --player "Molo" --email you@example.com --role admin
```

Резолвить за `--player` або `--id`, відмовляється при 0 або >1 збігах, **відмовляється якщо `password_hash IS NOT NULL`**, читає пароль зі stdin (не з argv — щоб не потрапив в історію шелу), робить `UPDATE players SET email, password_hash, role`. **Не пише в ledger і не чіпає баланси**, тож інваріант недоторканий за побудовою. Не торкається `player_cards`, `case_openings`, `transactions`. Це ж єдиний спосіб створити адміна взагалі.

`seedPlayer()` теж оновити: читати `SEED_PLAYER_EMAIL`/`SEED_PLAYER_PASSWORD`, а без них не створювати гравця і друкувати підказку про `account:bind` — інакше свіжа БД дає гравця, якого неможливо прив'язати.

### Конкретні вибори

- **Хешування: `@node-rs/argon2`.** Argon2id правильний, пакет має готові бінарники. `argon2` і `bcrypt` тягнуть node-gyp → Visual Studio Build Tools на Windows.
- **JWT: тільки `@nestjs/jwt`, без `@nestjs/passport`.** Passport дає абстракцію стратегій, яку інстанціюєш один раз. Guard — ~30 рядків руками. NestJS тут 11, не 10.
- **Транспорт: один access-токен на 7 днів у `localStorage`, `Authorization: Bearer`.** httpOnly-cookie через розрив origin 5173→3000 вимагає `credentials:true`, явний allowlist і CSRF — реальна робота заради локальної гри. **Задокументувати компроміс у докстрінгу модуля:** якщо це колись вийде назовні, треба httpOnly + CSRF і коротший TTL.
- `JWT_SECRET` з env **без дефолту** — застосунок не стартує, якщо не заданий. Дефолтний секрет = відсутність auth.
- Claims: `sub`, `role`, `iat`, `exp`. Guard **не ходить у БД** на кожен запит. Наслідок: зняття ролі admin діє лише після протухання токена. Прийнятно на 7 днів для одного оператора; для миттєвого відкликання — `token_version` у claim.

**Нові файли** в `game-api/src/auth/`: `auth.module.ts`, `auth.service.ts`, `auth.controller.ts` (`POST /auth/register`, `/auth/login`, `GET /auth/me`), `dto/{register,login}.dto.ts`, `guards/{jwt-auth,roles,service-token}.guard.ts`, `decorators/{public,roles,current-player}.decorator.ts`, плюс специ.

**Реєстрація guard: глобальний `APP_GUARD`, fail-closed.** У `app.module.ts` — `JwtAuthGuard` і `RolesGuard` як `APP_GUARD`, далі `@Public()` на винятках: `HealthController.check`, обидва роути `AuthController`, `CardsController` (обидва), `CasesController.list`. Allowlist означає, що доданий пізніше роут захищений за замовчуванням.

### Шість місць виклику

| Файл | Зміна |
|---|---|
| [players.controller.ts:23](game-api/src/players/players.controller.ts:23) | `@CurrentPlayerId() playerId` + новий `findByIdOrFail` |
| [inventory.controller.ts:27,36,43,49](game-api/src/inventory/inventory.controller.ts:27) | 4 роути → `@CurrentPlayerId()` |
| [drops.service.ts:49](game-api/src/drops/drops.service.ts:49) | рядок видаляється; `openCase()` отримує `playerId` першим параметром |

Наслідки: `drops.controller.ts:22` передає `@CurrentPlayerId()`; інжекція `PlayersService` в `inventory.controller.ts` і `drops.module.ts` стає непотрібною (перевірено — використовувалась **лише** для `getCurrentPlayerId`); з `players.service.ts` видаляються `getCurrentPlayer()`/`getCurrentPlayerId()`, додається `findByIdOrFail()`, три `count*` лишаються; з [configuration.ts:11,40](game-api/src/config/configuration.ts:40) видаляється `playerId` — мертвий env-оверайд, що тихо міняє особистість поруч зі справжнім auth, гірший за його відсутність. Повідомлення `Player ${playerId} not found — run npm run seed` у трьох сервісах стає 401.

### Admin і card-forge

`AdminController` отримує `@Roles('admin')` на рівні класу. `POST admin/cards/ingest` додатково `@UseGuards(ServiceTokenGuard)` — **статичний сервісний токен правильний для машинного клієнта**; не варто видавати JWT батч-скрипту, що працює 45 хвилин без нагляду. Guard читає `X-Service-Token`, порівнює через `crypto.timingSafeEqual` (хешувати обидві сторони, щоб довжини завжди збігались), **при незаданому `FORGE_SERVICE_TOKEN` відхиляє** — ніколи не падає в «відкрито», ніколи не має дефолту. Пропускає також валідний admin-JWT.

`card-forge/ingest.py:61` — `run_ingest` отримує `service_token`, `requests.post(..., headers=headers)`; окрема гілка 401/403 з повідомленням, що називає `FORGE_SERVICE_TOKEN`. `forge.py` читає його з env поряд із `FORGE_API_URL`.

### `main.ts`

`enableCors({ origin: config.corsOrigins, credentials: false })` з `CORS_ORIGINS` (дефолт `http://localhost:5173`) — відбивати будь-який origin поруч із токен-API не захищається жодним аргументом. `app.listen(port, config.apiHost)` з `API_HOST` за замовчуванням `127.0.0.1` — 0.0.0.0 виставляє admin-API в локальну мережу.

### game-ui

Нові `lib/auth.ts` (токен у localStorage + декод claims **лише для UI-афордансів**, сервер лишається авторитетом), `lib/authContext.tsx`, `features/auth/{Login,Register}.tsx`. [api.ts:49-76](game-ui/src/lib/api.ts:49) — `request()` чіпляє `Authorization`, на 401 чистить токен і диспатчить logout, щоб застосунок падав на екран входу, а не зациклювався. `App.tsx` — `AuthProvider`, роути `/login`, `/register`, гейт на `/admin` за `role === 'admin'`. `AppShell.tsx` — ховати «Review» для не-адмінів, додати вихід.

`packages/shared-types/src/api.ts` — додати `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN` до `API_ERROR_CODES`. Корисна властивість: `USER_MESSAGES` у [apiError.ts:48](game-ui/src/lib/apiError.ts:48) — це `Record<ApiErrorCode, string>`, тож нові коди дають **помилку компіляції**, доки не додані тексти. Спертись на це.

### Тести кроку 2

Unit: guard без заголовка / з битим / з протухлим → 401, `@Public()` проходить; player на admin-роуті → 403; **невірний сервісний токен → 403 і незадана env → 403, а не 200**; хеш round-trip.

E2E `auth.e2e-spec.ts` — **писати першим**: реєстрація створює рівно один рядок `initial_grant` і `SUM(delta_coins) == balance_coins` для нового гравця. Далі: дубль email → `EMAIL_TAKEN`; невірний пароль → `INVALID_CREDENTIALS`; будь-який `/me/*` без токена → 401; `/admin/cards` з player-токеном → 403; ingest із валідним `X-Service-Token` без JWT → 200.

Спільний хелпер `test/auth.helper.ts` — `createTestPlayer` / `createTestAdmin`. Оновити всі п'ять наявних e2e-наборів. [ledger-invariant.e2e-spec.ts:62](game-api/test/ledger-invariant.e2e-spec.ts:62) шукає `displayName: 'Molo'` — замінити на свіжозареєстрований акаунт, що заразом прибирає залежність від стану сіду.

Регресійний тест: сирий `INSERT INTO players (display_name) VALUES ('x')` тепер **падає**. Документує, навіщо DROP DEFAULT.

### Порядок усередині кроку 2

1. shared-types → 2. міграція + entity → 3. auth-модуль і guard, **але ще не реєструвати `APP_GUARD`** → 4. **`npm run account:bind` для Molo з `--role admin`** → 5. тепер реєструвати `APP_GUARD`, розставити `@Public()`/`@Roles()` → 6. шість місць виклику → 7. `main.ts` → 8. card-forge → 9. UI → 10. e2e.

> **Якщо крок 5 виїде раніше за крок 4 — ти замкнений поза `/api/admin` і `/api/me` без жодного шляху назад, крім SQL.** Це найризикованіша помилка порядку в усьому плані.

## Крок 3 — Економіка, фаза 1

### Мілстоуни

Таблиця `player_milestones`: `id uuid PK`, `player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE`, `milestone_key text NOT NULL`, `awarded_at timestamptz`, `transaction_id uuid NULL REFERENCES transactions(id) ON DELETE SET NULL`, **`UNIQUE (player_id, milestone_key)`**.

**Чому не може заплатити двічі — дві незалежні причини.** По-перше, кожне відкриття вже бере `SELECT ... FOR UPDATE` на рядку гравця **першим** ([drops.service.ts:52](game-api/src/drops/drops.service.ts:52)); два паралельні відкриття серіалізуються на цьому локі, тож друге бачить рядки `player_milestones` першого. Перевірка всередині тієї ж транзакції успадковує гарантію безкоштовно. По-друге, унікальний constraint: навіть якщо міркування вище хибне або майбутній код забуде лок, другий INSERT дає `23505` і відкочує транзакцію. Constraint — те, що лишиться правдою через рік.

**Місце в `openCase`:** між вставкою `player_cards` ([:158](game-api/src/drops/drops.service.ts:158)) і фінальним `manager.save(player)` ([:177](game-api/src/drops/drops.service.ts:177)) — щоб монети мілстоуна й баланс комітились атомарно. Підрахунок `copies` (зараз на `:181`, після save) **піднімається вище**: кількість унікальних може змінитись лише при `copies === 1`, тож на дублікаті шлях мілстоунів пропускається цілком. Той самий запит, лише переставлений.

`MilestoneService.checkAndAward(manager, playerId)` — рахує `COUNT(DISTINCT card_id)` **через переданий `manager`**, щоб бачити незакомічену роботу цієї ж транзакції; вибирає вже видані ключі; для кожного досягнутого тиру пише `milestone` через `LedgerService`, вставляє рядок і мутує баланс у пам'яті (персистить `manager.save(player)` викликача).

Видавати **всі** досягнуті тири за один прохід — саме це робить ліниве наздоганяння правильним: Molo на 19 унікальних закриває тир 1 на першому ж відкритті, **без міграції, що пише в ledger**. Другий виклик — у `claimDailyBonus` ([:205](game-api/src/inventory/inventory.service.ts:205)), теж уже під локом, щоб гравець, який перестав відкривати кейси, все одно отримав зароблене.

**Пороги — абсолютні числа унікальних карток, ніколи не відсоток пулу.** З динамічним пулом відсоток **ретроактивно знімав би** мілстоун щоразу, як згенеруєш нові картки.

`GET /api/me/milestones` — уся драбина, read-only, **не видає нагород** (GET, що пише в ledger, — це баг у засідці).

| Тир | ключ | унікальних | монет | ключів |
|---|---|---|---|---|
| 1 | `unique_10` | 10 | 200 | 0 |
| 2 | `unique_25` | 25 | 300 | 1 |
| 3 | `unique_50` | 50 | 500 | 1 |
| 4 | `unique_75` | 75 | 700 | 1 |
| 5 | `unique_100` | 100 | 900 | 2 |
| 6 | `unique_150` | 150 | 1 200 | 2 |
| 7 | `unique_200` | 200 | 1 500 | 3 |
| 8 | `unique_250` | 250 | 1 800 | 3 |
| 9 | `unique_300` | 300 | 2 000 | 4 |
| 10 | `unique_350` | 350 | 2 000 | 4 |
| 11 | `unique_400` | 400 | 2 000 | 5 |
| 12 | `unique_432` | 432 | 2 000 | 10 |

Разом 15 100 монет + 36 ключів на все життя колекції, у межах обіцяних дизайн-доком 200–2000. Тир 12 **заморозити на 432**: зростання пулу — свідоме контентне рішення, яке заразом додає тир; самоналаштовна «повна колекція» може роз-завершитись.

### Одна константа змінюється: `DAILY_BONUS` 500 → 800 монет, 1 → 2 ключі

Molo треба 81 унікальну, щоб закрити тири 1–5; при ~14% заповненості P(нова) ≈ 0.86, тобто ≈ 94 відкриття. Тир 1 платить одразу, решта 2 400 розмазані по 94 відкриттях = **25.5 монет/відкриття**.

| Стадія | EV продажу | мілстоуни | разом | чиста ціна (кейс 100) | відкриттів/день @ 800 |
|---|---|---|---|---|---|
| Старт (19 унік.) | 1.7 | 26 | 27.7 | 72.3 | **11.1** |
| Середина (~216) | 30.5 | 17 | 47.5 | 52.5 | **15.2** |
| Повна (432) | 61 | 0 | 61 | 39 | **20.5** |

Монотонна рампа 11 → 15 → 20, що стартує рівно в проєктному діапазоні «10–14 на день». Ручка — одне число.

**Ціни кейсів і вартість продажу НЕ рухаються** (крім одної нижче). Підняття `sellValue` не лагодить рампу: воно множить майже-нуль на старті й майже-ціну в кінці. При повній колекції EV Starter Chest — 61 проти ціни 100; подвоїш продаж — стане 122 > 100, тобто друкарський верстат саме тоді, коли карток для продажу найбільше. Збиткова маржа на завершенні — єдине, що взагалі лишає монети обмеженням.

**Єдина ціна, яку варто змінити: stoneheart-coffer 180 → 120.** При 180 він строго домінований (дорожчий за Starter Chest, гірші шанси, EV-відношення 34% проти 61%). При 120 відношення стає 51%, і вужча rare-смуга дає вимірну швидкість збору. Потрібна **справжня міграція** `UPDATE cases SET price_coins = 120 WHERE slug='stoneheart-coffer'` **плюс** правка `CASE_SEEDS` — `seedCases` пропускає наявні slug, тож сама константа нічого не зробить.

### Масовий продаж

`POST /api/me/inventory/sell-bulk`, тіло `{ mode: 'all_duplicates' } | { mode: 'by_rarity', rarities } | { instanceIds }`. Одна транзакція, лок гравця першим — та сама дисципліна, що в `sellCard`. Резолвить `copies - 1` екземплярів на картку (найстаріші перші), тож правило LAST_COPY тримається за побудовою і per-instance 409 не потрібен. Один `UPDATE ... WHERE id = ANY($1)`, потім **один ledger-рядок на екземпляр** одним багаторядковим INSERT — не агрегувати в підсумковий рядок: у `transactions` немає jsonb-деталей, агрегація вбиває простежуваність заради економії 199 дешевих вставок. Кап `maxInstances` (500), щоб патологічний запит не тримав лок хвилинами.

**Ідемпотентність не потрібна:** продажі — м'які видалення, крок 1 фільтрує `sold_at IS NULL`, тож повтор не знаходить нічого й повертає `soldCount: 0`. Окрема таблиця `idempotency_keys` — правильне узагальнення, яке тут не купує нічого.

### Інваріант ledger стає constraint-тригером

Міграція `<ts>-AddLedgerInvariantTrigger.ts`, **останньою**:
1. **Передперевірка, що голосно падає:** виконати запит порушень з `ledger-invariant.e2e-spec.ts:96` і, якщо є рядки, `throw` з переліком id. Не застосовувати наполовину. Живий стан ledger не вдалося перевірити (Docker лежав), тож міграція мусить припускати, що порушення вже можливе.
2. `CONSTRAINT TRIGGER ... AFTER INSERT OR UPDATE ON players ... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`.

**Тригер на `players`, не на `transactions`.** Кожна мутація балансу в цьому коді парує `recordTransaction` з `manager.save(player)` в одній транзакції (перевірено в `drops.service.ts:167-178`, `inventory.service.ts:182-191`, `:229-238`, `seed.ts:121-129`). Тригер на рядку гравця ловить усі, і спрацьовує **раз на гравця за транзакцію**, а не раз на ledger-рядок — що важливо саме для нового масового продажу з 200 рядками. Прогалина: вставка в `transactions` без оновлення гравця пройде повз; сьогодні так ніхто не робить — задокументувати як припущення тригера. `INITIALLY DEFERRED` означає перевірку на COMMIT, тож порядок операторів усередині транзакції не має значення.

> **Обов'язкова супутня правка:** [ledger-invariant.e2e-spec.ts:71-86](game-api/test/ledger-invariant.e2e-spec.ts:71) виконує `DELETE`, `UPDATE players`, `INSERT` як **п'ять окремих неявних транзакцій**. З живим тригером коміт `UPDATE players` перевіриться проти щойно спорожненого ledger і впаде. Обгорнути весь хелпер в одну `dataSource.transaction()` — **у тому ж коміті, що й міграція**.

Стеля вартості: перевірка пересумовує транзакції одного гравця на коміт. При ~343 рядках безкоштовно. Якщо колись накопичиться ~10⁵ — замінити на колонку running-total. Не сьогоднішня проблема.

### Тести кроку 3

- Перетин кількох порогів одразу видає **всі** за один прохід; уже виданий ключ не видається вдруге.
- **Головний конкурентний тест:** гравець за одну картку до порога, N паралельних `POST /cases/:slug/open` через `Promise.all` → рівно **один** рядок `player_milestones` і **одна** `milestone`-транзакція. Саме він ловить втрачений лок або відсутній constraint.
- Масовий продаж: ніколи не продає останню копію; `soldCount` дорівнює числу ledger-рядків; повтор дає `soldCount: 0`; інваріант тримається після 100 екземплярів.
- Додати масовий продаж у `pickOp` рандомізованого прогону в `ledger-invariant.e2e-spec.ts`.
- Тест тригера: навмисний сирий `UPDATE players SET balance_coins = balance_coins + 1` **падає на COMMIT**.

## Крок 4 — Фаза 2 (порядок теж важить)

Робити **після** того, як числа фази 1 обіграні, не паралельно. Сенс математики фази 1 у тому, що вона вимірна; другий шлях отримання карток знецінює вимір раніше, ніж прочитаєш результат.

**4a. Сети (Q9) перед крафтом.** `cards.set_id uuid NULL` існує без FK і без таблиці `sets`. Створити таблицю й FK **рано**, поки всі 432 рядки `NULL` — сьогодні це тривіально безпечна міграція, після призначення карток набагато більша. Крафт цілком імовірно захоче бути scoped по сету.

**4b. Крафт (Q8) — одне жорстке обмеження з фази 1.** Видача мілстоунів припускає, що лічильник унікальних **монотонний**. Сьогодні це так: `countUniqueCards` фільтрує `sold_at IS NULL`, а LAST_COPY не дає продати останню. Крафт споживає копії, тож **крафт мусить відмовлятись споживати останню копію**, точно як продаж. Закласти з першого коміта; наприкінці транзакції крафту викликати `checkAndAward` (крафт додає картку, отже може перетнути поріг).

**4c. Детермінований магазин — останнім.** Це пряма оплачувана дорога до конкретних карток, найсильніше збурення економіки мілстоунів. Ціни ставити **після** того, як побачиш реальні відкриття/день.

## Vault

Користувач дозволив писати контекст у vault (`card-game-data/`, який `docs/plans/00-decomposition.md` інакше тримає read-only). Конвенція: `NN - Категорія - Тема.md`, frontmatter `tags: [...]`, H1 українською, зворотне посилання `Назад до [[00 - Card Game MOC]]`. Наступний вільний номер — 12.

- **`12 - Game Design - Economy Rebalance.md`** — формула `EV = Σ w_r × sellValue_r × (owned_r / pool_r)`, вимір 1.7 монети, драбина тирів, таблиця рампи 11→15→20, чому `sellValue` не рухається, домінованість Stoneheart.
- **ADR-014** · Справжня автентифікація: JWT + локальний пароль, колонки на `players`, прив'язка через CLI.
- **ADR-015** · Ціль колекції рахується з реального пулу, `POOL_TARGET_TOTAL` видалено.
- **ADR-016** · Ledger-інваріант як constraint-тригер на `players`, не тест.
- **`11 - Planning - Open Questions.md`** — закрити Q10 (мультиюзер), позначити Q8/Q9 як заплановані у фазі 2.
- **`00 - Card Game MOC.md`** — навігаційний запис на 12.

---

## Перевірка наскрізь

```bash
docker compose up -d && npm run migration:run -w game-api
```

1. **Крок 1:** `curl localhost:3000/api/me/collection` → `total` дорівнює реальному числу approved (432), не 110. Заапрувити ще одну картку → `total` зріс.
2. **Крок 2:** `npm run account:bind -- --player "Molo" --email … --role admin`, потім `curl -X POST /api/auth/login` → токен. `curl /api/me` без токена → 401. `curl /api/admin/cards` з player-токеном → 403. `python card-forge/forge.py ingest` з `FORGE_SERVICE_TOKEN` → 200, без нього → 403.
3. **Дані цілі:** `SELECT count(*) FROM player_cards WHERE player_id=<molo>` і `SELECT count(*) FROM transactions` дають ті самі числа, що до міграцій. Порівняти з бекапом.
4. **Крок 3:** відкрити кейси до 25 унікальних → тост мілстоуна, `SELECT * FROM player_milestones` має рівно один рядок на ключ, `SELECT sum(delta_coins) FROM transactions WHERE player_id=… ` дорівнює `balance_coins`.
5. **Тригер живий:** `UPDATE players SET balance_coins = balance_coins + 1 WHERE id=…` → відхилено на COMMIT.

```bash
npm run test -w game-api && npm run test:e2e -w game-api && npm run test -w game-ui && npm run build
```

E2E ганяються проти `cardgame_test` (`game-api/test/env.setup.ts`), не проти живої БД — це вже налаштовано, і жоден крок вище цього не змінює.

---

## Від чого я відмовляюсь і чому

- **OAuth** — локальна гра з одним оператором; реєстрація застосунку в провайдера й інтернет-залежність на вході заради того, щоб не зберігати один хеш.
- **`@nestjs/passport`** — абстракція стратегій, інстанційована рівно один раз.
- **Окрема таблиця `accounts`** — або join на кожен запит, або перепризначення FK на живих даних.
- **Підняття `sellValue` заради рампи** — множить майже-нуль на старті й вибиває EV за ціну кейса в кінці.
- **Відсоткові пороги мілстоунів** — генерація нових карток ретроактивно знімала б їх.
- **Backfill мілстоунів міграцією** — ліниве наздоганяння покриває це, а міграції не мають бути письменниками ledger.
- **Перенацілення `POOL_TARGET_TOTAL` на 432** — знову протухне, знову тихо.