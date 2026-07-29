
-- Storage policies for test-images bucket
CREATE POLICY "teachers upload own test images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teachers update own test images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teachers delete own test images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'test-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth users read test images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'test-images');

-- Lock down RPCs from anon (linter)
REVOKE EXECUTE ON FUNCTION public.get_test_questions_for_student(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_attempt_review(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_test_questions_for_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attempt_review(uuid) TO authenticated;
