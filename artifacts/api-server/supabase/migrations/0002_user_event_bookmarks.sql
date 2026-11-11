-- Keep this migration compatible with projects that already created the
-- original bookmark table from the CupCal implementation guide.
CREATE TABLE IF NOT EXISTS public.user_event_bookmarks (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    is_favorite BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revision BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.user_event_bookmarks
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;

-- Earlier schemas linked bookmarks to user_profiles and fortnite_events.
-- Authentication is based on auth.users, and offline event IDs must remain
-- saveable even when the event is not currently in the events table.
DO $$
DECLARE
    bookmark_table REGCLASS := 'public.user_event_bookmarks'::REGCLASS;
    user_id_attnum SMALLINT;
    event_id_attnum SMALLINT;
    foreign_key RECORD;
BEGIN
    SELECT attnum INTO user_id_attnum
    FROM pg_attribute
    WHERE attrelid = bookmark_table AND attname = 'user_id' AND NOT attisdropped;

    SELECT attnum INTO event_id_attnum
    FROM pg_attribute
    WHERE attrelid = bookmark_table AND attname = 'event_id' AND NOT attisdropped;

    FOR foreign_key IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = bookmark_table
          AND contype = 'f'
          AND (
              user_id_attnum = ANY(conkey)
              OR event_id_attnum = ANY(conkey)
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.user_event_bookmarks DROP CONSTRAINT %I',
            foreign_key.conname
        );
    END LOOP;
END;
$$;

ALTER TABLE public.user_event_bookmarks
    ADD CONSTRAINT user_event_bookmarks_auth_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_event_bookmarks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_event_bookmarks TO authenticated;

DROP POLICY IF EXISTS "Users read own bookmarks" ON public.user_event_bookmarks;
CREATE POLICY "Users read own bookmarks"
    ON public.user_event_bookmarks FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own bookmarks" ON public.user_event_bookmarks;
CREATE POLICY "Users insert own bookmarks"
    ON public.user_event_bookmarks FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own bookmarks" ON public.user_event_bookmarks;
CREATE POLICY "Users update own bookmarks"
    ON public.user_event_bookmarks FOR UPDATE TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage own bookmarks" ON public.user_event_bookmarks;

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

    -- p_updated_at is retained for RPC compatibility, but client clocks are
    -- not an ordering source. The server assigns a monotonic revision instead.
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
