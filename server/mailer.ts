import nodemailer from 'nodemailer';

/*
 * Outgoing email. In production, any SMTP provider works (Postmark, Amazon SES,
 * SendGrid, Mailgun, Brevo, Google Workspace…):
 *
 *   SMTP_URL=smtps://user:pass@smtp.example.com:465        or
 *   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE (true for 465)
 *   MAIL_FROM="Add Call <no-reply@example.com>"
 *
 * MAIL_TRANSPORT=console prints emails to the server log instead of sending
 * them — for local development only (the log then contains reset links).
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
  /** Shown in logs and /healthz, e.g. "smtp" or "console". */
  kind: string;
}

export function createSmtpMailer(opts: { url?: string; host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from: string }): Mailer {
  const transport = opts.url
    ? nodemailer.createTransport(opts.url)
    : nodemailer.createTransport({
        host: opts.host,
        port: opts.port ?? 587,
        secure: opts.secure ?? opts.port === 465,
        auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined,
        // Refuse to send credentials or reset links over an unencrypted link.
        requireTLS: !(opts.secure ?? opts.port === 465),
      });
  return {
    kind: 'smtp',
    async send(email) {
      await transport.sendMail({ from: opts.from, ...email });
    },
  };
}

export function createConsoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    kind: 'console',
    async send(email) {
      log(`\n──── email (not sent: MAIL_TRANSPORT=console) ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n──────────────────────────────────────────────────\n`);
    },
  };
}

/** The configured mailer, or null when email isn't set up (password reset is then hidden). */
export function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer | null {
  if (env.MAIL_TRANSPORT === 'console') return createConsoleMailer();
  if (!env.SMTP_URL && !env.SMTP_HOST) return null;
  if (!env.MAIL_FROM) throw new Error('MAIL_FROM must be set when SMTP is configured, e.g. "Add Call <no-reply@example.com>"');
  return createSmtpMailer({
    url: env.SMTP_URL,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
    secure: env.SMTP_SECURE === undefined ? undefined : env.SMTP_SECURE === 'true' || env.SMTP_SECURE === '1',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM,
  });
}
