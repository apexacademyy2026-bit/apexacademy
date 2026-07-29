
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
