
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
