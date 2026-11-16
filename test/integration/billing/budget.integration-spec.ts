import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Budget } from '../../../src/billing/domain/entities/budget';
import { UserRole } from '../../../src/billing/domain/entities/user-role';
import { BUDGET_REPOSITORY } from '../../../src/billing/domain/repositories/tokens';
import type { BudgetRepositoryInterface } from '../../../src/billing/domain/repositories/budget.repository';
import {
  bootstrapIntegrationApp,
  shutdownIntegrationApp,
  signRoleToken,
} from '../helpers/integration-app';
import { resetIntegrationDatabase } from '../helpers/reset-integration-database';

describe('Billing budgets (integration)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    await resetIntegrationDatabase();
    app = await bootstrapIntegrationApp();
    token = signRoleToken(app, UserRole.ATENDENTE);
  });

  afterAll(async () => {
    await shutdownIntegrationApp(app);
  });

  it('GET /budgets/:id retorna orçamento persistido', async () => {
    const budgets = app.get<BudgetRepositoryInterface>(BUDGET_REPOSITORY);
    const budget = Budget.create({
      serviceOrderId: '11111111-1111-4111-8111-111111111111',
      correlationId: '11111111-1111-4111-8111-111111111111',
      items: [
        {
          type: 'SERVICE',
          referenceId: 'svc-1',
          description: 'Alinhamento',
          quantity: 1,
          unitPrice: 80,
          total: 80,
        },
      ],
      servicesTotal: 80,
      partsTotal: 0,
      total: 80,
      client: {
        id: 'c1',
        document: '52998224725',
        name: 'Cliente',
        email: 'cliente@example.com',
      },
    });
    await budgets.create(budget);

    const res = await request(app.getHttpServer())
      .get(`/budgets/${budget.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(budget.id);
    expect(res.body.correlationId).toBe(budget.correlationId);
    expect(res.body.total).toBe(80);
    expect(res.body.service).toBeUndefined();
  });
});
