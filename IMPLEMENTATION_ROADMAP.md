# SpokesBot Implementation Roadmap

## Goal

Ship a usable first version of SpokesBot that lets an authenticated organization member:

1. sign in,
2. upload a CSV,
3. see dataset processing status,
4. open a chat thread tied to a dataset,
5. ask questions and view saved message history.

This roadmap is based on the current repo state as of April 1, 2026.

## Current State Summary

- Backend has one authenticated CSV upload endpoint.
- Supabase schema defines organizations, datasets, threads, and messages.
- Frontend is mostly scaffolded and does not yet implement the product workflow.
- Admin-only behavior, ingestion status tracking, and chat APIs are not implemented yet.

## MVP Cut Line

For MVP, avoid trying to ship a full analytics dashboard. The smallest coherent product is:

- email/password auth with org membership,
- admin upload of CSV files,
- dataset list and processing state,
- one dataset-selected chat experience,
- persistent threads and messages,
- basic event logging.

Anything beyond that should be Phase 2 or later.

## Phase 1: Foundation And Tenant Setup

### Outcome

Users can authenticate, belong to an organization, and access protected app routes safely.

### Backend

- Finalize environment configuration for Supabase URL, anon key, and frontend origin.
- Add startup/config validation so placeholder env values fail fast.
- Add auth helper utilities for:
  - current user ID,
  - current organization ID,
  - current role in organization.
- Enforce role checks for admin-only actions.
- Add health endpoint and a versioned API prefix if desired.

### Database

- Add RLS policies for `organizations` and `user_organizations`.
- Add helper SQL functions such as:
  - `get_my_org_id()`
  - `get_my_role()`
  - optionally `is_org_admin()`
- Define how the first organization admin is created.
- Add migration discipline:
  - numbered SQL files,
  - seed script or bootstrap SQL for local development.

### Frontend

- Add Supabase auth client setup.
- Replace placeholder login page with working sign-in flow.
- Add protected route handling.
- Add an app shell for authenticated pages.

### Exit Criteria

- A user can sign in.
- The app knows the user’s org and role.
- Admin-only endpoints reject non-admin members.

## Phase 2: Dataset Ingestion MVP

### Outcome

An admin can upload a CSV and everyone in the org can see the dataset and its status.

### Backend

- Expand dataset model to include ingestion lifecycle fields:
  - `status` (`queued`, `processing`, `ready`, `failed`)
  - `error_message`
  - `file_size`
  - optional `content_type`
- Add endpoints for:
  - create upload job,
  - list datasets,
  - get dataset by ID,
  - delete/archive dataset.
- Update upload flow to persist status before processing starts.
- Persist failures instead of only printing errors.
- Validate:
  - CSV parse failures,
  - empty files,
  - oversized files,
  - duplicate uploads policy.

### Architecture Note

The current `BackgroundTasks` approach is acceptable only for a quick local prototype. Before production or team testing, move ingestion to a durable async job model using one of:

- Supabase Edge Function triggered after upload,
- a queue/worker process,
- a dedicated background worker service.

### Frontend

- Build dataset list screen.
- Build upload UI with progress and post-upload state.
- Build dataset detail/status view.

### Exit Criteria

- Admin uploads work end-to-end.
- Status is visible and survives server restarts.
- Failed ingestions are visible to the user.

## Phase 3: Chat MVP

### Outcome

Users can start a conversation against a dataset and see persistent thread history.

### Backend

- Add endpoints for:
  - create thread,
  - list threads for a dataset,
  - get messages for a thread,
  - send message,
  - stream or return assistant response.
- Persist both user and assistant messages.
- Log dataset/thread ownership checks.
- Define the first non-AI fallback response path if the agent is not ready yet.

### Agent Layer

- Decide the minimal answer engine for MVP:
  - simple stubbed assistant for wiring,
  - dataset-aware query layer,
  - LangGraph-based agent.
- Define dataset access contract:
  - how parquet is loaded,
  - how column metadata is used,
  - what limits apply to large datasets.

### Frontend

- Build chat workspace route tied to selected dataset.
- Add thread list and message pane.
- Handle loading, streaming, and retry states.

### Exit Criteria

- A user can create a thread and send a message.
- Messages are persisted and reload correctly.
- Dataset access is scoped to the user’s org.

## Phase 4: Hardening

### Outcome

The MVP is safe enough to demo and iterate on without constant manual recovery.

### Must-Haves

- Add structured logging.
- Add API error normalization.
- Add backend tests for:
  - auth enforcement,
  - role checks,
  - dataset status transitions,
  - thread/message permissions.
- Add frontend smoke coverage for:
  - login,
  - protected routes,
  - upload flow,
  - chat flow.
- Add rate limits or basic abuse controls.
- Add file size limits and request timeouts.
- Lock down CORS and storage policies.

### Exit Criteria

- Core flows are covered by automated tests.
- Permissions failures are predictable and visible.
- Demo environment can be reset reliably.

## Phase 5: Product Expansion

Only start this after Phases 1 through 4 are stable.

### Candidates

- analytics dashboard and charting,
- richer org admin tools,
- invite flow,
- dataset versioning,
- saved prompts,
- export/share,
- observability dashboards,
- billing and usage controls.

## Recommended Build Order In This Repo

1. Finish auth and org-role enforcement.
2. Add durable dataset status model and dataset APIs.
3. Build authenticated frontend shell and dataset pages.
4. Implement thread/message APIs.
5. Build chat UI.
6. Add tests and deployment hardening.

## Immediate Next Tasks

These are the highest-leverage next implementation tasks:

1. Update `backend/supabase/schema.sql` with role helper functions, missing RLS policies, and dataset status fields.
2. Refactor `backend/app/routers/upload.py` so uploads persist `queued` and `failed` states.
3. Add dataset listing and dataset detail endpoints in the backend.
4. Replace `frontend/src/app/login/page.tsx` with real Supabase auth wiring.
5. Replace `frontend/src/app/page.tsx` with an authenticated app entry that routes into dataset workflows.

## Risks To Watch

- Relying on in-process background tasks for ingestion.
- Assuming auth is sufficient without role checks.
- Building dashboard visuals before the dataset and chat loop exists.
- Skipping migration/versioning discipline while changing the schema quickly.
- Deferring test coverage too long on multi-tenant permission logic.

## Suggested Definition Of Done For V1

SpokesBot V1 is done when:

- org members can sign in,
- admins can upload CSVs,
- datasets show real ingestion status,
- users can open dataset-linked threads,
- users can send prompts and receive saved responses,
- basic permission, upload, and chat flows are tested.
