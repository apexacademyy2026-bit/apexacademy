-- Consolidated schema bootstrap for the current project
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- 20260505120831_0d575f23-7ea3-4f24-a357-fa3adba5f360.sql

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  language TEXT NOT NULL DEFAULT 'vi',
  bank_code TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  grade TEXT,
  fee_per_session NUMERIC(12,0) NOT NULL DEFAULT 0,
  fee_per_month NUMERIC(12,0) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  color TEXT NOT NULL DEFAULT '#93c5fd',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own classes" ON public.classes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER classes_touch BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Class fixed weekly schedule
CREATE TABLE public.class_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL, -- 0=Sun..6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own class_schedules" ON public.class_schedules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  notes TEXT,
  payment_mode TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'by_session'
  sessions_per_cycle INTEGER NOT NULL DEFAULT 8,
  fee_per_session NUMERIC(12,0) NOT NULL DEFAULT 0,
  fee_per_month NUMERIC(12,0) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  color TEXT NOT NULL DEFAULT '#bfdbfe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own students" ON public.students FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER students_touch BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enrollments
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own enrollments" ON public.enrollments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Schedule events (actual calendar instances; can be moved/deleted independently)
CREATE TABLE public.schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.schedule_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER events_touch BEFORE UPDATE ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.schedule_events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  homework_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, student_id)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attendance" ON public.attendance FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Payments (paid bills)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  cycle_type TEXT NOT NULL, -- 'monthly' | 'session'
  cycle_label TEXT NOT NULL, -- e.g. 'Thang5_2026' or '8buoi_2026-05-04'
  period_start DATE,
  period_end DATE,
  session_count INTEGER,
  amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, cycle_type, cycle_label)
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_classes_user ON public.classes(user_id);
CREATE INDEX idx_students_user ON public.students(user_id);
CREATE INDEX idx_events_user_date ON public.schedule_events(user_id, event_date);
CREATE INDEX idx_attendance_event ON public.attendance(event_id);
CREATE INDEX idx_payments_student ON public.payments(student_id);


-- 20260505120857_332aaf6a-8c19-4727-a51d-a1c10ea74a55.sql

-- Fix touch_updated_at search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Restrict execution of SECURITY DEFINER trigger function (it only runs from the trigger)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- 20260505125739_eb599bad-96ee-4886-9276-746d14e38550.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- 20260506012652_a0b8fff6-8451-40f5-b55f-598d028e2d9c.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS fee_override numeric;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 20260509084234_f6a3176d-1cb8-421c-afe9-03430aa2e629.sql

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


-- 20260509084259_a431bcf6-419d-40f7-8850-38cefdec5d66.sql

alter function public.gen_join_code() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.handle_new_user_role() from anon, authenticated, public;
revoke execute on function public.gen_join_code() from anon, authenticated, public;
revoke execute on function public.join_class_with_code(text) from anon, public;
grant execute on function public.join_class_with_code(text) to authenticated;


-- 20260510035015_eb821f72-11af-48fe-a13c-d39be41d4d4c.sql

-- Add student profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS school_class text,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text;

-- Allow teachers to read profiles of students who joined their classes
CREATE POLICY "teacher reads class member profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.class_members m
    JOIN public.classes c ON c.id = m.class_id
    WHERE m.student_id = profiles.id AND c.user_id = auth.uid()
  )
);


-- 20260510044621_5a148e43-b332-4703-92a9-6eafc2e014bd.sql
create or replace function public.is_class_member(_class_id uuid, _student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members
    where class_id = _class_id
      and student_id = _student_id
  )
$$;

create or replace function public.owns_class(_class_id uuid, _teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes
    where id = _class_id
      and user_id = _teacher_id
  )
$$;

drop policy if exists "student reads joined classes" on public.classes;
drop policy if exists "teacher reads own class members" on public.class_members;
drop policy if exists "teacher removes class members" on public.class_members;

create policy "student reads joined classes"
on public.classes
for select
to authenticated
using (public.is_class_member(id, auth.uid()));

create policy "teacher reads own class members"
on public.class_members
for select
to authenticated
using (public.owns_class(class_id, auth.uid()));

create policy "teacher removes class members"
on public.class_members
for delete
to authenticated
using (public.owns_class(class_id, auth.uid()));

