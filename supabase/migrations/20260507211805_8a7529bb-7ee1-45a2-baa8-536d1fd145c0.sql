CREATE TYPE public.log_level AS ENUM ('info', 'warn', 'error');

CREATE TABLE public.logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  level public.log_level NOT NULL DEFAULT 'error',
  source TEXT,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own logs"
ON public.logs FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own logs"
ON public.logs FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX idx_logs_user_created ON public.logs (user_id, created_at DESC);