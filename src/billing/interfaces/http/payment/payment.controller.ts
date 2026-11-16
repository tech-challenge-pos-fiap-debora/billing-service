import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  GetPaymentUseCase,
  HandlePaymentNotificationUseCase,
} from '../../../application/use-case/payment';
import { UserRole } from '../../../domain/entities/user-role';
import { MercadoPagoPaymentGateway } from '../../../infrastructure/adapters/mercado-pago-payment.gateway';
import { AuthRoles } from '../auth/decorators/auth-roles.decorator';
import { PaymentResponseDto } from './dtos/payment-response.dto';

@ApiTags('Billing / Pagamentos')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly getPayment: GetPaymentUseCase,
    private readonly handleNotification: HandlePaymentNotificationUseCase,
    private readonly gateway: MercadoPagoPaymentGateway,
  ) {}

  @Get(':id')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async byId(@Param('id') id: string): Promise<PaymentResponseDto> {
    return (await this.getPayment.byId(id)).toJSON() as PaymentResponseDto;
  }

  @Get()
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: [PaymentResponseDto] })
  async byServiceOrder(
    @Query('serviceOrderId') serviceOrderId: string,
  ): Promise<PaymentResponseDto[]> {
    const list = await this.getPayment.byServiceOrderId(serviceOrderId);
    return list.map((p) => p.toJSON() as PaymentResponseDto);
  }

  /**
   * Lab / EKS: consulta o status no gateway (ou stub) e aplica a transição,
   * útil quando o webhook do Mercado Pago não alcança o cluster.
   */
  @Post(':id/sync')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async sync(@Param('id') id: string): Promise<PaymentResponseDto> {
    const payment = await this.getPayment.byId(id);
    const providerPaymentId =
      payment.providerPaymentId ||
      this.gateway.stubApprove(payment.id, payment.amount);
    const updated = await this.handleNotification.execute(providerPaymentId);
    return (updated ?? payment).toJSON() as PaymentResponseDto;
  }
}
