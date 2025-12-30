# Deployment & Configuration

## Backend (.env)
Use these values locally; override with production values when deploying.

```
# Local
NODE_ENV=development
PORT=4000
BACKEND_URL=http://localhost:4000
API_BASE_URL=http://localhost:4000/api
FRONTEND_URL=http://localhost:5173    # or 8080
ADMIN_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:8080,http://localhost:4000
CORS_ALLOW_SUBDOMAINS=true

DB_HOST=localhost
DB_PORT=3306
DB_NAME=simplyfi
DB_USER=root
DB_PASSWORD=
JWT_SECRET=change-me-for-dev
```

Production (api.simplyai.it / simplyai.it):
```
NODE_ENV=production
PORT=4000
BACKEND_URL=https://api.simplyai.it
API_BASE_URL=https://api.simplyai.it/api
FRONTEND_URL=https://simplyai.it
ADMIN_URL=https://admin.simplyai.it
CORS_ORIGINS=https://simplyai.it,https://admin.simplyai.it,https://api.simplyai.it
CORS_ALLOW_SUBDOMAINS=true
DB_HOST=...
DB_PORT=3306
DB_NAME=simplyfi
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=strong-secret
```

## Frontend (.env)
```
# Local
VITE_API_BASE_URL=http://localhost:4000/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here

# Production
# VITE_API_BASE_URL=https://api.simplyai.it/api
# VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

## CORS and Auth
- Origins must match exactly (no trailing slashes). Keep `CORS_ALLOW_SUBDOMAINS=true` so subdomains are accepted.
- If you use cookies, set `SameSite=None; Secure` and domain `.simplyai.it` on HTTPS. Otherwise use Authorization: Bearer headers.

## Health checks
- `/api/health` should return 200.
- `/api/auth/me` should return 200 with a valid token after login.
