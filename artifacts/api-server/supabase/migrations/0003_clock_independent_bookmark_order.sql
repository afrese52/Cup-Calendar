-- Existing installations may already have applied 0002, so upgrade the table
-- and RPC without relying on edits to the original migration.
ALTER TABLE public.user_event_bookmarks
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_user_event_bookmark(
    p_event_id TEXT,
    p_is_favorite BOOLEAN,
    p_updated_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF (select auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to sync bookmarks';
    END IF;

    -- Keep p_updated_at for RPC compatibility, but never use a device clock to
    -- decide whether an offline change wins. The row revision defines server
    -- order; updated_at is server-generated diagnostic metadata.
    INSERT INTO public.user_event_bookmarks (user_id, event_id, is_favorite, updated_at, revision)
    VALUES ((select auth.uid()), p_event_id, p_is_favorite, clock_timestamp(), 1)
    ON CONFLICT (user_id, event_id) DO UPDATE
    SET is_favorite = EXCLUDED.is_favorite,
        updated_at = clock_timestamp(),
        revision = public.user_event_bookmarks.revision + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_event_bookmark(TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_event_bookmark(TEXT, BOOLEAN, TIMESTAMPTZ) TO authenticated;
