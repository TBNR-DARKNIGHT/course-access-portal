# Clerk Authentication Setup

## Frontend

Set these environment variables:

```env
VITE_AUTH_MODE=clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_BASE_URL=https://your-api.example.com/api/v1
```

`frontend/src/auth/clerk-auth-provider.tsx` wraps the app in `ClerkProvider` and normalizes Clerk
user data into the dashboard's `PortalAuthContext`.

The frontend calls `getToken()` from Clerk and sends it as:

```http
Authorization: Bearer <clerk-session-jwt>
```

All protected API calls use that token.

## Backend

Set these environment variables:

```env
CLERK_JWKS_URL=https://your-clerk-domain/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-domain
CLERK_AUDIENCE=
CLERK_SECRET_KEY=sk_...
```

The backend:

1. Reads the bearer token from `Authorization`.
2. Loads Clerk JWKS from `CLERK_JWKS_URL`.
3. Verifies the JWT issuer and optional audience.
4. Reads the Clerk `sub` claim.
5. Resolves or creates `public.users.clerk_user_id = sub`.
6. Uses the local `users.id` UUID for entitlements and progress rows.

If your Clerk session token does not include email claims, keep `CLERK_SECRET_KEY` configured. The
backend uses it to fetch the Clerk profile during first-user sync.

## Clerk Dashboard Checklist

- Add the frontend production URL to allowed origins.
- Add the sign-in redirect URL for the dashboard.
- Add the sign-up redirect URL if sign-up is enabled.
- Configure JWT audience only if you also set `CLERK_AUDIENCE` in the backend.
- Keep the Clerk secret key server-side only.

## Admin Accounts

Clerk authenticates the person; Supabase decides their application role. After the first successful
dashboard API request creates the local `users` row, promote an admin in Supabase:

```sql
update public.users
set role = 'ADMIN'
where clerk_user_id = 'user_...';
```

Only `ADMIN` users can open the live resource manager or call `/api/v1/admin/resources`.

## Optional Webhook

Course Access Portal syncs a user on first authenticated API request. A production product can also
add a Clerk webhook for `user.created`, `user.updated`, and `user.deleted` to keep Supabase updated
before the first dashboard request.

Recommended webhook behavior:

- Verify with Clerk's webhook signing secret.
- Upsert `users.clerk_user_id`, `email`, `first_name`, and `last_name`.
- Preserve server-managed `role` and `status`.
- For `user.deleted`, mark `status = 'SUSPENDED'` or remove the user depending on retention needs.

## Local Mock Mode

For local UI work without Clerk:

```env
VITE_AUTH_MODE=mock
```

Mock mode uses local personas and mock resource data. It should not be used for production.
