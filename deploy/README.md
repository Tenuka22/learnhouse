# Self-hosting LearnHouse

Everything here used to live in a separate `learnhouse-community-edition`
repo. It's been merged in: same source builds the image, one place to find
both.

Three compose stacks, pick one:

| File | Use case |
|---|---|
| `docker-compose.yml` | Default: app + external nginx reverse proxy + db + redis |
| `docker-compose.production.yml` | Production, no bundled nginx (put your own TLS proxy in front) |
| `docker-compose.aloysius.yml` | Single-host pgvector-backed stack (Aloysius College) |

All three pull the prebuilt image (`tenuka22/learnhouse-lk:latest`), they
don't build from source. To build locally instead, see `../Dockerfile` and
`../DEMO_STACK.md`.

## 🚀 Quick start (`docker-compose.yml`)

```bash
cd deploy
cp env.example .env
vi .env   # set admin credentials, domain, secrets — see below
docker compose -f docker-compose.yml up -d
```

- Frontend: http://localhost
- First login: `LEARNHOUSE_INITIAL_ADMIN_EMAIL` / `LEARNHOUSE_INITIAL_ADMIN_PASSWORD`
  from `.env` (defaults to `admin@school.dev` / randomly generated if unset).
  **Change the password after first login.**

### Prerequisites

- Docker Engine 20.10+, Docker Compose 2.0+
- 2GB+ RAM, 10GB+ disk
- A domain name (optional for local dev; use `localhost`)

## 🏗️ Architecture

- **learnhouse-app**: combined Next.js + FastAPI + Hocuspocus collab, with
  its own internal nginx on port 80 routing `/api/v1` and `/collab`
  same-origin.
- **nginx** (`docker-compose.yml` only): external reverse proxy, port 80.
  Config: `extra/nginx.prod.conf`.
- **db**: `pgvector/pgvector:pg16` — must be a pgvector build, plain
  `postgres:16-alpine` has no `vector` extension and LearnHouse aborts on
  `CREATE EXTENSION vector`.
- **redis**: session/cache + collab pub-sub.

## 🔧 Environment variables

`env_file` loads everything from `.env` (or `.env.production` for the
production/aloysius stacks) — nothing is inlined in the compose files.

### Required

```bash
# Initial admin (first-run only)
LEARNHOUSE_INITIAL_ADMIN_EMAIL=admin@school.dev
LEARNHOUSE_INITIAL_ADMIN_PASSWORD=your-secure-password-here

# Domain
LEARNHOUSE_DOMAIN=localhost
NEXT_PUBLIC_LEARNHOUSE_DOMAIN=localhost
NEXT_PUBLIC_LEARNHOUSE_TOP_DOMAIN=localhost

# API URLs
NEXT_PUBLIC_LEARNHOUSE_API_URL=http://localhost/api/v1/
NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL=http://localhost/
NEXTAUTH_URL=http://localhost

# Secrets (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-random-secret-here
LEARNHOUSE_AUTH_JWT_SECRET_KEY=your-random-secret-here

# Database / Redis
LEARNHOUSE_SQL_CONNECTION_STRING=postgresql://learnhouse:your-password@db:5432/learnhouse
POSTGRES_PASSWORD=your-secure-password
LEARNHOUSE_REDIS_CONNECTION_STRING=redis://redis:6379/learnhouse
```

See `env.example` / `.env.production.example` for the full list (AI
features, email via Resend, S3/R2 storage, cookie-domain tenancy flags).

### Multi-tenant cookie domain

`LEARNHOUSE_COOKIE_DOMAIN` only applies when `LEARNHOUSE_TENANCY` is set to
something other than `single` — in single-tenant mode cookies are
host-only and the variable is ignored (you'll see a startup warning if it's
set anyway). Setting it to a broad parent (`.yourdomain.com`) shares the
session cookie across every subdomain — only do this intentionally, and set
`LEARNHOUSE_COOKIE_DOMAIN_ALLOW_BROAD=true` to silence the warning.

## ✅ Production checklist

- [ ] Set `LEARNHOUSE_INITIAL_ADMIN_EMAIL` / `LEARNHOUSE_INITIAL_ADMIN_PASSWORD`
- [ ] Change all default passwords/secrets
- [ ] `LEARNHOUSE_DEVELOPMENT_MODE=false`
- [ ] `NEXT_PUBLIC_LEARNHOUSE_HTTPS=true`
- [ ] Proper domain names, email service, backups, monitoring

## 💾 Data persistence

Named volumes per stack (see each compose file's `volumes:` section) cover
Postgres data, Redis data, and uploaded course content
(`/app/api/content` — without this volume every uploaded file/transcode is
lost on container recreate).

```bash
# Backup
docker run --rm -v <volume>:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz /data
# Restore
docker run --rm -v <volume>:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /
```

## 🔄 Updating

```bash
git pull
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

## 📊 Monitoring

```bash
docker compose -f docker-compose.yml logs -f [service]
docker compose -f docker-compose.yml ps
```

Health checks: app → `http://localhost/api/v1/health`, db → `pg_isready`,
redis → `redis-cli ping`.

## 🔍 Troubleshooting

- **Won't start**: check logs, verify `.env`, confirm port 80/443 free.
- **DB connection errors**: verify `LEARNHOUSE_SQL_CONNECTION_STRING`,
  confirm `db` is healthy before the app starts (`depends_on: condition:
  service_healthy` handles ordering already).
- **Port conflict**: edit the `ports:` mapping, e.g. `"8080:80"`.
- **Custom nginx**: edit `extra/nginx.prod.conf`, then
  `docker compose -f docker-compose.yml restart nginx`.

## 🔒 Security

1. Never commit `.env`/`.env.production` — gitignored, keep it that way.
2. Strong, unique secrets per deployment.
3. Keep images updated.
4. Only expose the ports you need.
5. Regular backups + log review.
