CREATE TABLE IF NOT EXISTS public.admin_import_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    admin_email TEXT NOT NULL,
    source_hint TEXT,
    inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
    updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
    skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_import_history_imported_at
    ON public.admin_import_history (imported_at DESC);

ALTER TABLE public.admin_import_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_import_history FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_import_history TO service_role;
