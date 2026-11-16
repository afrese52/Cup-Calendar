-- Legacy bookmark schema: users were resolved through profiles and events
-- had to exist in the Fortnite events table.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', TRUE), '')::UUID
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL
);

CREATE TABLE public.fortnite_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL
);

CREATE TABLE public.user_event_bookmarks (
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES public.fortnite_events(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, event_id)
);

INSERT INTO auth.users (id) VALUES
    ('10000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002');

INSERT INTO public.user_profiles (id, display_name) VALUES
    ('10000000-0000-0000-0000-000000000001', 'Erstes Konto'),
    ('20000000-0000-0000-0000-000000000002', 'Zweites Konto');

-- legacy-event-one is deleted and re-imported by the migration regression test.
INSERT INTO public.fortnite_events (id, title) VALUES
    ('legacy-event-one', 'Älteres Turnier'),
    ('legacy-event-two', 'Weiteres älteres Turnier');

INSERT INTO public.user_event_bookmarks (user_id, event_id) VALUES
    ('10000000-0000-0000-0000-000000000001', 'legacy-event-one'),
    ('20000000-0000-0000-0000-000000000002', 'legacy-event-two');
