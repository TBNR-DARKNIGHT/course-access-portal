# Course Access Portal Framework

## Frontend Structure

The frontend is dashboard-first. There is no marketing/public page.

Key files:

- `frontend/src/App.tsx`: hash router, dashboard shell, course pages, settings, resource detail
- `frontend/src/config/courses.ts`: course IDs, labels, descriptions, and module structure
- `frontend/src/config/product.ts`: product name, checkout URL, support email, mock access code
- `frontend/src/hooks/use-resources.ts`: loads resource catalog
- `frontend/src/hooks/use-current-user.ts`: loads current account role for admin gates
- `frontend/src/hooks/use-entitlements.ts`: loads paid-course access and redeems codes
- `frontend/src/hooks/use-resource-progress.ts`: reads and writes saved viewing progress
- `frontend/src/components/AdminResourceManager.tsx`: admin add/edit/delete catalog manager
- `frontend/src/components/MuxVideoPlayer.tsx`: public/signed Mux playback plus MP4 fallback
- `frontend/src/components/PdfDocumentViewer.tsx`: PDF viewing and page-view progress

## Route Shape

The starter uses hash routes so it can run without a router generator:

- `#/dashboard`
- `#/course/:courseId`
- `#/course/:courseId/resources`
- `#/course/:courseId/videos`
- `#/course/:courseId/videos?module=module-1`
- `#/resource/:resourceId?from=videos&courseId=course-2&module=module-1`
- `#/admin/resources`
- `#/settings`
- `#/login`

If the product needs deep links without hashes, replace this with TanStack Router or React Router.
The course components are already grouped so the route adapter is the only piece that should need
major changes.

## Access Model

Each resource has:

- `courseId`: the course it belongs to
- `access`: `public` or `paid`
- `type`: `video`, `pdf`, `article`, or `module`
- optional `moduleId`

The UI checks `hasCourseAccess(courseId)` before showing paid delivery metadata. Locked cards point
to the checkout URL and the course page shows a redeem-code prompt. The backend repeats this check
before minting signed URLs or playback tokens.

## Viewing Progress

Progress is per user and per resource.

Videos:

- Save `lastPositionSeconds` and `durationSeconds` every 10 seconds while playing
- Mark complete when the learner reaches 90 percent watched
- Mark complete when playback ends
- Resume from `lastPositionSeconds` if the resource is not complete

PDFs:

- Track pages as they scroll into view
- Save `pagesViewed`, `pageCount`, and `progressPercent`
- Let the learner manually mark the PDF complete

Articles and module placeholders:

- Use the same manual complete/incomplete control
- Store progress in the same `resource_progress` table

Course progress is calculated in the frontend by counting completed resource IDs within a course.
The backend reset endpoint deletes all `resource_progress` rows for resources in that course.

## Paywall Flow

1. Frontend loads `/resources`.
2. Backend redacts paid delivery fields when the viewer is not entitled.
3. Frontend renders locked cards and a locked course panel.
4. User purchases through the product checkout flow or receives an access code.
5. User redeems the code from `#/settings`.
6. Backend calls `redeem_course_code`, which grants `course_entitlements`.
7. Frontend invalidates resources and entitlements, then unlocks the course.

The paywall is enforced on both sides. The frontend is for experience; the backend is the real gate.

## Resource Management

Course Access Portal includes an admin-only resource manager at `#/admin/resources`.

In mock mode, choose `Admin Preview` on `#/login`. The manager updates the React Query mock resource
catalog in memory so another developer can test create, edit, delete, paywall, and viewer behavior
without a backend.

In live mode, the page is visible only when `/me` returns `role = ADMIN`. The manager calls:

- `POST /admin/resources` to create a resource
- `PATCH /admin/resources/{resource_id}` to edit a resource
- `DELETE /admin/resources/{resource_id}` to delete a resource

Each resource can be sourced in one of three portable ways:

- `contentUrl`: quick article links, public PDFs, or public MP4 files
- `bucket` and `filePath`: Supabase Storage PDFs, delivered through public or signed URL endpoints
- `muxPlaybackId`: Mux-hosted videos, with `muxPlaybackSigned` controlling signed playback tokens

Course Access Portal deliberately keeps binary upload ingestion as an integration point. If a product wants
browser-to-Supabase PDF uploads or Mux direct uploads, add upload-preparation endpoints that create
signed upload URLs, then reuse the same final `resources` table headings shown in
`docs/supabase-setup.md`.

## Product Adaptation

Change these first:

- `PRODUCT.name`
- `PRODUCT.checkoutUrl`
- `COURSES`
- `PUBLIC_COURSE_IDS`
- module IDs and titles
- storage bucket names if you do not want `resources-public` and `resources-paid`

Keep these stable unless there is a reason to redesign the data contract:

- `resources.course_id`
- `resources.access`
- `/admin/resources`
- `course_entitlements`
- `access_codes.code_hash`
- `resource_progress`
- `/me/entitlements`
- `/entitlements/redeem`
- `/resources/{id}/progress`
- `/storage/paid-url`
- `/playback/mux-token`
