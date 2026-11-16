CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY,
  service_order_id UUID NOT NULL UNIQUE,
  correlation_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  services_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  parts_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  client JSONB NOT NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_correlation_id ON budgets (correlation_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets (status);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES budgets (id),
  service_order_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO',
  preference_id VARCHAR(128),
  provider_payment_id VARCHAR(128),
  status VARCHAR(32) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  checkout_url TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_budget_id ON payments (budget_id);
CREATE INDEX IF NOT EXISTS idx_payments_service_order_id ON payments (service_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_correlation_id ON payments (correlation_id);
CREATE INDEX IF NOT EXISTS idx_payments_preference_id ON payments (preference_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_expires ON payments (status, expires_at);

-- No máximo um pagamento ativo (PENDING/CONFIRMED) por orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_budget
  ON payments (budget_id)
  WHERE status IN ('PENDING', 'CONFIRMED');
