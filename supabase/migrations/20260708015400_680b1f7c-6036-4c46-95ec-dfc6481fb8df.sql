
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
