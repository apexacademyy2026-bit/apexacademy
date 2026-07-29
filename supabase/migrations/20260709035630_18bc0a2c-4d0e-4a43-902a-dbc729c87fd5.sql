
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
