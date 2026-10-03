# Five-a-Side

Daily Premier League predictions: 5 questions a day, streaks and a leaderboard.

Built with TanStack Start, React, Tailwind and Supabase.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Fill in `.env`** with the values from Supabase → Project Settings → API:
   - `VITE_SUPABASE_URL` and `SUPABASE_URL`: the project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`: the publishable (anon) key
   - `SUPABASE_SERVICE_ROLE_KEY`: the service role key (server only, keep it secret)
3. **Create the database tables.** Run each file in `supabase/migrations/` in order, in Supabase → SQL Editor. Or, with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
4. **Set up login** in Supabase → Authentication → Sign In / Providers → Email: keep Email enabled and turn **"Confirm email" off**. Anonymous sign-ins can stay off.

Players log in with a unique username and a password; no email is ever asked for. Behind the scenes each username maps to a fixed internal address (`u<hex>@players.fiveaside.app`) because Supabase logins need one. Every player has a permanent user ID, and all answers, points and streaks are stored under it in the database, so they can log in again from any device.

There's no "forgot password" (there's no real email to send a link to). To reset a player's password, run this in the SQL Editor with their user ID (shown on the Admin page):

```sql
update auth.users set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf'))
where id = 'PLAYER-ID';
```

## Development

```sh
npm install --legacy-peer-deps
npm run dev      # http://localhost:8080
npm test
npm run build    # output in .output/
```

`--legacy-peer-deps` works around an npm 11 crash when resolving vitest's peer dependencies.

## Admin

Pick a username in the app, then make that player admin in the SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where lower(display_name) = lower('YourUsername');
```

Admins get an **Admin** tab (`/admin`) listing every player's ID, points, streaks, answers and last played date, with reset and remove actions.
