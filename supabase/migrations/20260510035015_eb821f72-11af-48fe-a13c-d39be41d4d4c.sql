
-- Add student profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS school_class text,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text;

-- Allow teachers to read profiles of students who joined their classes
CREATE POLICY "teacher reads class member profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.class_members m
    JOIN public.classes c ON c.id = m.class_id
    WHERE m.student_id = profiles.id AND c.user_id = auth.uid()
  )
);
