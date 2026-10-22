-- Store editable public homepage copy; all writes remain restricted to the admin API.
CREATE TABLE IF NOT EXISTS public.site_content (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    content JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO service_role;
-- No anon/authenticated policies are created. The public homepage reads this
-- through FastAPI; updates require the backend's require_admin dependency.
