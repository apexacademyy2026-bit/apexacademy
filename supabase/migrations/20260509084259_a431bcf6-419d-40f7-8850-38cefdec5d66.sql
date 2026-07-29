
alter function public.gen_join_code() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from anon, authenticated, public;
revoke execute on function public.handle_new_user_role() from anon, authenticated, public;
revoke execute on function public.gen_join_code() from anon, authenticated, public;
revoke execute on function public.join_class_with_code(text) from anon, public;
grant execute on function public.join_class_with_code(text) to authenticated;
