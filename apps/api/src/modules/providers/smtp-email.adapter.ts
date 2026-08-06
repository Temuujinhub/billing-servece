import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailPort, EmailSendResult } from './email.port';

/**
 * SMTP email adapter (nodemailer) — onboarding хүсэлтийг Bonum/LIME рүү
 * илгээхэд ашиглана. Байгууллагын өөрийн SMTP (жишээ нь info@mediapro.mn-ийн
 * mail server) эсвэл дурын transactional SMTP ажиллана.
 */
@Injectable()
export class SmtpEmailAdapter implements EmailPort {
  readonly code = 'email_smtp';
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) throw new Error('Email is not configured (SMTP_HOST)');
    const port = Number(this.config.get('SMTP_PORT')) || 587;
    const user = this.config.get<string>('SMTP_USER');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get('SMTP_SECURE') === 'true' || port === 465,
      auth: user ? { user, pass: this.config.get<string>('SMTP_PASS') ?? '' } : undefined,
    });
    return this.transporter;
  }

  async send(args: { to: string; subject: string; text: string; cc?: string }): Promise<EmailSendResult> {
    const from = this.config.get<string>('EMAIL_FROM') ?? this.config.get<string>('SMTP_USER');
    const info = await this.getTransporter().sendMail({
      from,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      text: args.text,
    });
    this.logger.log(`Email sent to ${args.to}: ${info.messageId}`);
    return { providerRef: String(info.messageId ?? ''), delivered: true };
  }
}
