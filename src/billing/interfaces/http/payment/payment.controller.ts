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

  /** Status da conexão com a API Mercado Pago / Mercado Livre. */
  @Get('mercado-pago/connection')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  async mercadoPagoConnection() {
    return this.gateway.verifyConnection();
  }

  /** Lab: checkout stub (quando MP_ACCESS_TOKEN está ausente). */
  @Get('stub-checkout/:paymentId')
  stubCheckout(@Param('paymentId') paymentId: string) {
    return {
      paymentId,
      approve: `POST /payments/${paymentId}/stub/approve`,
      reject: `POST /payments/${paymentId}/stub/reject`,
    };
  }

  @Get(':id')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async byId(@Param('id') id: string): Promise<PaymentResponseDto> {
    return (await this.getPayment.byId(id)).toJSON();
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
   * Consulta o status no Mercado Pago (ou stub) e aplica a transição.
   * Busca por providerPaymentId ou por external_reference (= paymentId).
   */
  @Post(':id/sync')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async sync(@Param('id') id: string): Promise<PaymentResponseDto> {
    const payment = await this.getPayment.byId(id);
    let providerPaymentId = payment.providerPaymentId;

    if (!providerPaymentId) {
      const found = await this.gateway.findPaymentByExternalReference(
        payment.id,
      );
      providerPaymentId = found?.providerPaymentId;
    }

    if (!providerPaymentId) {
      return payment.toJSON();
    }

    const updated = await this.handleNotification.execute(providerPaymentId);
    return (updated ?? payment).toJSON();
  }

  /** Lab: aprova pagamento no stub e processa notificação. */
  @Post(':id/stub/approve')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async stubApprove(@Param('id') id: string): Promise<PaymentResponseDto> {
    const payment = await this.getPayment.byId(id);
    const providerPaymentId = this.gateway.stubApprove(
      payment.id,
      payment.amount,
    );
    const updated = await this.handleNotification.execute(providerPaymentId);
    return (updated ?? payment).toJSON();
  }

  /** Lab: rejeita pagamento no stub e processa notificação. */
  @Post(':id/stub/reject')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: PaymentResponseDto })
  async stubReject(@Param('id') id: string): Promise<PaymentResponseDto> {
    const payment = await this.getPayment.byId(id);
    const providerPaymentId = this.gateway.stubReject(
      payment.id,
      payment.amount,
    );
    const updated = await this.handleNotification.execute(providerPaymentId);
    return (updated ?? payment).toJSON();
  }
}