-- 20260510044654_fac43714-2095-46f2-b7cc-3508c7ab0e90.sql
create schema if not exists app_private;

create or replace function app_private.is_class_member(_class_id uuid, _student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_members
    where class_id = _class_id
      and student_id = _student_id
  )
$$;

create or replace function app_private.owns_class(_class_id uuid, _teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes
    where id = _class_id
      and user_id = _teacher_id
  )
$$;

revoke all on schema app_private from public, anon, authenticated;
revoke all on function app_private.is_class_member(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.owns_class(uuid, uuid) from public, anon, authenticated;

drop policy if exists "student reads joined classes" on public.classes;
drop policy if exists "teacher reads own class members" on public.class_members;
drop policy if exists "teacher removes class members" on public.class_members;

create policy "student reads joined classes"
on public.classes
for select
to authenticated
using (app_private.is_class_member(id, auth.uid()));

create policy "teacher reads own class members"
on public.class_members
for select
to authenticated
using (app_private.owns_class(class_id, auth.uid()));

create policy "teacher removes class members"
on public.class_members
for delete
to authenticated
using (app_private.owns_class(class_id, auth.uid()));

drop function if exists public.is_class_member(uuid, uuid);
drop function if exists public.owns_class(uuid, uuid);

-- 20260604104550_fd0643e8-0d4d-4915-be2a-c1dbb727c8fb.sql
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_class_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.owns_class(uuid, uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_members TO authenticated;
GRANT ALL ON public.class_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedules TO authenticated;
GRANT ALL ON public.class_schedules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_events TO authenticated;
GRANT ALL ON public.schedule_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_attempts TO authenticated;
GRANT ALL ON public.test_attempts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_questions TO authenticated;
GRANT ALL ON public.test_questions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tests TO authenticated;
GRANT ALL ON public.tests TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.join_class_with_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_join_code() TO authenticated;

DROP POLICY IF EXISTS "student joins class" ON public.class_members;
CREATE POLICY "student joins class"
ON public.class_members
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "teacher adds class members" ON public.class_members;
CREATE POLICY "teacher adds class members"
ON public.class_members
FOR INSERT
TO authenticated
WITH CHECK (app_private.owns_class(class_id, auth.uid()));

-- 20260604104802_15e80ea7-ee4a-4056-b916-6c57f40ccedb.sql
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;

-- 20260604114051_881c6c7b-6bef-4358-beed-6284e5922df0.sql

DROP POLICY IF EXISTS "student reads questions of accessible tests" ON public.test_questions;

CREATE OR REPLACE FUNCTION public.get_test_questions_for_student(_test_id uuid)
RETURNS TABLE (id uuid, test_id uuid, part text, "position" int, statement_latex text, options jsonb, points numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.points
  FROM public.test_questions q
  JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id
    AND t.is_open
    AND EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = t.class_id AND m.student_id = auth.uid())
  ORDER BY q.part, q.position;
$$;
REVOKE ALL ON FUNCTION public.get_test_questions_for_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_test_questions_for_student(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_test_attempt(_attempt_id uuid, _answers jsonb)
RETURNS TABLE (score numeric, max_score numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric := 0;
  v_max numeric := 0;
  v_test uuid;
  v_student uuid;
  v_submitted timestamptz;
  q record;
  ans jsonb;
  pts numeric;
  k text;
  each_pts numeric;
BEGIN
  SELECT test_id, student_id, submitted_at INTO v_test, v_student, v_submitted
  FROM public.test_attempts WHERE id = _attempt_id;
  IF v_student IS NULL OR v_student <> auth.uid() THEN
    RAISE EXCEPTION 'Not your attempt';
  END IF;
  IF v_submitted IS NOT NULL THEN
    RAISE EXCEPTION 'Already submitted';
  END IF;

  FOR q IN SELECT * FROM public.test_questions WHERE test_id = v_test LOOP
    v_max := v_max + q.points;
    ans := _answers -> q.id::text;
    pts := 0;
    IF q.part = 'mcq' THEN
      IF ans ->> 'choice' = q.correct ->> 'choice' THEN pts := q.points; END IF;
    ELSIF q.part = 'tf' THEN
      each_pts := q.points / 4.0;
      FOREACH k IN ARRAY ARRAY['a','b','c','d'] LOOP
        IF (ans -> k) IS NOT NULL AND (ans -> k) = (q.correct -> k) THEN
          pts := pts + each_pts;
        END IF;
      END LOOP;
    ELSIF q.part = 'short' THEN
      IF coalesce(btrim(ans ->> 'value'),'') <> '' AND btrim(ans ->> 'value') = btrim(q.correct ->> 'value') THEN
        pts := q.points;
      END IF;
    END IF;
    v_total := v_total + pts;
  END LOOP;

  score := CASE WHEN v_max > 0 THEN (v_total / v_max) * 10 ELSE 0 END;
  max_score := 10;

  UPDATE public.test_attempts
    SET answers = _answers, submitted_at = now(), score = (CASE WHEN v_max > 0 THEN (v_total / v_max) * 10 ELSE 0 END), max_score = 10
    WHERE id = _attempt_id;

  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_test_attempt(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_attempt_review(_attempt_id uuid)
RETURNS TABLE (id uuid, test_id uuid, part text, "position" int, statement_latex text, options jsonb, correct jsonb, points numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_test uuid;
  v_student uuid;
  v_submitted timestamptz;
  v_teacher uuid;
BEGIN
  SELECT a.test_id, a.student_id, a.submitted_at, t.teacher_id
    INTO v_test, v_student, v_submitted, v_teacher
  FROM public.test_attempts a JOIN public.tests t ON t.id = a.test_id
  WHERE a.id = _attempt_id;

  IF v_test IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF auth.uid() <> v_teacher AND (auth.uid() <> v_student OR v_submitted IS NULL) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN QUERY
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.correct, q.points
  FROM public.test_questions q WHERE q.test_id = v_test
  ORDER BY q.part, q.position;
END;
$$;
REVOKE ALL ON FUNCTION public.get_attempt_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;

CREATE POLICY "deny update on class_members" ON public.class_members
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny insert on user_roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "deny update on user_roles" ON public.user_roles
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "deny delete on user_roles" ON public.user_roles
  FOR DELETE TO authenticated USING (false);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_join_code() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Users can list their own avatar folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);


-- 20260605065511_f50d055b-d3c7-4fa5-987a-79d92a62bc78.sql

ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS image_url text;

DROP FUNCTION IF EXISTS public.get_test_questions_for_student(uuid);
CREATE OR REPLACE FUNCTION public.get_test_questions_for_student(_test_id uuid)
RETURNS TABLE(id uuid, test_id uuid, part text, "position" integer, statement_latex text, options jsonb, points numeric, image_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.points, q.image_url
  FROM public.test_questions q
  JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id
    AND t.is_open
    AND EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = t.class_id AND m.student_id = auth.uid())
  ORDER BY q.part, q.position;
$function$;

DROP FUNCTION IF EXISTS public.get_attempt_review(uuid);
CREATE OR REPLACE FUNCTION public.get_attempt_review(_attempt_id uuid)
RETURNS TABLE(id uuid, test_id uuid, part text, "position" integer, statement_latex text, options jsonb, correct jsonb, points numeric, image_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_test uuid; v_student uuid; v_submitted timestamptz; v_teacher uuid;
BEGIN
  SELECT a.test_id, a.student_id, a.submitted_at, t.teacher_id
    INTO v_test, v_student, v_submitted, v_teacher
  FROM public.test_attempts a JOIN public.tests t ON t.id = a.test_id
  WHERE a.id = _attempt_id;
  IF v_test IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF auth.uid() <> v_teacher AND (auth.uid() <> v_student OR v_submitted IS NULL) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN QUERY
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.correct, q.points, q.image_url
  FROM public.test_questions q WHERE q.test_id = v_test
  ORDER BY q.part, q.position;
END;
$function$;


-- 20260605065549_7e697343-d0b2-4868-9943-fd3c69f29219.sql

-- Storage policies for test-images bucket
CREATE POLICY "teachers upload own test images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teachers update own test images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teachers delete own test images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth users read test images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'test-images');

-- Lock down RPCs from anon (linter)
REVOKE EXECUTE ON FUNCTION public.get_test_questions_for_student(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_attempt_review(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_test_questions_for_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;


-- 20260607082337_59ee8ce0-ec6d-4368-99d3-e754029a7b16.sql

CREATE POLICY "student reads own attendance"
ON public.attendance FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "student reads events of joined classes"
ON public.schedule_events FOR SELECT
TO authenticated
USING (app_private.is_class_member(class_id, auth.uid()));


-- 20260607083248_82e62528-3ebb-4078-9149-767c52b06a70.sql

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS linked_user_id uuid;
CREATE INDEX IF NOT EXISTS students_linked_user_id_idx ON public.students(linked_user_id);

CREATE POLICY "linked student reads own roster"
ON public.students
FOR SELECT
TO authenticated
USING (auth.uid() = linked_user_id);

CREATE POLICY "linked student reads own attendance via roster"
ON public.attendance
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = attendance.student_id AND s.linked_user_id = auth.uid()
));


-- 20260609051301_d36584be-e0b7-4db6-b790-0a4f213b9dd4.sql
CREATE POLICY "members can read class_schedules"
ON public.class_schedules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = class_schedules.class_id
      AND cm.student_id = auth.uid()
  )
);

-- 20260706054814_6d9c204a-e1f3-451e-bc1f-827349d35241.sql

CREATE TABLE public.class_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_documents TO authenticated;
GRANT ALL ON public.class_documents TO service_role;

ALTER TABLE public.class_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher manages own class docs"
  ON public.class_documents FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_documents.class_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_documents.class_id AND c.user_id = auth.uid()));

CREATE POLICY "Class members read docs"
  ON public.class_documents FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = class_documents.class_id AND m.student_id = auth.uid()));

