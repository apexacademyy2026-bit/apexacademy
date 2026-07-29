
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
