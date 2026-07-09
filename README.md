# BHCC Hospital Management

BHCC is a full-stack hospital-management website built with Next.js, Django REST Framework, and PostgreSQL. This repository contains everything needed to run the website on Windows, macOS, Linux, or a server.

## Quick Start (Recommended)

Install [Git](https://git-scm.com/) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose), then run:

```bash
git clone https://github.com/Tharun-100/BHCC.git
cd BHCC
cp .env.docker.example .env.docker
```

Edit `.env.docker` and replace at least `POSTGRES_PASSWORD` and `DJANGO_SECRET_KEY`. For a remote server, also replace `localhost` in the host/origin settings with its domain name or IP address. Then start the complete stack:

```bash
docker compose --env-file .env.docker up --build -d
```

Open `http://localhost:3000`, or `http://SERVER_IP:3000` when installed on a server. Database migrations run automatically. PostgreSQL data is retained in a Docker volume across restarts.

Create the first administrator:

```bash
docker compose --env-file .env.docker exec backend python manage.py create_account --role ADMIN --name "BHCC Admin" --email admin@example.com
```

Useful lifecycle commands:

```bash
docker compose --env-file .env.docker logs -f
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker down
```

Do not use `down -v` unless you intentionally want to delete the PostgreSQL data.

## Repository Layout

```text
BHCC/
├── backend/              Django API, models, migrations, and admin commands
├── frontend/             Next.js website
├── compose.yaml          Complete web/API/database runtime
├── .env.docker.example   Safe configuration template
└── requirements.txt      Python dependency entry point
```

The browser calls `/api` on the same host as the website. Next.js proxies those requests to Django, so the Docker setup works from any hostname without rebuilding the frontend.

## Dependency Files

- `BHCC/requirements.txt` installs every Python/backend dependency.
- `BHCC/backend/requirements.txt` is the detailed Django dependency list.
- `BHCC/frontend/package.json` and `package-lock.json` install every Node/frontend dependency.

Python `requirements.txt` cannot install Node packages. On a server, run both `pip install` and `npm ci` as shown below.

## PostgreSQL

Create the database and user:

```sql
CREATE DATABASE bhcc;
CREATE USER bhcc_user WITH PASSWORD 'change_this_password';
GRANT ALL PRIVILEGES ON DATABASE bhcc TO bhcc_user;
```

Create `BHCC/backend/.env` from `.env.example` and set:

```env
POSTGRES_DB_HOST=localhost
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=bhcc
POSTGRES_DB_USER=bhcc_user
POSTGRES_DB_PASSWORD=change_this_password
POSTGRES_DB_SSLMODE=prefer
```

## Local Development

### Backend

```powershell
cd BHCC
python -m venv backend\.venv
.\backend\.venv\Scripts\activate
pip install -r requirements.txt
cd backend
PowerShell -ExecutionPolicy Bypass -File .\setup-postgres.ps1
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

The PostgreSQL setup script prompts for the local `postgres` administrator password, creates the `bhcc` database and `bhcc_user`, writes `backend/.env`, and applies migrations. The generated application password is stored only in the ignored local environment file.

If the PostgreSQL administrator password was never recorded or has been forgotten, open PowerShell as Administrator and run `PowerShell -ExecutionPolicy Bypass -File .\reset-postgres-password.ps1`. It resets the local password, restores password authentication, and completes the normal BHCC database setup.

### Account Creation

Patients can register from the public Login / Register page. Create the first staff accounts from `BHCC/backend` after running migrations:

```powershell
python manage.py create_account --role ADMIN --name "BHCC Admin" --email admin@example.com
python manage.py create_account --role COUNTER --name "Front Counter" --email counter@example.com
```

The command securely prompts for the password. After the administrator signs in through Staff Access, doctors can be created from Dashboard > Doctors. A doctor can also be created from the command line:

```powershell
python manage.py create_account --role DOCTOR --name "Doctor Name" --email doctor@example.com --department "Cardiology" --specialty "Cardiologist" --experience "10 Years" --fee 1000 --available-days "Monday,Wednesday,Friday"
```

Supported roles are `PATIENT`, `DOCTOR`, `ADMIN`, and `COUNTER`. Staff members sign in through `/stafflogin`; patients use `/login`.

### Frontend

```powershell
cd BHCC\frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

## Manual Server Deployment

### Backend (Linux)

```bash
cd BHCC
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cd backend
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn bhcc.wsgi:application --bind 0.0.0.0:8000
```

### Frontend

```bash
cd BHCC/frontend
npm ci
npm run lint
npm run build
npm run start
```

Set `BACKEND_INTERNAL_URL=http://127.0.0.1:8000` before `npm run build` when Django is on the same server. The frontend requires Node.js and npm. Keep `package-lock.json` committed so `npm ci` installs the exact tested versions.

## Production Checklist

- Use long random values for `POSTGRES_PASSWORD` and `DJANGO_SECRET_KEY`.
- Set `DJANGO_ALLOWED_HOSTS` to the public domain or IP.
- Set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to the full public URL, including `https://`.
- Put a TLS reverse proxy such as Caddy or Nginx in front of port 3000.
- Configure Razorpay and SendGrid only through environment variables; never commit live secrets.
- Back up the `postgres_data` volume regularly.

## Verification

Before publishing changes:

```bash
cd frontend
npm ci
npm run lint
npm run build

cd ../backend
python manage.py check
python manage.py test
```

## Offline Assets

Normal pages use local Tailwind CSS, system fonts, local clinic images, and local doctor initials. The local Django API works without public internet. Razorpay checkout still requires internet access because it is an external payment service.
