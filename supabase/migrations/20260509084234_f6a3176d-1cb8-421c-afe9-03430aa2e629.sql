
-- 1. Roles
create type public.app_role as enum ('student', 'teacher', 'admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "read own roles" on public.user_roles
for select using (auth.uid() = user_id);

-- Trigger: assign 'student' role on signup unless metadata says teacher
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.app_role;
begin
  r := case when coalesce(new.raw_user_meta_data->>'role','student') = 'teacher'
            then 'teacher'::public.app_role
            else 'student'::public.app_role end;
  insert into public.user_roles (user_id, role) values (new.id, r)
    on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_role on auth.users;
create trigger on_auth_user_created_role
  after insert on auth.users
  for each row execute function public.handle_new_user_role();

-- 2. Join code on classes
alter table public.classes add column if not exists join_code text unique;

create or replace function public.gen_join_code()
returns text language sql as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
$$;

update public.classes set join_code = public.gen_join_code() where join_code is null;

-- 3. Class members
create table public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (class_id, student_id)
);

alter table public.class_members enable row level security;

create policy "student reads own membership" on public.class_members
for select using (auth.uid() = student_id);

create policy "teacher reads own class members" on public.class_members
for select using (exists (
  select 1 from public.classes c
  where c.id = class_id and c.user_id = auth.uid()
));

create policy "student leaves class" on public.class_members
for delete using (auth.uid() = student_id);

create policy "teacher removes class members" on public.class_members
for delete using (exists (
  select 1 from public.classes c
  where c.id = class_id and c.user_id = auth.uid()
));

create or replace function public.join_class_with_code(_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select id into cid from public.classes where join_code = upper(_code);
  if cid is null then raise exception 'Invalid code'; end if;
  insert into public.class_members (class_id, student_id) values (cid, auth.uid())
    on conflict do nothing;
  return cid;
end;
$$;

-- Allow students to read classes they have joined (in addition to teacher's "own classes" policy)
create policy "student reads joined classes" on public.classes
for select using (exists (
  select 1 from public.class_members m
  where m.class_id = classes.id and m.student_id = auth.uid()
));

-- 4. Tests
create table public.tests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  duration_minutes integer not null default 30,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tests enable row level security;

create policy "teacher manages own tests" on public.tests
for all using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

create policy "student reads tests in joined classes" on public.tests
for select using (
  is_open and exists (
    select 1 from public.class_members m
    where m.class_id = tests.class_id and m.student_id = auth.uid()
  )
);

create trigger tests_touch
  before update on public.tests
  for each row execute function public.touch_updated_at();

-- 5. Test questions
create table public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  part text not null check (part in ('mcq','tf','short')),
  position integer not null default 0,
  statement_latex text not null default '',
  options jsonb not null default '{}'::jsonb,
  correct jsonb not null default '{}'::jsonb,
  points numeric not null default 1,
  created_at timestamptz not null default now()
);

alter table public.test_questions enable row level security;

create policy "teacher manages questions of own tests" on public.test_questions
for all using (exists (
  select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()
)) with check (exists (
  select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()
));

create policy "student reads questions of accessible tests" on public.test_questions
for select using (exists (
  select 1 from public.tests t
  join public.class_members m on m.class_id = t.class_id
  where t.id = test_id and m.student_id = auth.uid() and t.is_open
));

-- 6. Test attempts
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  score numeric not null default 0,
  max_score numeric not null default 0
);

alter table public.test_attempts enable row level security;

create policy "student manages own attempts" on public.test_attempts
for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy "teacher reads attempts of own tests" on public.test_attempts
for select using (exists (
  select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()
));
