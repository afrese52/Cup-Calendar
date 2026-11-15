1
    
    ALTER TABLE public.fortnite_events
    ADD COLUMN IF NOT EXISTS tournament_series TEXT
    CHECK (tournament_series IN ('Reload'));

ALTER TABLE public.fortnite_events
    ADD COLUMN IF NOT EXISTS game_ruleset TEXT
    CHECK (game_ruleset IN ('Battle Royale', 'Zero Build', 'Community'));

-- Keep the original game_mode column untouched for existing API consumers.
-- New metadata is nullable because older records may not identify both values.
UPDATE public.fortnite_events
SET tournament_series = 'Reload'
WHERE (game_mode = 'Reload' OR title ~* '\mReload\M')
  AND tournament_series IS NULL;

UPDATE public.fortnite_events
SET game_ruleset = CASE
    WHEN game_mode = 'Reload' THEN NULL
    ELSE game_mode
END
WHERE game_ruleset IS NULL;
