
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
