import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_JWT_AUTH } from '../../../../billing/interfaces/http/auth/decorators/auth-roles.decorator';
import { SERVICE_NAME } from '../../../infrastructure/observability/service-identity';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';

export function configureHttpApp(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Billing Service')
    .setDescription(
      [
        `${SERVICE_NAME}: orçamentos e pagamentos (Mercado Pago) da oficina.`,
        '',
        '## Autenticação',
        'JWT do identity-service nas rotas autenticadas.',
        '',
        '## Saga (coreografia SNS/SQS)',
        '- Consome `order.budget.requested` → gera orçamento e publica `billing.budget.generated`.',
        '- Após `stock.reserved` cria checkout Mercado Pago (`billing.payment.created`).',
        '- Webhook `/webhooks/mercado-pago` confirma/rejeita e publica `billing.payment.confirmed|failed`.',
        '',
        '## Mercado Pago',
        '- Configure `MP_ACCESS_TOKEN` (sem token = stub local).',
        '- `GET /payments/mercado-pago/connection` valida a conexão.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(undefined, SWAGGER_JWT_AUTH)
    .addTag('Billing / Orçamentos', 'Consulta de orçamentos')
    .addTag('Billing / Pagamentos', 'Pagamentos e sync/stub Mercado Pago')
    .addTag('Billing / Webhooks', 'Notificações do Mercado Pago')
    .addTag('Health', 'Liveness e readiness')
    .build();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.useGlobalFilters(new DomainExceptionFilter());

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
}
