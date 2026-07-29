
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
