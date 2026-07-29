
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS linked_user_id uuid;
CREATE INDEX IF NOT EXISTS students_linked_user_id_idx ON public.students(linked_user_id);

CREATE POLICY "linked student reads own roster"
ON public.students
FOR SELECT
TO authenticated
USING (auth.uid() = linked_user_id);

CREATE POLICY "linked student reads own attendance via roster"
ON public.attendance
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.students s
  WHERE s.id = attendance.student_id AND s.linked_user_id = auth.uid()
));
