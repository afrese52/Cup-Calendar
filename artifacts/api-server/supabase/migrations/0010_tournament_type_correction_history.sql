CREATE TABLE IF NOT EXISTS public.admin_tournament_type_correction_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    previous_tournament_type TEXT NOT NULL
        CHECK (previous_tournament_type IN ('FNCS', 'Cash Cup', 'Ranked Cup', 'Community')),
    tournament_type TEXT NOT NULL
        CHECK (tournament_type IN ('FNCS', 'Cash Cup', 'Ranked Cup', 'Community')),
    admin_user_id UUID NOT NULL,
    admin_email TEXT NOT NULL,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT different_tournament_types CHECK (previous_tournament_type <> tournament_type)
);

CREATE INDEX IF NOT EXISTS idx_admin_tournament_type_correction_history_corrected_at
    ON public.admin_tournament_type_correction_history (corrected_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_tournament_type_correction_history_event_id
    ON public.admin_tournament_type_correction_history (event_id, corrected_at DESC);

ALTER TABLE public.admin_tournament_type_correction_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_tournament_type_correction_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_tournament_type_correction_history TO service_role;

CREATE OR REPLACE FUNCTION public.correct_event_tournament_type(
    p_event_id TEXT,
    p_expected_tournament_type TEXT,
    p_tournament_type TEXT,
    p_admin_user_id UUID,
    p_admin_email TEXT
)
RETURNS TABLE (
    history_id BIGINT,
    corrected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_event_title TEXT;
    v_history_id BIGINT;
    v_corrected_at TIMESTAMPTZ;
BEGIN
    UPDATE public.fortnite_events
    SET tournament_type = p_tournament_type,
        updated_at = pg_catalog.now()
    WHERE id = p_event_id
      AND tournament_type = p_expected_tournament_type
    RETURNING title INTO v_event_title;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.admin_tournament_type_correction_history (
        event_id,
        event_title,
        previous_tournament_type,
        tournament_type,
        admin_user_id,
        admin_email
    )
    VALUES (
        p_event_id,
        v_event_title,
        p_expected_tournament_type,
        p_tournament_type,
        p_admin_user_id,
        p_admin_email
    )
    RETURNING id, admin_tournament_type_correction_history.corrected_at
    INTO v_history_id, v_corrected_at;

    RETURN QUERY SELECT v_history_id, v_corrected_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.correct_event_tournament_type(TEXT, TEXT, TEXT, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_event_tournament_type(TEXT, TEXT, TEXT, UUID, TEXT)
    TO service_role;
