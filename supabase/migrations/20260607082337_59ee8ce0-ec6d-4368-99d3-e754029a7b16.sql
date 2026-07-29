
CREATE POLICY "student reads own attendance"
ON public.attendance FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "student reads events of joined classes"
ON public.schedule_events FOR SELECT
TO authenticated
USING (app_private.is_class_member(class_id, auth.uid()));
