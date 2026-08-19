import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfigService } from '../config/app-config.module';
import { passwordResetEmail, verificationEmail, coursePassedEmail } from './email.templates';

/**
 * Transactional email (§2 notifications rule).
 *
 * When SMTP_HOST is unset the service logs the message instead of sending it, so
 * a developer or a test run never silently loses a verification link and never
 * needs credentials. `npm run db:up` starts Mailpit, which is the intended local
 * path (D-021) and renders the real Arabic RTL template.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: AppConfigService) {
    const host = this.config.get('SMTP_HOST');

    if (!host) {
      this.logger.warn('SMTP_HOST is not set — emails will be logged, not sent.');
      this.transporter = null;
      return;
    }

    const user = this.config.get('SMTP_USER');
    const pass = this.config.get('SMTP_PASSWORD');

    this.transporter = createTransport({
      host,
      port: this.config.get('SMTP_PORT'),
      /* Mailpit and most internal relays on 1025 speak plaintext; anything else
         gets STARTTLS. */
      secure: this.config.get('SMTP_PORT') === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const hours = Math.round(this.config.get('EMAIL_VERIFICATION_TTL_MINUTES') / 60);
    const url = `${this.config.get('APP_URL')}/verify-email?token=${encodeURIComponent(token)}`;

    await this.send(to, verificationEmail(url, hours));
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const minutes = this.config.get('PASSWORD_RESET_TTL_MINUTES');
    const url = `${this.config.get('APP_URL')}/reset-password?token=${encodeURIComponent(token)}`;

    await this.send(to, passwordResetEmail(url, minutes));
  }

  async sendCoursePassed(to: string, courseTitle: string): Promise<void> {
    await this.send(to, coursePassedEmail(courseTitle, `${this.config.get('APP_URL')}/my-path`));
  }

  private async send(
    to: string,
    content: { subject: string; html: string; text: string },
  ): Promise<void> {
    if (!this.transporter) {
      /* Deliberately logs the full body in this mode only: it is the developer's
         sole way to reach the link, and it is unreachable when SMTP is
         configured, i.e. in every real environment. */
      this.logger.log(`[email not sent — no SMTP] to=${to} subject="${content.subject}"`);
      this.logger.log(content.text);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM'),
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    } catch (error) {
      /*
       * Never rethrow. A failing mail server must not turn a successful
       * registration into a 500 — the account exists, and the user can request
       * a new verification email. Rethrowing would also leak, by the difference
       * between a fast success and a slow error, whether an address is
       * registered (see the enumeration-resistance note in AuthService).
       */
      this.logger.error(
        `Failed to send "${content.subject}": ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
