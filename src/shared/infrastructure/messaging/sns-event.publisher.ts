import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type {
  EventPublisherPort,
  PublishableEvent,
} from '../../domain/ports/event-publisher.port';

@Injectable()
export class SnsEventPublisher implements EventPublisherPort {
  private readonly logger = new Logger(SnsEventPublisher.name);
  private readonly client: SNSClient;
  private readonly topicArn: string;

  constructor(config: ConfigService) {
    const region = config.get<string>('AWS_REGION') || 'us-east-1';
    const endpoint = config.get<string>('AWS_ENDPOINT_URL') || undefined;
    this.topicArn = config.get<string>('SNS_TOPIC_ARN') || '';
    this.client = new SNSClient({
      region,
      ...(endpoint ? { endpoint } : {}),
    });
  }

  async publish(event: PublishableEvent): Promise<void> {
    if (!this.topicArn) {
      this.logger.warn(
        `SNS_TOPIC_ARN ausente; evento não publicado type=${event.type}`,
      );
      return;
    }

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(event),
        MessageAttributes: {
          type: {
            DataType: 'String',
            StringValue: event.type,
          },
          correlationId: {
            DataType: 'String',
            StringValue: event.correlationId,
          },
        },
      }),
    );

    this.logger.log(
      `published type=${event.type} correlationId=${event.correlationId} eventId=${event.eventId}`,
    );
  }
}