CREATE TRIGGER class_documents_touch
  BEFORE UPDATE ON public.class_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Teacher uploads to own class folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'class-docs'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Teacher deletes own class files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'class-docs'
    AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Teacher and class members read class files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'class-docs'
    AND (
      EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.class_members m
        WHERE m.class_id::text = (storage.foldername(name))[1]
          AND m.student_id = auth.uid()
      )
    )
  );


-- 20260707032309_8fd62da8-6e71-40f3-8fa3-168a1f37b9a9.sql

-- 1) Fix storage RLS on class-docs bucket (was checking class NAME instead of the object path)
DROP POLICY IF EXISTS "Teacher uploads to own class folder" ON storage.objects;
DROP POLICY IF EXISTS "Teacher deletes own class files" ON storage.objects;
DROP POLICY IF EXISTS "Teacher and class members read class files" ON storage.objects;

CREATE POLICY "class-docs teacher insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-docs'
    AND EXISTS (SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.user_id = auth.uid())
  );

CREATE POLICY "class-docs teacher delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'class-docs'
    AND EXISTS (SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND c.user_id = auth.uid())
  );

CREATE POLICY "class-docs read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'class-docs'
    AND (
      EXISTS (SELECT 1 FROM public.classes c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.class_members m
        WHERE m.class_id::text = (storage.foldername(name))[1]
          AND m.student_id = auth.uid())
    )
  );

