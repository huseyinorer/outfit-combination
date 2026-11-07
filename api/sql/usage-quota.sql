CREATE TABLE IF NOT EXISTS ai_usage_quota (
    installation_id uuid NOT NULL,
    period_type varchar(8) NOT NULL CHECK (period_type IN ('day', 'month')),
    period_key date NOT NULL,
    analysis_count integer NOT NULL DEFAULT 0 CHECK (analysis_count >= 0),
    outfit_count integer NOT NULL DEFAULT 0 CHECK (outfit_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (installation_id, period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_updated_at ON ai_usage_quota(updated_at);

DELETE FROM ai_usage_quota WHERE period_key < current_date - interval '13 months';
