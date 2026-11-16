import { Injectable, Logger } from '@nestjs/common';
import { IntegrationError } from '../../../shared/domain/errors';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

@Injectable()
export class IntegrationHttpClient {
  private readonly logger = new Logger(IntegrationHttpClient.name);

  async request<T>(
    service: string,
    method: HttpMethod,
    path: string,
    options: {
      baseUrl?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T | null> {
    const baseUrl = options.baseUrl?.replace(/\/$/, '');
    if (!baseUrl) {
      throw new IntegrationError(
        `${service} URL is not configured`,
        { code: 'INTEGRATION_NOT_CONFIGURED' },
      );
    }

    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(options.headers ?? {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(
          Number(process.env.INTEGRATION_TIMEOUT_MS ?? 5000),
        ),
      });
    } catch (cause) {
      throw new IntegrationError(
        `Falha ao chamar ${service} (${method} ${path}): ${
          cause instanceof Error ? cause.message : 'erro desconhecido'
        }`,
        { code: 'INTEGRATION_UNREACHABLE' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `${service} ${method} ${path} failed status=${response.status} body=${text}`,
      );
      throw new IntegrationError(
        `${service} respondeu ${response.status} em ${method} ${path}`,
        { code: 'INTEGRATION_BAD_RESPONSE' },
      );
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  }
}