-- 2) Class category (math / english / null=unsorted)
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('math','english'));

-- 3) Teacher brand name (shown in sidebar)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS brand_name text;

-- 4) Lessons > Chapters structure
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons teacher manage" ON public.lessons FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lessons members read" ON public.lessons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = lessons.class_id AND m.student_id = auth.uid()));
CREATE TRIGGER lessons_touch BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters teacher manage" ON public.chapters FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "chapters members read" ON public.chapters FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.class_members m ON m.class_id = l.class_id
    WHERE l.id = chapters.lesson_id AND m.student_id = auth.uid()
  ));
CREATE TRIGGER chapters_touch BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Link tests and documents to a chapter (optional)
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
ALTER TABLE public.class_documents
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;

-- 6) Vocabulary (for English chapters)
CREATE TABLE IF NOT EXISTS public.vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  word text NOT NULL,
  word_class text,
  meaning_en text,
  meaning_vi text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocabulary TO authenticated;
GRANT ALL ON public.vocabulary TO service_role;
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab teacher manage" ON public.vocabulary FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "vocab members read" ON public.vocabulary FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chapters c
    JOIN public.lessons l ON l.id = c.lesson_id
    JOIN public.class_members m ON m.class_id = l.class_id
    WHERE c.id = vocabulary.chapter_id AND m.student_id = auth.uid()
  ));
