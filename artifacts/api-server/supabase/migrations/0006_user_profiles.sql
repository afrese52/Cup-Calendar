-- A profile row is created for every Supabase Auth user, including users
-- created before this migration is applied.
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    pro_valid_until TIMESTAMPTZ,
    original_store TEXT CHECK (
        original_store IN ('google_play', 'apple_app_store', 'manual')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add profile fields when an earlier version of the table already exists.
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pro_valid_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS original_store TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.create_user_profile_for_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
        NEW.id,
        NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'display_name'), '')
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_profile_for_auth_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS cupcal_create_user_profile ON auth.users;
CREATE TRIGGER cupcal_create_user_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_user_profile_for_auth_user();

-- Backfill users who already exist. Existing profile values are preserved.
INSERT INTO public.user_profiles (id, display_name)
SELECT
    users.id,
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'display_name'), '')
FROM auth.users AS users
ON CONFLICT (id) DO NOTHING;

-- Profiles contain private account metadata. Users can read only their own
-- row; role and subscription fields remain writable only by trusted servers.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO service_role;

DROP POLICY IF EXISTS "Users read own profile" ON public.user_profiles;
CREATE POLICY "Users read own profile"
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users update own display_name" ON public.user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.user_profiles;
