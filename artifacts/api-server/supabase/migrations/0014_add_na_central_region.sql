ALTER TABLE public.fortnite_events
    DROP CONSTRAINT IF EXISTS fortnite_events_region_check;

ALTER TABLE public.fortnite_events
    ADD CONSTRAINT fortnite_events_region_check
    CHECK (region IN ('EU', 'NAE', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME', 'GLOBAL'));
