# BHCC (Next.js + Django + PostgreSQL)

This folder is the migrated stack version of the legacy `BVC` app.

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

## Server Deployment

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
npm run build
npm run start
```

The frontend requires Node.js and npm on the server. Keep `package-lock.json` committed so `npm ci` installs the exact tested versions.

## Offline Assets

Normal pages use local Tailwind CSS, system fonts, local clinic images, and local doctor initials. The local Django API works without public internet. Razorpay checkout still requires internet access because it is an external payment service.
