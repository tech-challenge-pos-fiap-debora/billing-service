#!/usr/bin/env bash
# Cria SNS + fila do billing no LocalStack do domínio (lab) e gera .env.localstack.
# Preferir o ready.d do container; este script é fallback no host.
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"
QUEUE_NAME="${OFICINA_QUEUE_NAME:-billing-events}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="$REGION"
export AWS_EC2_METADATA_DISABLED=true
export OFICINA_QUEUE_NAME="$QUEUE_NAME"

aws_local() {
  aws --endpoint-url="$ENDPOINT" --region "$REGION" "$@"
}

echo "Aguardando LocalStack em $ENDPOINT ..."
for _ in $(seq 1 60); do
  if curl -fsS "$ENDPOINT/_localstack/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Reusa a mesma lógica do ready.d via env + awslocal wrapper.
ROOT="$(cd "$(dirname "$0")" && pwd)"
PATH_SAVE="$PATH"
# shellcheck disable=SC2329
awslocal() { aws --endpoint-url="$ENDPOINT" --region "$REGION" "$@"; }
export -f awslocal 2>/dev/null || true
bash "$ROOT/localstack-ready.sh"

TOPIC_ARN="$(aws_local sns list-topics --query 'Topics[0].TopicArn' --output text)"
QUEUE_URL="$(aws_local sqs get-queue-url --queue-name "$QUEUE_NAME" --query QueueUrl --output text \
  | sed -E 's#https?://[^/]+:4566#http://localhost:4566#')"

cat >"$(cd "$ROOT/.." && pwd)/.env.localstack" <<ENV
# Gerado por scripts/localstack-init.sh (domínio billing)
AWS_REGION=$REGION
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=$ENDPOINT
SNS_TOPIC_ARN=$TOPIC_ARN
SNS_FANOUT_ENDPOINTS=http://localhost:4567,http://localhost:4568,http://localhost:4566
SQS_QUEUE_URL=$QUEUE_URL
ENV

echo "OK. SNS + fila $QUEUE_NAME com policies/FilterPolicy."
