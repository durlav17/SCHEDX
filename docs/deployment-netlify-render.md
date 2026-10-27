# Deploying SchedX: Netlify (frontend) + Render (backend)

SchedX — developed by Durlav Dani (24BCE2361) and Nathan Laji Joseph (24BDS0332); Faculty Mentor Dr Arthi M.

This guide prepares a **public demo**. The repository is ready; the two hosted services still have to be created in the Netlify and Render dashboards by you. Nothing here claims a live deployment.

```
Browser ──> https://<site>.netlify.app      (static React build, frontend/dist)
   │
   └──────> https://<api>.onrender.com/api  (FastAPI + SQLite, backend/)
```

**The deployed demo is public and unauthenticated.** Anyone with the URL can run simulations and can save, rename and delete experiments. There are no accounts and no secrets in the frontend. Do not store anything private in it.

## 1. Prerequisites
* A GitHub account and this repository pushed to GitHub (`https://github.com/durlav17/SCHEDX`).
* A Render account and a Netlify account (free plans work for a demo).
* Locally (optional, to check before you push): Python 3.12, Node.js 22, and the project set up with `.\scripts\setup.ps1`.

## 2. Push the deployment changes to GitHub safely
```powershell
git status                      # review: no .env, *.db or node_modules should appear
git add netlify.toml render.yaml docs README.md IMPLEMENTATION_STATUS.md backend frontend
git status --short              # check once more what is staged
git commit -m "Prepare Netlify + Render deployment"
git push origin HEAD
```
`.gitignore` already excludes `.env*` (except `.env.example`), `*.db`, `backend/data/`, `node_modules/` and `frontend/dist/`. No history is rewritten: use a normal push, never `--force`.

## 3. Backend on Render
Easiest: **New > Blueprint**, pick the repository; Render reads [render.yaml](../render.yaml). Or **New > Web Service** and enter:

| Setting | Value |
|---|---|
| Runtime | Python 3 |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |
| Instance type | Free (or any paid type) |

`$PORT` is assigned by Render; the app binds to it and nothing is hardcoded. The Python version is pinned with `PYTHON_VERSION=3.12.10` (a released version; the backend test suite passes on exactly this version, 363 tests). Another version is untested here. If you create the service by hand, add `PYTHON_VERSION` yourself.

When the service is live, note its URL, e.g. `https://schedx-api.onrender.com`.

## 4. Frontend on Netlify
**Add new site > Import an existing project**, pick the repository. Settings come from [netlify.toml](../netlify.toml); if the form asks, enter:

| Setting | Value |
|---|---|
| Base directory | *(empty, repository root)* |
| Build command | `npm ci --prefix frontend && npm run build --prefix frontend` |
| Publish directory | `frontend/dist` |
| Node version | 22 (set in `netlify.toml`) |

Then **Site configuration > Environment variables**: add `VITE_API_BASE_URL` = the Render URL from step 3 (`https://schedx-api.onrender.com`; `/api` is added by the app exactly once, and a trailing slash or `/api` in the value is tolerated). Variables starting with `VITE_` are compiled into the public JavaScript: never put a secret in one. Trigger a new deploy after changing it, because it is read at build time.

The `netlify.toml` redirect `/* -> /index.html (200)` makes direct visits to `/lab`, `/compare`, ... work. It is not forced, so real files (assets, `/research/*.json`) are still served as files. There is no `/api` rule: the browser calls the backend directly.

## 5. Environment variables
| Where | Name | Value | Required |
|---|---|---|---|
| Netlify | `VITE_API_BASE_URL` | `https://<your-api>.onrender.com` | yes (empty means relative `/api`, only right for local development) |
| Render | `SCHEDX_CORS_ORIGINS` | `https://<your-site>.netlify.app` (comma-separate several) | yes |
| Render | `PYTHON_VERSION` | `3.12.10` | set by `render.yaml` |
| Render | `SCHEDX_DB` | e.g. `/var/data/schedx.db` | only with a persistent disk (section 8) |

## 6. Configure CORS after you have the Netlify URL
1. Copy the exact Netlify address, e.g. `https://sparkly-name-123.netlify.app` (scheme + host; no path).
2. Render > your service > **Environment** > `SCHEDX_CORS_ORIGINS` > paste it > Save (Render restarts the service).
3. For a **custom domain** later, add it to the same variable, comma-separated: `https://sparkly-name-123.netlify.app,https://schedx.example.edu`.
4. `localhost:5173` and `127.0.0.1:5173` are always allowed for development. Wildcards (`*`, `https://*.netlify.app`) and malformed entries are rejected with a warning in the Render log, so a typo can never open the API to every site. A Netlify deploy-preview URL (`deploy-preview-N--site.netlify.app`) is a different origin and must be listed explicitly if you want to use it.

