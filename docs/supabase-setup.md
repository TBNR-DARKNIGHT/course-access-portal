# Supabase Setup

Apply `supabase/course_access_portal_schema.sql` to a new Supabase project. The backend uses the
service-role key, so RLS is enabled but browser policies are intentionally not required for the
starter. Do not expose the service-role key in the frontend.

## Tables And Headings

### `users`

Local account row linked to Clerk.

| Column | Purpose |
| --- | --- |
| `id` | Internal UUID used by application tables |
| `clerk_user_id` | Clerk user ID from JWT `sub` |
| `email` | Primary email |
| `first_name` | Profile first name |
| `last_name` | Profile last name |
| `role` | `CLIENT` or `ADMIN` |
| `status` | `ACTIVE` or `SUSPENDED` |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### `course_modules`

Optional module grouping for course pages.

| Column | Purpose |
| --- | --- |
| `course_id` | Stable course ID, for example `course-2` |
| `id` | Stable module ID, for example `module-1` |
| `title` | Display title |
| `sort_order` | Ordering hint |

### `resources`

Course catalog rows.

| Column | Purpose |
| --- | --- |
| `id` | Resource UUID |
| `title` | Resource title |
| `course_id` | Course the resource belongs to |
| `module_id` | Optional module ID for grouped courses |
| `type` | `video`, `pdf`, `article`, or `module` |
| `topic` | Display topic/category |
| `description` | Card/detail page copy |
| `duration` | Optional display duration or page count |
| `access` | `public` or `paid` |
| `bucket` | Supabase Storage bucket for PDFs |
| `file_path` | Object path inside the bucket |
| `thumbnail_url` | Optional explicit thumbnail URL |
| `content_url` | Optional external article/file/MP4 URL |
| `mux_asset_id` | Optional Mux asset ID |
| `mux_playback_id` | Mux playback ID for video resources |
| `mux_playback_signed` | `true` when playback needs a server-minted JWT |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### `course_entitlements`

Paid access grants.

| Column | Purpose |
| --- | --- |
| `user_id` | `users.id` |
| `course_id` | Course unlocked for the user |
| `source` | `access_code`, `shop_webhook`, or `admin` |
| `source_reference` | Order ID, code ID, or admin note |
| `granted_at` | Grant timestamp |
| `revoked_at` | Null while active |

### `access_codes`

Single-use product/redemption codes. Store only hashes.

| Column | Purpose |
| --- | --- |
| `id` | Access-code UUID |
| `code_hash` | SHA-256 hash of the normalized plaintext code |
| `course_id` | Course unlocked by this code |
| `order_id` | Optional commerce order reference |
| `redeemed_by_user_id` | User who consumed the code |
| `redeemed_at` | Redemption timestamp |
| `expires_at` | Optional expiry timestamp |
| `created_at` | Creation timestamp |
| `created_by_user_id` | Optional admin user |
| `revoked_at` | Revocation timestamp |
| `revoked_by_user_id` | Admin who revoked it |
| `revocation_reason` | Reason for revocation |
| `replacement_for_code_id` | Link to a replaced code |

### `resource_progress`

Saved learner progress.

| Column | Purpose |
| --- | --- |
| `user_id` | `users.id` |
| `resource_id` | `resources.id` |
| `status` | `not_started`, `in_progress`, or `completed` |
| `progress_percent` | 0-100 engagement percent |
| `completed_at` | Completion timestamp |
| `last_accessed_at` | Last view/update timestamp |
| `last_position_seconds` | Video resume position |
| `duration_seconds` | Video duration when known |
| `pages_viewed` | PDF page numbers viewed |
| `page_count` | PDF total page count |
| `completion_source` | `manual`, `video_threshold`, or `video_ended` |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

## Storage Buckets

The SQL creates these buckets:

| Bucket | Access | Purpose |
| --- | --- | --- |
| `resources-public` | Public | Public PDFs and thumbnails |
| `resources-paid` | Private | Paid PDFs and thumbnails served by signed URL |

For a PDF resource, set:

```text
type = pdf
bucket = resources-paid
file_path = course-2/module-1/workbook.pdf
access = paid
```

The thumbnail convention is:

```text
course-2/module-1/workbook_thumbnail.jpg
```

## Access Code Issuance

From `course-access-portal/backend`:

```powershell
$env:SUPABASE_URL="https://..."
$env:SUPABASE_SERVICE_KEY="..."
python -m app.create_access_code --course-id course-2 --order-id ORDER-123
```

The plaintext code is printed once. Deliver it to the buyer and do not store it. The database keeps
only `code_hash`.

## Redemption Transaction

`redeem_course_code(p_code_hash, p_user_id)`:

- Locks the matching access-code row
- Rejects invalid, revoked, redeemed, expired, or duplicate-access attempts
- Inserts or restores the `course_entitlements` row
- Marks the access code as redeemed
- Returns the unlocked `course_id`

Only the backend service role can execute this function.

## Public Courses

The backend environment variable `PUBLIC_COURSE_IDS` controls course-level free access:

```env
PUBLIC_COURSE_IDS=course-1
```

Resources in public courses can still have `access = paid` for catalog consistency, but the backend
will treat them as accessible if the course ID is public.

## Admin Resource Manager

The admin resource manager reads and writes the same `resources` table. A live user must have:

```sql
update public.users
set role = 'ADMIN'
where email = 'admin@example.com';
```

The reference backend exposes these admin endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/admin/resources` | Create a resource row |
| `PATCH /api/v1/admin/resources/{resource_id}` | Update catalog/source fields |
| `DELETE /api/v1/admin/resources/{resource_id}` | Delete a resource row |

For quick setup, create resources with a `content_url`. For production PDFs, upload the file to
Supabase Storage first and save `bucket` plus `file_path`. For production Mux videos, save
`mux_playback_id` and set `mux_playback_signed` when the playback policy requires a JWT.
