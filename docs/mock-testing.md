# Mock Testing

Mock mode lets another developer run the course dashboard UI without Clerk, Supabase, Mux, or the
FastAPI backend.

## Start The Mock Dashboard

```powershell
cd course-access-portal/frontend
npm install
npm run dev:mock
```

Open the Vite URL shown in the terminal. It is usually:

```text
http://localhost:5173/#/login
```

`npm run dev:mock` starts Vite with `--mode mock`. The app treats that mode as mock auth even if
no local env file has been copied. The included `frontend/.env.mock` also sets:

```env
VITE_AUTH_MODE=mock
VITE_API_BASE_URL=
```

## Test Script

### Learner Flow

1. Choose `Free Learner`.
2. Open `Course 1`; it should be accessible.
3. Open `Course 2`; it should show the locked course/paywall state.
4. Go to `Settings`.
5. Redeem this mock code:

```text
COURSE-ACCESS-2026
```

6. Return to `Course 2`; it should now unlock.
7. Open a video or PDF resource.
8. Use `Mark complete`, then return to the dashboard and check saved progress.

### Admin Resource Flow

1. Click `Switch learner` in the lower-left account area.
2. Choose `Admin Preview`.
3. Open `Resource Manager` from the sidebar, or go directly to `#/admin/resources`.
4. Create a resource with these mock-friendly values:

```text
Title: Mock article
Type: article
Course: Course 1
Access: public
Topic: Admin Test
Content URL: https://example.com
Description: Created from the admin resource manager.
```

5. Confirm the new resource appears in the catalog list.
6. Open `Course 1` and confirm the resource appears on the course page.
7. Return to `Resource Manager`, click `Edit`, change the title or access value, and save.
8. Return to the course page and confirm the change is reflected.
9. Return to `Resource Manager`, click `Delete`, and confirm it disappears from the catalog and
   course page.

For a mock video, use this public MP4 as `Content URL`:

```text
https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4
```

For a mock PDF, use this public PDF as `Content URL`:

```text
https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf
```

## Switch Learner Personas

In mock mode, use the `Switch learner` button in the lower-left account area. This returns to the
persona picker without needing to clear browser storage.

Choosing another persona clears mock entitlement/progress query cache so each preview starts from a
clean persona state:

- `Free Learner`: public course only
- `Paid Learner`: all course content unlocked
- `Admin Preview`: all course content unlocked

## Production Auth Is Separate

Mock mode is only for local UI validation. To test real auth, use:

```powershell
npm run dev
```

Then configure:

```env
VITE_AUTH_MODE=clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```
