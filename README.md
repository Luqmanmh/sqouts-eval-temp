# eval-bot-fastapi

The Eval Bot web platform on a **FastAPI** backend. It is an automated caller
for testing voice AIs, mainly Sqouts. It joins a call like a real person would,
holds the conversation with an LLM-driven persona, records both sides, and then
has an LLM judge score how well the **AI under test** played its role.

```
test case ──► worker joins the call over WebRTC
                AI speaks ──► tester's LLM writes a reply ──► TTS speaks it
                … repeat until the call ends …
              ──► recording + transcript + event log ──► LLM judge ──► run result
```

The tester plays the **human side** of the call (the trainee, candidate or
respondent). What gets evaluated is the **AI under test**, not the tester.

This is the FastAPI rewrite of the Django backend in `../eval-bot`. Both serve
the same API, so the frontend here is a copy of `../eval-bot/eval_platform_fe`.
See [Relation to the Django project](#relation-to-the-django-project).

| Part | Folder | What it does |
|---|---|---|
| Backend | `eval_platform_be/` | FastAPI + SQLAlchemy + Alembic API, the call runner (`app/scripts/call_ai.py`) and the judge (`app/scripts/evaluate.py`) |
| Worker | `eval_platform_be/app/worker.py` | Celery. Runs each call and its evaluation in the background |
| Frontend | `eval_platform_fe/` | React + Vite console for scenarios, test cases, runs and users |

## Requirements

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/)
- Docker Desktop, for Postgres and Redis
- GNU Make. On Windows: `winget install ezwinports.make`, and run it from Git
  Bash or PowerShell
- An Anthropic API key and a Cartesia API key. Every run spends credits on both
- For Sqouts runs: a running Sqouts stack reachable through its gateway
  (default `http://localhost:8010`) and a published agent with an
  **open / walk-in share link**

## Quick start

```bash
make setup     # copy .env files, install deps, start the db, migrate, seed
```

