CREATE TABLE IF NOT EXISTS public.fortnite_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    poster_url TEXT,
    region TEXT NOT NULL CHECK (region IN ('EU', 'NAE', 'NAW', 'BR', 'ASIA', 'OCE', 'ME', 'GLOBAL')),
    game_mode TEXT NOT NULL CHECK (game_mode IN ('Battle Royale', 'Zero Build', 'Reload', 'Community')),
    team_format TEXT NOT NULL CHECK (team_format IN ('Solo', 'Duos', 'Trios', 'Squads')),
    tournament_type TEXT NOT NULL CHECK (tournament_type IN ('FNCS', 'Cash Cup', 'Ranked Cup', 'Community')),
    category TEXT NOT NULL CHECK (category IN ('Turnier', 'Liga', 'Qualifikation', 'Trainingsrunde')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    custom_admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT valid_event_dates CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_events_start_time ON public.fortnite_events (start_time);
CREATE INDEX IF NOT EXISTS idx_events_region_mode ON public.fortnite_events (region, game_mode);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.fortnite_events (tournament_type);
ALTER TABLE public.fortnite_events
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Turnier'
    CHECK (category IN ('Turnier', 'Liga', 'Qualifikation', 'Trainingsrunde'));

ALTER TABLE public.fortnite_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'fortnite_events'
          AND policyname = 'Public read for fortnite_events'
    ) THEN
        CREATE POLICY "Public read for fortnite_events"
            ON public.fortnite_events
            FOR SELECT
            TO anon, authenticated
            USING (true);
    END IF;
END
$$;
