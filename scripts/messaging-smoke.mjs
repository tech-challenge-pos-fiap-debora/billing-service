#!/usr/bin/env node
/**
 * Smoke SNS→SQS: publica um evento e confirma fan-out nas 3 filas
 * (billing-events, order-events, stock-events).
 */
import { randomUUID } from 'node:crypto';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';
const topicArn = process.env.SNS_TOPIC_ARN;
const queues = [
  ['billing', process.env.SQS_QUEUE_URL || process.env.SQS_BILLING_QUEUE_URL],
  ['order', process.env.SQS_ORDER_QUEUE_URL],
  ['stock', process.env.SQS_STOCK_QUEUE_URL],
].filter(([, url]) => Boolean(url));

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
};

if (!topicArn || queues.length === 0) {
  console.error('Defina SNS_TOPIC_ARN e ao menos SQS_QUEUE_URL (source .env.localstack).');
  process.exit(1);
}

const sns = new SNSClient({ region, endpoint, credentials });
const sqs = new SQSClient({ region, endpoint, credentials });

const correlationId = randomUUID();
const eventId = randomUUID();
const event = {
  eventId,
  type: 'order.budget.requested',
  version: 1,
  occurredAt: new Date().toISOString(),
  correlationId,
  producer: 'messaging-smoke',
  payload: {
    serviceOrderId: correlationId,
    client: {
      id: 'c1',
      document: '52998224725',
      name: 'Smoke',
      email: 'smoke@example.com',
    },
    serviceLines: [
      {
        catalogServiceId: 'svc-1',
        name: 'Troca de óleo',
        unitPrice: 100,
        quantity: 1,
      },
    ],
    partDemand: [],
  },
};

await sns.send(
  new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(event),
    MessageAttributes: {
      type: { DataType: 'String', StringValue: event.type },
      correlationId: { DataType: 'String', StringValue: correlationId },
    },
  }),
);
console.log(`publicado eventId=${eventId} correlationId=${correlationId}`);

async function waitQueue(name, queueUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 5,
        MessageAttributeNames: ['All'],
      }),
    );
    for (const msg of res.Messages ?? []) {
      const body = JSON.parse(msg.Body ?? '{}');
      const inner =
        typeof body.Message === 'string' ? JSON.parse(body.Message) : body;
      if (inner.eventId === eventId || inner.correlationId === correlationId) {
        console.log(`recebido em ${name}:`, inner.type);
        if (msg.ReceiptHandle) {
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: msg.ReceiptHandle,
            }),
          );
        }
        return true;
      }
    }
  }
  return false;
}

const results = await Promise.all(
  queues.map(async ([name, url]) => [name, await waitQueue(name, url)]),
);
const failed = results.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('timeout nas filas:', failed.join(', '));
  process.exit(1);
}
console.log('OK fan-out SNS→SQS nas filas:', results.map(([n]) => n).join(', '));
