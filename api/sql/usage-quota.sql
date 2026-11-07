DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_usage_quota' AND column_name = 'installation_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_usage_quota' AND column_name = 'subject_id'
    ) THEN
        ALTER TABLE ai_usage_quota RENAME COLUMN installation_id TO subject_id;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS ai_usage_quota (
    subject_id uuid NOT NULL,
    period_type varchar(8) NOT NULL CHECK (period_type IN ('day', 'month')),
    period_key date NOT NULL,
    analysis_count integer NOT NULL DEFAULT 0 CHECK (analysis_count >= 0),
    outfit_count integer NOT NULL DEFAULT 0 CHECK (outfit_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_id, period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_updated_at ON ai_usage_quota(updated_at);

DELETE FROM ai_usage_quota WHERE period_key < current_date - interval '13 months';
