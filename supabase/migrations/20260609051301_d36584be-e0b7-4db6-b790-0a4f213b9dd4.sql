CREATE POLICY "members can read class_schedules"
ON public.class_schedules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.class_members cm
    WHERE cm.class_id = class_schedules.class_id
      AND cm.student_id = auth.uid()
  )
);