## 7. Verify health and API connectivity
```powershell
curl https://<api>.onrender.com/api/health        # {"status":"ok","service":"schedx",...}
curl https://<api>.onrender.com/api/algorithms    # 7 algorithms
# CORS preflight as the browser sends it (expect HTTP 200 and access-control-allow-origin = your site):
curl -i -X OPTIONS https://<api>.onrender.com/api/simulations/run -H "Origin: https://<site>.netlify.app" -H "Access-Control-Request-Method: POST"
```
Then open the Netlify site: the sidebar should say **Engine online**. Run a simulation in the Lab, a comparison in the Arena, save an experiment and find it in Experiment Studio > History. Open `https://<site>.netlify.app/lab` directly and reload it to check the route fallback. Interactive API docs: `https://<api>.onrender.com/api/docs`.

**Free-plan cold start:** a free Render service sleeps after inactivity. The first request can take about a minute and the sidebar may briefly say *Engine offline*. Open the health URL once before a demonstration.

## 8. SQLite persistence: the honest version
* Render's default filesystem is **ephemeral**. Without a persistent disk, saved experiments live in `backend/data/schedx.db` inside the running instance and are **lost on every redeploy and restart, and on a free-plan sleep/wake cycle**. The app still starts safely: it creates the directory and an empty database. This is acceptable for a demo; do not promise users that saves persist.
* A persistent disk needs a **paid** instance type. Add a disk (Render > service > Disks, or uncomment the `disk:` block in `render.yaml`) with mount path `/var/data`, and set `SCHEDX_DB=/var/data/schedx.db`. Only then do saved experiments survive redeploys. A disk also limits the service to **one instance**, which suits SQLite.
* SQLite is accessed through one locked connection and is meant for a single backend instance. Never commit a database file (`.gitignore` blocks `*.db`).
* The research results on the Research page are static files in the frontend build and do not depend on the database.

## 9. Security and performance notes
* **CORS:** explicit allow-list from the environment; credentials are not enabled (no cookies are used).
* **Secrets:** none are required. The frontend only receives the public backend URL. Checked: no `.env`, `.db` or build output is tracked by Git.
* **Errors:** unexpected exceptions are logged with their stack trace in the Render log and answered with a generic `internal_error` message. A test confirms that no trace, path or secret reaches the response.
* **Request limits (enforced by the engine):** at most 100 processes, burst length 1000, arrival time 10,000, simulation horizon 50,000 time units, a bounded number of configurations per comparison, and bounded sweep points and trials. There is no per-client rate limit, so on a public URL a determined visitor could keep a free instance busy. Add rate limiting or authentication before using it beyond a course demo.
* **Large responses:** the UI requests the lossless compact format (about 14 times smaller; a 100-process run is roughly 2 to 5 MB, 0.3 MB gzipped) and the server compresses responses. Server memory for the largest runs on a free 512 MB instance was not measured.
* No debug mode, no `--reload` in the production start command. The interactive docs `/api/docs` are public by design.

## 10. Diagnosing failures
| Symptom | Likely cause and fix |
|---|---|
| Console says *blocked by CORS policy*, or the sidebar says *Engine offline* while the API URL works in a new tab | The Netlify address is missing or mistyped in `SCHEDX_CORS_ORIGINS` (scheme `https`, exact subdomain, no path). Save, wait for the Render restart, hard-refresh. The Render log shows *Ignoring invalid SCHEDX_CORS_ORIGINS entry* if it was malformed. |
| Requests go to `/api/...` on the Netlify domain and return the home page or 404 | `VITE_API_BASE_URL` was not set **before** the build. Set it, then *Trigger deploy > Clear cache and deploy site*. |
| First request fails or hangs, later ones work | Free Render service waking up. Wait about a minute and retry. |
| Netlify build fails at `npm ci` (lockfile) | `frontend/package-lock.json` is out of date: run `npm install` in `frontend/` and commit the lockfile. |
| Netlify build fails with a TypeScript error | Run `npm run build` in `frontend/` locally and fix it first (the build runs `tsc -b`). |
| Render build fails in `pip install` | Read the build log. Confirm `PYTHON_VERSION=3.12.10` and that Root Directory is `backend` (so `requirements.txt` is found). |
| Render: `ModuleNotFoundError: app` | Root Directory is not `backend`, so `app.main` cannot be imported. |
| Render health check fails or the deploy times out | The start command must use `--host 0.0.0.0 --port $PORT`; health path is `/api/health`. |
| Saved experiments vanished | Expected without a persistent disk (section 8). |

## 11. Redeploy after a GitHub push
Both services deploy automatically from the connected branch on every push (Netlify builds the frontend, Render builds the backend). Changing `VITE_API_BASE_URL` needs a new Netlify deploy (it is read at build time). Changing a Render variable restarts the service automatically. Manual options: Netlify > Deploys > *Trigger deploy*; Render > *Manual Deploy*.

## What was tested in this repository
See "Deployment preparation" in [testing-and-validation.md](testing-and-validation.md). Everything was run locally; no Netlify or Render deployment was performed or probed.
