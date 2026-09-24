import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmailMessage {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  errorMessage: string;
}

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Reset your password',
      htmlContent: this.buildResetPasswordHtml(resetUrl),
      textContent: this.buildResetPasswordText(resetUrl),
      errorMessage: 'Unable to send a reset password email.',
    });
  }

  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Your verification code',
      htmlContent: this.buildVerificationCodeHtml(code),
      textContent: this.buildVerificationCodeText(code),
      errorMessage: 'Unable to send an email verification code.',
    });
  }

  private async sendEmail(message: EmailMessage): Promise<void> {
    const { to, subject, htmlContent, textContent, errorMessage } = message;

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'post',
        headers: {
          'api-key': this.configService.getOrThrow<string>('BREVO_API_KEY'),
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.configService.get<string>('MAIL_FROM_EMAIL'),
            name: this.configService.get<string>('MAIL_FROM_NAME'),
          },
          to: [{ email: to }],
          subject,
          htmlContent,
          textContent,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Brevo request failed with status ${res.status}: ${body}`,
        );
      }
    } catch (err) {
      throw new Error(errorMessage, { cause: err });
    }
  }

  private buildResetPasswordHtml(resetUrl: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#18181b;">Reset your password</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#3f3f46;">
                  We received a request to reset your password. Click the button below to choose a new one. This link is only valid for a short time.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#18181b;">
                      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Reset password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71717a;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="${resetUrl}" style="color:#3f3f46;word-break:break-all;">${resetUrl}</a>
                </p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                  If you didn't request a password reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private buildResetPasswordText(resetUrl: string): string {
    return [
      'Reset your password',
      '',
      'We received a request to reset your password. Open this link to choose a new one:',
      resetUrl,
      '',
      "If you didn't request a password reset, you can safely ignore this email.",
    ].join('\n');
  }

  private buildVerificationCodeHtml(code: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#18181b;">Verify your email</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#3f3f46;">
                  Enter the code below to verify your email address. This code is only valid for a short time.
                </p>
                <p style="margin:0;padding:16px 24px;display:inline-block;border-radius:6px;background-color:#f4f4f5;font-size:28px;font-weight:700;letter-spacing:6px;color:#18181b;">${code}</p>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
                  If you didn't create an account, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private buildVerificationCodeText(code: string): string {
    return [
      'Verify your email',
      '',
      'Enter this code to verify your email address. It is only valid for a short time:',
      code,
      '',
      "If you didn't create an account, you can safely ignore this email.",
    ].join('\n');
  }
}
