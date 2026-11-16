import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { awsClientOptions } from '../../../shared/infrastructure/messaging/aws-client.factory';
import { GenerateBudgetFromEventUseCase } from '../../application/use-case/budget';
import { MarkBudgetApprovedUseCase } from '../../application/use-case/budget/mark-budget-approved';
import { MarkBudgetRejectedUseCase } from '../../application/use-case/budget/mark-budget-rejected';
import { CancelBudgetUseCase } from '../../application/use-case/budget/cancel-budget';
import { CreatePaymentFromReservationUseCase } from '../../application/use-case/payment/create-payment-from-reservation';
import { RefundPaymentUseCase } from '../../application/use-case/payment/refund-payment';

type IncomingEvent = {
  eventId?: string;
  type: string;
  correlationId: string;
  causationId?: string;
  payload: Record<string, unknown>;
};

/**
 * Long-polling na fila SQS do billing. Sem `SQS_QUEUE_URL`, o consumer não sobe
 * (útil em testes e lab sem LocalStack).
 */
@Injectable()
export class SagaEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SagaEventsConsumer.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly generateBudget: GenerateBudgetFromEventUseCase,
    private readonly markApproved: MarkBudgetApprovedUseCase,
    private readonly markRejected: MarkBudgetRejectedUseCase,
    private readonly cancelBudget: CancelBudgetUseCase,
    private readonly createPayment: CreatePaymentFromReservationUseCase,
    private readonly refundPayment: RefundPaymentUseCase,
  ) {
    this.queueUrl = this.config.get<string>('SQS_QUEUE_URL') || '';
    this.client = new SQSClient(awsClientOptions(this.config));
  }

  onModuleInit(): void {
    if (!this.queueUrl) {
      this.logger.warn('SQS_QUEUE_URL ausente; consumer SNS/SQS desligado');
      return;
    }
    this.running = true;
    this.loop = this.pollLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 5,
            WaitTimeSeconds: 10,
            MessageAttributeNames: ['All'],
          }),
        );

        for (const message of result.Messages ?? []) {
          try {
            await this.handleRaw(message.Body ?? '{}');
            if (message.ReceiptHandle) {
              await this.client.send(
                new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                }),
              );
            }
          } catch (error) {
            this.logger.error(
              `falha ao processar mensagem: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `erro no poll SQS: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async handleRaw(body: string): Promise<void> {
    const parsed = JSON.parse(body) as IncomingEvent | { Message?: string };
    const event: IncomingEvent =
      'Message' in parsed && parsed.Message
        ? (JSON.parse(parsed.Message) as IncomingEvent)
        : (parsed as IncomingEvent);

    await this.dispatch(event);
  }

  private async dispatch(event: IncomingEvent): Promise<void> {
    this.logger.log(
      `consume type=${event.type} correlationId=${event.correlationId} eventId=${event.eventId}`,
    );

    switch (event.type) {
      case 'order.budget.requested': {
        const payload = event.payload as {
          serviceOrderId: string;
          client: {
            id: string;
            document: string;
            name: string;
            email: string;
          };
          vehicle?: {
            plate: string;
            brand?: string;
            model?: string;
            year?: number;
          };
          serviceLines: Array<{
            catalogServiceId: string;
            name: string;
            unitPrice: number;
            quantity: number;
          }>;
          partDemand: Array<{
            productCode: string;
            name?: string;
            quantity: number;
          }>;
        };
        await this.generateBudget.execute({
          ...payload,
          correlationId: event.correlationId,
          causationId: event.eventId,
        });
        break;
      }
      case 'order.budget.approved': {
        const payload = event.payload as {
          serviceOrderId: string;
          budgetId?: string;
        };
        await this.markApproved.execute(
          payload.serviceOrderId,
          payload.budgetId,
        );
        break;
      }
      case 'order.budget.rejected': {
        const payload = event.payload as {
          serviceOrderId: string;
          budgetId?: string;
          reason?: string;
        };
        await this.markRejected.execute(
          payload.serviceOrderId,
          payload.reason,
          payload.budgetId,
        );
        break;
      }
      case 'stock.reserved': {
        const payload = event.payload as {
          serviceOrderId: string;
          reservationId: string;
        };
        await this.createPayment.execute({
          serviceOrderId: payload.serviceOrderId,
          reservationId: payload.reservationId,
          correlationId: event.correlationId,
          causationId: event.eventId,
        });
        break;
      }
      case 'stock.reservation.failed': {
        const payload = event.payload as {
          serviceOrderId: string;
          reason?: string;
        };
        await this.cancelBudget.execute(
          payload.serviceOrderId,
          payload.reason ?? 'Falha na reserva de estoque',
        );
        break;
      }
      case 'order.cancelled': {
        const payload = event.payload as {
          serviceOrderId: string;
          reason?: string;
        };
        await this.cancelBudget.execute(payload.serviceOrderId, payload.reason);
        await this.refundPayment.byServiceOrderId(payload.serviceOrderId);
        break;
      }
      default:
        this.logger.debug(`evento ignorado type=${event.type}`);
    }
  }
}
