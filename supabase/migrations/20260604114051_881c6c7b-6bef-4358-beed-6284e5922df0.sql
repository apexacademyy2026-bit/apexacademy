
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
