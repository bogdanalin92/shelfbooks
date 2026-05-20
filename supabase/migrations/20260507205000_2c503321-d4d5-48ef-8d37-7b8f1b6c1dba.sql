DO $$ BEGIN
  CREATE TYPE public.book_status AS ENUM
  ('to_read', 'reading', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE public.books
(
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isbn TEXT,
  title TEXT NOT NULL,
  authors TEXT
  [] NOT NULL DEFAULT '{}',
  cover_url TEXT,
  published_year INT,
  status public.book_status NOT NULL DEFAULT 'to_read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now
  (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now
  ()
);

  CREATE INDEX books_user_id_idx ON public.books(user_id);
  CREATE INDEX books_user_status_idx ON public.books(user_id, status);

  ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users can view their own books"
  ON public.books FOR
  SELECT
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert their own books"
  ON public.books FOR
  INSERT
  WITH CHECK (auth.uid() =
  user_id);

  CREATE POLICY "Users can update their own books"
  ON public.books FOR
  UPDATE
  USING (auth.uid()
  = user_id);

  CREATE POLICY "Users can delete their own books"
  ON public.books FOR
  DELETE
  USING (auth.uid
  () = user_id);

  CREATE OR REPLACE FUNCTION public.set_updated_at
  ()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
  NEW.updated_at = now
  ();
  RETURN NEW;
  END;
$$;

  CREATE TRIGGER books_set_updated_at
  BEFORE
  UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION
  public.set_updated_at
  ();
