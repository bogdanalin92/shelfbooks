DROP POLICY IF EXISTS "Users can insert their own logs" ON public.logs;

CREATE POLICY "Authenticated users can insert their own logs"
ON public.logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.logs ALTER COLUMN user_id SET NOT NULL;