CREATE TRIGGER vocab_touch BEFORE UPDATE ON public.vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 20260708015400_680b1f7c-6036-4c46-95ec-dfc6481fb8df.sql

-- 1) Fix storage RLS for class-docs bucket: use object path prefix (class_id/...), not class name
DROP POLICY IF EXISTS "class-docs teacher insert" ON storage.objects;
DROP POLICY IF EXISTS "class-docs teacher delete" ON storage.objects;
DROP POLICY IF EXISTS "class-docs read" ON storage.objects;

CREATE POLICY "class-docs teacher insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'class-docs' AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "class-docs teacher delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'class-docs' AND EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "class-docs read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'class-docs' AND (
      EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.class_members m
        WHERE m.class_id::text = (storage.foldername(name))[1] AND m.student_id = auth.uid()
      )
    )
  );

-- 2) Restructure: Class -> Chapters -> Lessons -> (docs, tests, vocab)
-- Tables are empty; drop and rebuild parent relationships.
ALTER TABLE public.class_documents DROP CONSTRAINT IF EXISTS class_documents_chapter_id_fkey;
ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS tests_chapter_id_fkey;
ALTER TABLE public.vocabulary DROP CONSTRAINT IF EXISTS vocabulary_chapter_id_fkey;
ALTER TABLE public.chapters DROP CONSTRAINT IF EXISTS chapters_lesson_id_fkey;

DROP TABLE public.vocabulary;
DROP TABLE public.chapters;
DROP TABLE public.lessons;

ALTER TABLE public.class_documents DROP COLUMN IF EXISTS chapter_id;
ALTER TABLE public.tests DROP COLUMN IF EXISTS chapter_id;

-- Chapters directly under a class
CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters teacher manage" ON public.chapters
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "chapters members read" ON public.chapters
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = chapters.class_id AND m.student_id = auth.uid())
  );
CREATE TRIGGER chapters_touch BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Lessons under a chapter
CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons teacher manage" ON public.lessons
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lessons members read" ON public.lessons
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      JOIN public.class_members m ON m.class_id = c.class_id
      WHERE c.id = lessons.chapter_id AND m.student_id = auth.uid()
    )
  );
CREATE TRIGGER lessons_touch BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vocabulary under a lesson
CREATE TABLE public.vocabulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  word text NOT NULL,
  word_class text,
  meaning_en text,
  meaning_vi text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vocabulary TO authenticated;
GRANT ALL ON public.vocabulary TO service_role;
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vocab teacher manage" ON public.vocabulary
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "vocab members read" ON public.vocabulary
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.chapters c ON c.id = l.chapter_id
      JOIN public.class_members m ON m.class_id = c.class_id
      WHERE l.id = vocabulary.lesson_id AND m.student_id = auth.uid()
    )
  );
CREATE TRIGGER vocab_touch BEFORE UPDATE ON public.vocabulary FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add lesson_id to class_documents and tests
ALTER TABLE public.class_documents ADD COLUMN lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE public.tests ADD COLUMN lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;


-- 20260709035343_be9ced7f-035c-42fb-9f54-9ac09acb6feb.sql

-- Fix class-docs storage policies: reference class_id (first folder), not class name
DROP POLICY IF EXISTS "class-docs teacher insert" ON storage.objects;
DROP POLICY IF EXISTS "class-docs teacher delete" ON storage.objects;
DROP POLICY IF EXISTS "class-docs read" ON storage.objects;
DROP POLICY IF EXISTS "class-docs teacher update" ON storage.objects;

CREATE POLICY "class-docs teacher insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'class-docs' AND EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
  )
);
CREATE POLICY "class-docs teacher update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'class-docs' AND EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
  )
);
CREATE POLICY "class-docs teacher delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'class-docs' AND EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
  )
);
CREATE POLICY "class-docs read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'class-docs' AND (
    EXISTS (SELECT 1 FROM public.classes c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.class_members m
      WHERE m.class_id::text = (storage.foldername(name))[1] AND m.student_id = auth.uid())
  )
);

