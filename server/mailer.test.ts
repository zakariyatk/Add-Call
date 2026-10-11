import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { brand } from '../src/branding/brand.config.ts';
import { passwordResetEmail } from './emails.ts';
import { createConsoleMailer, createSmtpMailer, mailerFromEnv } from './mailer.ts';

let smtp: SMTPServer | null = null;
afterEach(() => new Promise<void>((r) => (smtp ? smtp.close(() => r()) : r())));

describe('SMTP mailer', () => {
  it('delivers a branded reset email over SMTP with authentication', async () => {
    const received: { from: string; to: string[]; data: string; user?: string }[] = [];
    smtp = new SMTPServer({
      secure: false,
      authOptional: false,
      allowInsecureAuth: true, // local test server without TLS
      disabledCommands: ['STARTTLS'],
      onAuth: (auth, _session, cb) => (auth.username === 'mailuser' && auth.password === 'mailpass' ? cb(null, { user: auth.username }) : cb(new Error('bad auth'))),
      onData(stream, session, cb) {
        let data = '';
        stream.on('data', (c) => (data += c));
        stream.on('end', () => {
          received.push({ from: (session.envelope.mailFrom as { address: string }).address, to: session.envelope.rcptTo.map((r) => r.address), data, user: session.user as string });
          cb();
        });
      },
    });
    await new Promise<void>((r) => smtp!.listen(0, '127.0.0.1', r));
    const port = (smtp.server.address() as AddressInfo).port;

    // requireTLS is on for real providers; this local server has no TLS, so use the URL form with it off.
    const mailer = createSmtpMailer({ url: `smtp://mailuser:mailpass@127.0.0.1:${port}?ignoreTLS=true`, from: 'Add Call <no-reply@call.example.com>' });
    await mailer.send(passwordResetEmail(brand, { email: 'ann@example.com', name: 'Ann' }, 'https://call.example.com/#/reset/abc', 60));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ from: 'no-reply@call.example.com', to: ['ann@example.com'], user: 'mailuser' });
    expect(received[0].data).toContain('Subject: Reset your Add Call password');
    expect(received[0].data).toContain('https://call.example.com/#/reset/abc');
    expect(received[0].data).toMatch(/Content-Type: text\/html/);
  });
});

describe('mailerFromEnv', () => {
  it('is off without SMTP settings, and needs MAIL_FROM with them', () => {
    expect(mailerFromEnv({})).toBeNull();
    expect(() => mailerFromEnv({ SMTP_HOST: 'smtp.example.com' })).toThrow(/MAIL_FROM/);
    expect(mailerFromEnv({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'x@example.com' })?.kind).toBe('smtp');
    expect(mailerFromEnv({ MAIL_TRANSPORT: 'console' })?.kind).toBe('console');
  });

  it('console mode prints the message instead of sending', async () => {
    const lines: string[] = [];
    await createConsoleMailer((l) => lines.push(l)).send({ to: 'a@b.co', subject: 'Hi', text: 'Body', html: '<p>Body</p>' });
    expect(lines.join('')).toMatch(/To: a@b\.co[\s\S]*Subject: Hi[\s\S]*Body/);
  });
});

describe('email templates', () => {
  it('escapes names and keeps both text and HTML parts', () => {
    const m = passwordResetEmail(brand, { email: 'x@y.z', name: '<script>Eve</script>' }, 'https://a.example/#/reset/t', 60);
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&#60;script&#62;Eve');
    expect(m.text).toContain('Hi <script>Eve</script>,');
  });
});
