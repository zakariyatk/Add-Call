import type { BrandConfig } from '../src/branding/brand.config.ts';
import type { Email } from './mailer.ts';

/*
 * Transactional emails, branded from the branding config. Plain-text and HTML
 * versions; the HTML uses inline styles and tables because email clients
 * ignore most CSS.
 */

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(brand: BrandConfig, body: string): string {
  const c = brand.colors.light;
  return `<!doctype html><html><body style="margin:0;padding:0;background:${c.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${c.surface};border:1px solid ${c.border};border-radius:${brand.theme.radius}px;">
<tr><td style="padding:32px;font-family:${esc(brand.theme.fontFamily)};color:${c.text};font-size:15px;line-height:1.5;">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${esc(brand.name)}</p>
${body}
</td></tr></table>
<p style="font-family:${esc(brand.theme.fontFamily)};color:${c.textMuted};font-size:12px;margin:16px 0 0;">${esc(brand.name)} · ${esc(brand.tagline)}</p>
</td></tr></table></body></html>`;
}

export function passwordResetEmail(brand: BrandConfig, to: { email: string; name: string }, link: string, validMinutes: number): Email {
  const c = brand.colors.light;
  return {
    to: to.email,
    subject: `Reset your ${brand.name} password`,
    text: [
      `Hi ${to.name},`,
      '',
      `Someone (hopefully you) asked to reset the password for your ${brand.name} account.`,
      `Open this link to choose a new one. It works once and expires in ${validMinutes} minutes:`,
      '',
      link,
      '',
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
    ].join('\n'),
    html: layout(
      brand,
      `<p style="margin:0 0 12px;">Hi ${esc(to.name)},</p>
<p style="margin:0 0 24px;">Someone (hopefully you) asked to reset the password for your ${esc(brand.name)} account. The link below works once and expires in ${validMinutes} minutes.</p>
<p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:${c.accent};color:${c.accentInk};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${brand.theme.radius - 4}px;">Choose a new password</a></p>
<p style="margin:0 0 8px;color:${c.textMuted};font-size:13px;">Or paste this link into your browser:<br><span style="word-break:break-all;">${esc(link)}</span></p>
<p style="margin:16px 0 0;color:${c.textMuted};font-size:13px;">If you didn't ask for this, ignore this email. Your password won't change.</p>`,
    ),
  };
}

export function passwordChangedEmail(brand: BrandConfig, to: { email: string; name: string }, appUrl: string): Email {
  const help = `If this wasn't you, reset your password right away with "Forgot password?" at ${appUrl}`;
  return {
    to: to.email,
    subject: `Your ${brand.name} password was changed`,
    text: [`Hi ${to.name},`, '', `The password for your ${brand.name} account was just changed, and other devices were signed out.`, '', help].join('\n'),
    html: layout(
      brand,
      `<p style="margin:0 0 12px;">Hi ${esc(to.name)},</p>
<p style="margin:0 0 16px;">The password for your ${esc(brand.name)} account was just changed, and other devices were signed out.</p>
<p style="margin:0;color:${brand.colors.light.textMuted};font-size:13px;">${esc(help)}</p>`,
    ),
  };
}
