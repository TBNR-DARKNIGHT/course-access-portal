# Course Dashboard Template

This folder is a product-neutral extraction of the course dashboard logic from the current portal.
It is intentionally separate from the live Beyond Grades code, so it can be copied into another
product without changing the existing website.

## What Is Included

- A bare-bones course dashboard frontend in `frontend/`
- A minimal FastAPI backend reference in `backend/`
- A consolidated Supabase schema in `supabase/course_template_schema.sql`
- Documentation in `docs/` for the course framework, Clerk auth, and Supabase tables

The template keeps the course-viewing framework:

- Course dashboard and course sidebar
- Resource cards for videos, PDFs, articles, and modules
- Resource detail page
- Mux public and signed video playback
- Supabase public and paid PDF delivery
- Per-resource viewing progress
- Course-level progress summaries and reset
- Paywall checks by course entitlement
- Access-code redemption for paid courses
- Clerk-to-Supabase user synchronization pattern
- Admin resource manager for adding, editing, and deleting catalog rows

## Folder Map

```text
course-dashboard-template/
  frontend/                 React/Vite starter for the learner dashboard
  backend/                  FastAPI reference API for course data and access checks
  supabase/                 Consolidated SQL schema and RPCs
  docs/                     Implementation, Clerk, and Supabase setup notes
```

## Quick Start

Frontend mock test:

```powershell
cd course-dashboard-template/frontend
npm install
npm run dev:mock
```

Open the local Vite URL printed in the terminal, usually `http://localhost:5173/#/login`.
Mock mode does not require Clerk, Supabase, Mux, or the backend.

Backend:

```powershell
cd course-dashboard-template/backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy ..\.env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

For local UI review without Clerk or Supabase, set:

```env
VITE_AUTH_MODE=mock
VITE_API_BASE_URL=
```

Use the mock code `TEMPLATE-ACCESS-2026` on the Settings page to preview access-code redemption.
Choose `Admin Preview` in mock mode to test the resource manager at `#/admin/resources`.
See `docs/mock-testing.md` for the full click-through.

## Sending To Another Developer

This folder can be copied or zipped as a standalone template. The receiving developer should run
`npm install` inside `frontend/` before starting the mock dashboard.

Do not rely on a copied `frontend/node_modules/` or `frontend/dist/` folder. They are generated
locally and are ignored by the template's own `.gitignore`.

## Product Adaptation Checklist

1. Edit `frontend/src/config/product.ts` for product name, support email, and checkout URL.
2. Edit `frontend/src/config/courses.ts` for course IDs, titles, modules, and public courses.
3. Apply `supabase/course_template_schema.sql` to a new Supabase project.
4. Add PDFs to the `resources-public` or `resources-paid` storage buckets.
5. Add Mux playback IDs to `resources.mux_playback_id`.
6. Configure Clerk environment variables in both frontend and backend.
7. Point `VITE_API_BASE_URL` at the backend `/api/v1` base URL.
8. Promote admin users by setting `users.role = 'ADMIN'` in Supabase.

See `docs/` for the full setup guide.
