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