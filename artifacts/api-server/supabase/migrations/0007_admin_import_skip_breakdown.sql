ALTER TABLE public.admin_import_history
    ADD COLUMN skipped_warning_count INTEGER CHECK (skipped_warning_count >= 0),
    ADD COLUMN skipped_past_count INTEGER CHECK (skipped_past_count >= 0),
    ADD COLUMN skipped_invalid_count INTEGER CHECK (skipped_invalid_count >= 0);
