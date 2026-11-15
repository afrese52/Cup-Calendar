CREATE OR REPLACE FUNCTION public.commit_mht_import(
    p_events JSONB,
    p_history JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF pg_catalog.jsonb_typeof(p_events) IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(p_events) = 0 THEN
        RAISE EXCEPTION 'Import muss mindestens einen Termin enthalten';
    END IF;

    IF pg_catalog.jsonb_typeof(p_history) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Importhistorie ist ungültig';
    END IF;

    INSERT INTO public.fortnite_events (
        id,
        title,
        region,
        game_mode,
        game_ruleset,
        tournament_series,
        team_format,
        tournament_type,
        category,
        start_time,
        end_time,
        updated_at
    )
    SELECT
        imported.id,
        imported.title,
        imported.region,
        imported.game_mode,
        imported.game_ruleset,
        imported.tournament_series,
        imported.team_format,
        imported.tournament_type,
        imported.category,
        imported.start_time,
        imported.end_time,
        imported.updated_at
    FROM pg_catalog.jsonb_to_recordset(p_events) AS imported(
        id TEXT,
        title TEXT,
        region TEXT,
        game_mode TEXT,
        game_ruleset TEXT,
        tournament_series TEXT,
        team_format TEXT,
        tournament_type TEXT,
        category TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        updated_at TIMESTAMPTZ
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        region = EXCLUDED.region,
        game_mode = EXCLUDED.game_mode,
        game_ruleset = EXCLUDED.game_ruleset,
        tournament_series = EXCLUDED.tournament_series,
        team_format = EXCLUDED.team_format,
        tournament_type = EXCLUDED.tournament_type,
        category = EXCLUDED.category,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO public.admin_import_history (
        admin_user_id,
        admin_email,
        source_hint,
        inserted_count,
        updated_count,
        skipped_count,
        skipped_warning_count,
        skipped_past_count,
        skipped_invalid_count
    )
    VALUES (
        (p_history ->> 'admin_user_id')::UUID,
        p_history ->> 'admin_email',
        p_history ->> 'source_hint',
        (p_history ->> 'inserted_count')::INTEGER,
        (p_history ->> 'updated_count')::INTEGER,
        (p_history ->> 'skipped_count')::INTEGER,
        (p_history ->> 'skipped_warning_count')::INTEGER,
        (p_history ->> 'skipped_past_count')::INTEGER,
        (p_history ->> 'skipped_invalid_count')::INTEGER
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_mht_import(JSONB, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_mht_import(JSONB, JSONB)
    TO service_role;
