# Infra do billing-service (AWS)

Este microsserviço **não** usa Kind. O deploy de produção é na AWS:

| Camada | Repositório | Papel |
|---|---|---|
| Banco | `infra-database` | RDS PostgreSQL — database **`billing`** na mesma instância do lab |
| Cluster / ECR / ALB | `infra-kubernetes` | EKS + repositórios ECR `billing-service` e `billing-service-migrations` |
| Workloads | `billing-service/k8s` | Deployment, Job de migration, Service ClusterIP, Ingress ALB, HPA |

## Fluxo de CD

1. Push na `main` deste repo → workflow **Publish ECR** (build + push).
2. O workflow dispara `deploy-prod.yml` em `infra-kubernetes` com:
   - `service=billing-service`
   - `billing_image_tag=<sha>`
   - `billing_migrations_image_tag=<sha>`
3. O EKS aplica os manifests e roda o Job de migration contra o RDS.

## Secrets necessários (GitHub)

No repo `billing-service`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `INFRA_DISPATCH_TOKEN`.

No `infra-kubernetes`: `BILLING_DATABASE_URL` (RDS com `/billing`), `JWT_SECRET`, chaves New Relic / Mercado Pago / SNS+SQS conforme o lab.

## Banco `billing` no RDS

Na instância já provisionada pelo `infra-database`:

```sql
CREATE DATABASE billing;
```

A URL segue o mesmo host/usuário do `DATABASE_URL` do monolito, trocando o path para `/billing` e mantendo `?sslmode=require` se necessário.