-- Extend test_questions for English 4-section tests
ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS passage text,
  ADD COLUMN IF NOT EXISTS audio_url text;


-- 20260709035630_18bc0a2c-4d0e-4a43-902a-dbc729c87fd5.sql

DROP FUNCTION IF EXISTS public.get_test_questions_for_student(uuid);
CREATE FUNCTION public.get_test_questions_for_student(_test_id uuid)
 RETURNS TABLE(id uuid, test_id uuid, part text, "position" integer, statement_latex text, options jsonb, points numeric, image_url text, section text, passage text, audio_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.points, q.image_url, q.section, q.passage, q.audio_url
  FROM public.test_questions q
  JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id
    AND t.is_open
    AND EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = t.class_id AND m.student_id = auth.uid())
  ORDER BY
    CASE q.section WHEN 'listening' THEN 1 WHEN 'language' THEN 2 WHEN 'reading' THEN 3 WHEN 'writing' THEN 4 ELSE 5 END,
    q.part, q.position;
$function$;


-- 20260710153804_e8c74f8d-7578-434b-908d-5f17efa95034.sql

DROP POLICY IF EXISTS "class-docs teacher insert" ON storage.objects;
DROP POLICY IF EXISTS "class-docs teacher update" ON storage.objects;
DROP POLICY IF EXISTS "class-docs teacher delete" ON storage.objects;
DROP POLICY IF EXISTS "class-docs read" ON storage.objects;

CREATE POLICY "class-docs teacher insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'class-docs' AND EXISTS (
  SELECT 1 FROM public.classes c WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()));
CREATE POLICY "class-docs teacher update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'class-docs' AND EXISTS (
  SELECT 1 FROM public.classes c WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()));
CREATE POLICY "class-docs teacher delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'class-docs' AND EXISTS (
  SELECT 1 FROM public.classes c WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()));
CREATE POLICY "class-docs read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'class-docs' AND (
  EXISTS (SELECT 1 FROM public.classes c WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id::text = (storage.foldername(name))[1] AND m.student_id = auth.uid())
));

ALTER TABLE public.vocabulary
  ADD COLUMN IF NOT EXISTS phonetic_uk TEXT,
  ADD COLUMN IF NOT EXISTS phonetic_us TEXT,
  ADD COLUMN IF NOT EXISTS audio_uk_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_us_url TEXT,
  ADD COLUMN IF NOT EXISTS example TEXT;

CREATE TABLE IF NOT EXISTS public.test_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  section TEXT,
  title TEXT NOT NULL DEFAULT '',
  passage TEXT,
  audio_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_parts TO authenticated;
GRANT ALL ON public.test_parts TO service_role;
ALTER TABLE public.test_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teacher manages parts of own tests" ON public.test_parts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_parts.test_id AND t.teacher_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.tests t WHERE t.id = test_parts.test_id AND t.teacher_id = auth.uid()));

CREATE POLICY "class members read parts of open tests" ON public.test_parts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tests t
  JOIN public.class_members m ON m.class_id = t.class_id
  WHERE t.id = test_parts.test_id AND t.is_open AND m.student_id = auth.uid()));

ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS part_id UUID REFERENCES public.test_parts(id) ON DELETE CASCADE;

DROP FUNCTION IF EXISTS public.get_test_questions_for_student(uuid);
CREATE FUNCTION public.get_test_questions_for_student(_test_id uuid)
RETURNS TABLE(id uuid, test_id uuid, part text, "position" integer, statement_latex text, options jsonb, points numeric, image_url text, section text, passage text, audio_url text, part_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.test_id, q.part, q.position, q.statement_latex, q.options, q.points, q.image_url, q.section, q.passage, q.audio_url, q.part_id
  FROM public.test_questions q
  JOIN public.tests t ON t.id = q.test_id
  WHERE q.test_id = _test_id AND t.is_open
    AND EXISTS (SELECT 1 FROM public.class_members m WHERE m.class_id = t.class_id AND m.student_id = auth.uid())
  ORDER BY
    CASE q.section WHEN 'listening' THEN 1 WHEN 'language' THEN 2 WHEN 'reading' THEN 3 WHEN 'writing' THEN 4 ELSE 5 END,
    q.part, q.position;
$$;

