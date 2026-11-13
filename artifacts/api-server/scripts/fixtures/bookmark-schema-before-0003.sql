-- Shape of the deployed 0002 schema before the revision migration was added.
-- Keep this fixture without a revision column so the upgrade path is exercised.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID
$$;

CREATE ROLE anon;
CREATE ROLE authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.user_event_bookmarks (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    is_favorite BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);

INSERT INTO auth.users (id) VALUES
    ('10000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002');

INSERT INTO public.user_event_bookmarks (user_id, event_id, is_favorite, updated_at) VALUES
    ('10000000-0000-0000-0000-000000000001', 'event-to-preserve', TRUE, '2025-01-02 03:04:05+00'),
    ('20000000-0000-0000-0000-000000000002', 'other-account-event', TRUE, '2025-02-03 04:05:06+00');

ALTER TABLE public.user_event_bookmarks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_event_bookmarks TO authenticated;

CREATE POLICY "Users read own bookmarks"
    ON public.user_event_bookmarks FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own bookmarks"
    ON public.user_event_bookmarks FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own bookmarks"
    ON public.user_event_bookmarks FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.sync_user_event_bookmark(
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
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to sync bookmarks';
    END IF;

    INSERT INTO public.user_event_bookmarks (user_id, event_id, is_favorite, updated_at)
    VALUES ((SELECT auth.uid()), p_event_id, p_is_favorite, p_updated_at)
    ON CONFLICT (user_id, event_id) DO UPDATE
    SET is_favorite = EXCLUDED.is_favorite,
        updated_at = EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at > public.user_event_bookmarks.updated_at
       OR (
           EXCLUDED.updated_at = public.user_event_bookmarks.updated_at
           AND EXCLUDED.is_favorite = FALSE
           AND public.user_event_bookmarks.is_favorite = TRUE
       );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_event_bookmark(TEXT, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_user_event_bookmark(TEXT, BOOLEAN, TIMESTAMPTZ) TO authenticated;
