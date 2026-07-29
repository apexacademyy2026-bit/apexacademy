# Supabase schema bootstrap

The new Supabase project does not yet have the app schema applied, so the app cannot find tables such as `public.classes`.

## Option 1: Run in Supabase SQL Editor (recommended)
1. Open the Supabase Dashboard for the new project.
2. Go to SQL Editor.
3. Create a new query and paste the contents of [supabase/complete_schema.sql](supabase/complete_schema.sql).
4. Run the query.
5. Verify that tables such as `public.classes`, `public.students`, `public.schedule_events`, and `public.lessons` now exist.

## Option 2: Apply with the Supabase CLI
If the CLI is available locally:

```bash
npx supabase login
npx supabase link --project-ref nrjjjfhptkrnsaqoqcli
npx supabase db push
```

If you want to reset a local database and re-apply all migrations:

```bash
npx supabase db reset
```

> This project already contains migrations in the [supabase/migrations](supabase/migrations) folder, so applying them through the CLI is the preferred path for a fresh Supabase project.