Then fill in the API keys in `eval_platform_be/.env` (see
[Environment](#environment)) and create your first account:

```bash
make user role=superuser
```

`make setup` runs the seeder before that account exists, so seed again once it
does:

```bash
make seed
```

Start everything:

```bash
make dev
```

| Service | URL |
|---|---|
| Web console | http://localhost:3000 |
| API | http://localhost:4000/api/eval-bot/ |
| Postgres | `localhost:5436` (user `postgres`, password `password`, db `eval_bot`) |
| Redis | `localhost:6380` |

The ports avoid a local Postgres on 5432 and Sqouts' own services (5435, 6379).

## Make targets

Run `make help` for the same list.

| Target | What it does |
|---|---|
| `make setup` | First-time setup: `env` + `install` + `db` + `migrate` + `seed` |
| `make env` | Copy each `.env.example` to `.env`. Never overwrites an existing `.env` |
| `make install` | `uv sync` and `bun install` |
| `make db` | Start Postgres and Redis in Docker and wait until Postgres is healthy |
| `make db-stop` | Stop them. Data is kept |
| `make db-reset` | **Delete all data**, then start, migrate and seed again |
| `make migrate` | Apply Alembic migrations |
| `make seed` | Add a sample scenario and test case. `make seed u=<username>` picks the owner (default: the first user) |
| `make user` | Create an account. `role=superuser` or `role=admin`; a regular user without it |
| `make api` | The API on port 4000 (uvicorn, reloads on code changes) |
| `make worker` | Celery worker. `make worker c=2` sets how many runs go at once (default 5) |
| `make web` | Vite dev server on port 3000 |
| `make dev` | `api`, `worker` and `web` together. Ctrl+C stops all three |
| `make kill-worker` | Kill a Celery worker left running, e.g. after Ctrl+C on `make dev` |

## Environment

`make env` creates `eval_platform_be/.env` from `.env.example`. The database
and Redis values already match `docker-compose.yml`; fill in the rest:

| Variable | Needed for |
|---|---|
| `SECRET_KEY` | Signs the login tokens. Any long random string; see [below](#relation-to-the-django-project) to share logins with Django |
| `DEBUG` | `True` for local development (the cookie isn't `Secure` then) |
| `CORS` | The web console's origin, `http://localhost:3000` |
| `DB_*` | Postgres connection |
| `CELERY_BROKER_URL` | Redis, `redis://localhost:6380/0` |
| `MEDIA_ROOT` | Where run files go, relative to `eval_platform_be/` (default `files`) |
| `ANTHROPIC_API_KEY` | The tester's LLM and the judge |
| `CARTESIA_API_KEY` | The tester's voice |
| `ELEVENLABS_API_KEY` | Only if you switch the voice back to ElevenLabs |

`eval_platform_fe/.env` has one value, `VITE_API_URL`. It defaults to
`http://localhost:4000/api/eval-bot/` when unset.

Restart `make worker` after changing `.env` or any backend code; it doesn't
reload on its own. `make api` reloads on code changes but not on `.env` changes.

## Using the console

**Scenario → test case → run.**

1. **Scenario**: the AI under test.
   - **Sqouts**: a Sqouts gateway URL and share-link token.
   - **Pipecat**: any Pipecat bot on SmallWebRTC.
   - **Transcription**: no call. You upload a transcript and only the judge runs.

   The scenario also holds the **AI's role**, the standard the judge scores
   against.
2. **Test case**: the tester's side. Its persona (`bot_char`), language,
   voice, join name and email, metrics, pass threshold, and whether the
   **tester speaks first**.
3. **Run**: one call of a test case. Starting a run queues it for the worker.
   Its status goes `PREPARING` → `RUNNING` → `DONE`, or `ABORTED` if it fails.
   A finished run has the judge's result, the transcript, the recording, the
   token usage and an **Events** tab showing the call's timeline.

Deleting a scenario deletes its test cases and their runs, including the
recording and log files on disk.

### Getting the Sqouts token

Publish the agent in Sqouts with the *Open / walk-in link* option and copy the
share link. The token is the last part of the URL:

```
http://localhost:9010/s/6JQ7N-om_cGNmbw6bsYOgA
                        └──── the token ─────┘
```

### The two prompts

| Field | Describes | Used by | What to put in it |
|---|---|---|---|
| Test case persona (`bot_char`) | The **tester**: the human side of the call | The tester's LLM, to decide what to say | Who the tester is, what it should try to do, and what it knows |
| Scenario AI role (`ai_role`) | The **AI under test** | The judge, as the standard to score against | The agent's *Character* and *Situation*, exactly as entered in the Sqouts wizard |

### Users and roles

| Role | Can |
|---|---|
| User | Manage their own scenarios, test cases, runs and metrics |
| Admin (`is_staff`) | The above, plus the user manager: add users, reset passwords, activate or deactivate, delete non-admin users |
| Superuser | The above, plus grant or remove admin |

The first superuser comes from `make user role=superuser`. Everyone else is
added from the user manager.

## Running several tests at once

The worker runs up to `c` runs in parallel (default 5), one thread each. Every
run is a live call plus TTS and LLM requests, so rate limits usually come
before CPU (Cartesia's concurrency cap, Sqouts' sessions, your machine's audio
processing). Start with `make worker c=2` and raise it once the results look
the same as single runs.

Celery's default `prefork` pool doesn't work on Windows, which is why the
worker uses `-P threads`.

## Where files go

Run files are stored under `MEDIA_ROOT` and served by the API:

| Folder | Contents |
|---|---|
| `recording/` | The whole call (served as MP3). Left = tester, right = AI |
| `transcript/` | The conversation as the AI saw it |
| `plain/` | What the tester actually said |
| `events_log/` | Timestamped event log. `pts / 48000` is the position in the recording |
| `eval_res/` | The judge's result |

## Migrations

Alembic manages the schema. The first revision (`0001`) describes the schema
as the Django project left it:

- **On a database Django already created** it changes nothing and only records
  the revision (in an `alembic_version` table).
- **On an empty database** it creates the tables and the six built-in metrics.

After a model change in `app/models.py`:

```bash
cd eval_platform_be
uv run alembic revision --autogenerate -m "what changed"
# read the generated file in alembic/versions/, then:
uv run alembic upgrade head
```

`uv run alembic check` reports whether the database and the models differ.

## Layout

| Path | What it holds |
|---|---|
| `app/main.py` | The FastAPI app, CORS, and the routers under `/api/eval-bot/` |
| `app/routers/` | One file per area: `auth`, `users`, `scenarios`, `testcases`, `runs`, `metrics`, `calls` |
| `app/models.py` | SQLAlchemy models |
| `app/security.py` | Password hashing, JWT cookies, and the logged-in-user / admin checks |
| `app/deletion.py` | Cascading deletes, including run files (the database has no `ON DELETE CASCADE`) |
| `app/worker.py` | Celery app and the two tasks |
| `app/scripts/` | The call runner, tester, judge and TTS |
| `app/seed.py`, `app/create_user.py` | `make seed` and `make user` |

## Relation to the Django project

`../eval-bot` has the original Django backend. The two projects share one
database on purpose, so you can switch between them:

- **Same containers.** `docker-compose.yml` uses the project name `eval-bot`
  in both folders, so `make db` in either one starts the same `eval-bot-db`
  and `eval-bot-redis`, with the same data.
- **Same tables.** The models map onto the `api_*` tables Django created,
  with Django's column, index and foreign-key names.
- **Same passwords.** It reads and writes Django's `bcrypt_sha256` hashes, and
  also accepts the older `pbkdf2_sha256` ones.
- **Same logins.** Its JWTs have the same format as SimpleJWT's. With the same
  `SECRET_KEY` as `../eval-bot/eval_platform_be/.env`, a session started on one
  backend works on the other.
- **Separate Celery queue.** This worker listens on `eval_api`, Django's on
  `celery`. A run started from this API only runs if **this** worker is up.
- **Run files.** To see runs recorded by the Django backend, set
  `MEDIA_ROOT=../../eval-bot/eval_platform_be/files`.
- **Same port.** Both APIs use 4000, so run one at a time.

Keep schema changes on one side. Django's `makemigrations` and Alembic don't
know about each other, so changing the tables from both makes them drift.

Differences from the Django backend:

- **Test case ownership.** A test case can only be created in your own
  scenario, and only with built-in metrics or your own.
- **Bad run ids** return 404 instead of a server error.
- **Uploaded transcripts.** Rows without `plain` or `timestamp` are accepted.
- **`last_login`** is updated when a user logs in.
- **Timestamps** are sent in UTC (`…Z`) instead of UTC-7.
- **New endpoint.** `GET auth/me` returns the logged-in profile.
- **No Django admin site.**

## Troubleshooting

| What you see | Likely cause |
|---|---|
| A run stays `PREPARING` | This project's worker isn't running (a Django worker doesn't count). Start it with `make worker` |
| Runs start one at a time | The worker was started with `-P solo` or `c=1` |
| A run stays `RUNNING` after the call ended | The worker is stuck closing the connection. `make kill-worker`, then `make worker` |
| `401` from Anthropic or Cartesia | Missing or wrong key in `eval_platform_be/.env` |
| Logged out when switching from the Django API | Different `SECRET_KEY` in the two `.env` files |
| `make api` fails with "address already in use" | The Django API is still running on port 4000 |
| `make db` fails on a port | Another Postgres or Redis already uses 5436 or 6380 |
