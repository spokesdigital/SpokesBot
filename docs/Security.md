# SpokesBot — Security & Secrets Management

## Secrets classification

| Secret | Where it lives | Who can see it |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Backend `.env` / hosting secrets | Backend process only — never in the client bundle |
| `SUPABASE_ANON_KEY` | Frontend `.env.local` (prefix `NEXT_PUBLIC_`) | Public — safe to ship in the JS bundle; Supabase RLS enforces access |
| `OPENAI_API_KEY` | Backend `.env` / hosting secrets | Backend process only |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend build args | Public |

**Rule:** Any key without the `NEXT_PUBLIC_` prefix must never be referenced in frontend code.

---

## Secrets management protocol

### Development
- Copy `backend/.env.example` → `backend/.env`
- Copy `frontend/.env.local.example` → `frontend/.env.local`
- Both files are in `.gitignore`. Confirm with `git status` before every commit.

### Staging / Production
Inject secrets as environment variables through your hosting provider — do not store filled-in `.env` files in the repository or Docker images.

Recommended tools per provider:

| Provider | Tool |
|---|---|
| Railway | Railway Variables tab |
| Render | Render Secret Files / Environment |
| Fly.io | `fly secrets set KEY=value` |
| AWS | AWS Secrets Manager + ECS task role |
| Vercel (frontend) | Vercel Environment Variables |

### Secret rotation
1. Generate the new value in the provider's dashboard.
2. Update the hosting provider's secret store.
3. Trigger a redeploy (rolling restart — no downtime).
4. Revoke the old value in Supabase / OpenAI dashboard.

---

## Supabase Row-Level Security (RLS)

Every table has RLS enabled. Two clients are used:

| Client | Key used | Purpose |
|---|---|---|
| User client (`get_supabase_client`) | Anon key + user JWT | All user-facing reads — RLS enforced |
| Service client (`get_service_client`) | Service role key | Background writes, agent message saves, event logging — bypasses RLS intentionally |

**Never** pass the service client into a path where user-supplied IDs could leak to another org. See `backend/app/dependencies.py` for the guard pattern.

---

## Transport security

- All production traffic must be HTTPS (enforce via hosting provider or reverse proxy).
- The `Strict-Transport-Security` header is set in `frontend/next.config.ts` with a 2-year max-age and preload.
- Backend CORS is locked to explicit origins — no wildcard (`*`).

---

## Auth token handling

- Supabase issues JWTs; the backend validates them on every request via `get_current_user_id()`.
- Tokens are stored in Supabase's SSR cookie helpers — they are `HttpOnly` and `SameSite=Lax` by default.
- The frontend never stores tokens in `localStorage`.

---

## Dependency scanning

Dependabot is configured in `.github/dependabot.yml`. Security advisories are automatically opened as PRs.

---

## Incident response

If a secret is suspected compromised:
1. Rotate immediately (see **Secret rotation** above).
2. Audit Supabase logs for unexpected queries.
3. Audit OpenAI usage dashboard for unexpected spend.
4. Open an internal incident ticket.
