import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config.js';
import type { PushEndpoint } from '../domain/types.js';
import type { ProviderSendInput, ProviderSendResult, PushProvider } from './provider.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailProvider implements PushProvider {
  public readonly channel = 'email' as const;

  private readonly transporter: Transporter | null;

  constructor() {
    if (!config.SMTP_HOST || !config.SMTP_PORT || !config.SMTP_FROM) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });
  }

  validateEndpoint(endpoint: PushEndpoint): { valid: boolean; reason?: string } {
    if (endpoint.channel !== 'email') {
      return { valid: false, reason: 'Invalid channel for Email provider' };
    }

    if (!this.transporter) {
      return { valid: false, reason: 'SMTP provider not configured' };
    }

    const targetAddress = endpoint.tokenOrSubscriptionEncrypted.trim();

    if (!emailRegex.test(targetAddress)) {
      return { valid: false, reason: 'Invalid email address endpoint' };
    }

    return { valid: true };
  }

  async send(input: ProviderSendInput): Promise<ProviderSendResult> {
    if (!this.transporter || !config.SMTP_FROM) {
      return {
        outcome: 'permanent_failure',
        errorCode: 'EMAIL_NOT_CONFIGURED',
        errorMessage: 'SMTP provider not configured',
      };
    }

    try {
      const subject = input.topic.length > 0 ? input.topic : 'Notification';
      const textBody = input.payload;
      const htmlBody = typeof input.options.html === 'string' ? input.options.html : undefined;
      const replyTo = typeof input.options.replyTo === 'string' ? input.options.replyTo : undefined;
      const from =
        typeof input.options.from === 'string' && input.options.from.length > 0
          ? input.options.from
          : config.SMTP_FROM;

      const response = await this.transporter.sendMail({
        from,
        to: input.target.trim(),
        subject,
        text: textBody,
        html: htmlBody,
        replyTo,
      });

      return {
        outcome: 'success',
        providerResponse: {
          messageId: response.messageId,
          accepted: response.accepted,
          rejected: response.rejected,
        },
      };
    } catch (error) {
      const message = String(error);
      const retryable = /timeout|temporar|connection|ETIMEDOUT|ECONNRESET|EHOSTUNREACH/i.test(
        message,
      );

      return {
        outcome: retryable ? 'retryable_failure' : 'permanent_failure',
        errorCode: retryable ? 'EMAIL_RETRYABLE' : 'EMAIL_PERMANENT',
        errorMessage: message,
      };
    }
  }
}
