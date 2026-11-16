import { Module } from '@nestjs/common';
import { ConfigureModule } from './shared/infrastructure/configure/configure.module';
import { ObservabilityModule } from './shared/infrastructure/observability/observability.module';
import { HealthModule } from './shared/infrastructure/ioc/health.module';
import { BillingModule } from './shared/infrastructure/ioc/billing.module';

@Module({
  imports: [
    ConfigureModule,
    ObservabilityModule,
    HealthModule,
    BillingModule,
  ],
})
export class AppModule {}
