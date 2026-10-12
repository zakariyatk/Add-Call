/*
 * Writes the branded Supabase Auth email templates to supabase/templates/.
 * Paste each file into Supabase → Authentication → Emails (see README).
 *
 *   npx vite-node scripts/generate-email-templates.ts
 *
 * Links go to /#/verify/<token_hash> and /#/reset/<token_hash> in the app,
 * which confirm them with supabase.auth.verifyOtp — so they work on any device.
 * `{{ … }}` are Supabase (Go template) placeholders.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { brand } from '../src/branding/brand.config.ts';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const c = brand.colors.light;
const greeting = '{{ if .Data.name }}Hi {{ .Data.name }},{{ else if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi,{{ end }}';

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${c.background};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${c.surface};border:1px solid ${c.border};border-radius:${brand.theme.radius}px;">
<tr><td style="padding:32px;font-family:${esc(brand.theme.fontFamily)};color:${c.text};font-size:15px;line-height:1.5;">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${esc(brand.name)}</p>
${body}
</td></tr></table>
<p style="font-family:${esc(brand.theme.fontFamily)};color:${c.textMuted};font-size:12px;margin:16px 0 0;">${esc(brand.name)} · ${esc(brand.tagline)}</p>
</td></tr></table></body></html>
`;
}

const button = (link: string, label: string) =>
  `<p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:${c.accent};color:${c.accentInk};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${brand.theme.radius - 4}px;">${label}</a></p>
<p style="margin:0 0 8px;color:${c.textMuted};font-size:13px;">Or paste this link into your browser:<br><span style="word-break:break-all;">${link}</span></p>`;

const confirmLink = '{{ .SiteURL }}/#/verify/{{ .TokenHash }}';
const resetLink = '{{ .SiteURL }}/#/reset/{{ .TokenHash }}';

const templates: Record<string, { subject: string; html: string }> = {
  'confirm-signup': {
    subject: `Confirm your email for ${brand.name}`,
    html: layout(`<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 24px;">Welcome to ${esc(brand.name)}! Confirm this is your email address to start making calls.</p>
${button(confirmLink, 'Confirm my email')}
<p style="margin:16px 0 0;color:${c.textMuted};font-size:13px;">The link works once and expires in an hour. If you didn't create an account, ignore this email.</p>`),
  },
  'reset-password': {
    subject: `Reset your ${brand.name} password`,
    html: layout(`<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 24px;">Someone (hopefully you) asked to reset the password for your ${esc(brand.name)} account. The link below works once and expires in an hour.</p>
${button(resetLink, 'Choose a new password')}
<p style="margin:16px 0 0;color:${c.textMuted};font-size:13px;">If you didn't ask for this, ignore this email. Your password won't change.</p>`),
  },
  'password-changed': {
    subject: `Your ${brand.name} password was changed`,
    html: layout(`<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 16px;">The password for your ${esc(brand.name)} account was just changed, and other devices were signed out.</p>
<p style="margin:0;color:${c.textMuted};font-size:13px;">If this wasn't you, reset your password right away with "Forgot password?" at {{ .SiteURL }}</p>`),
  },
};

const dir = new URL('../supabase/templates/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(new URL(`${name}.html`, dir), t.html);
  console.log(`${name}.html  —  subject: ${t.subject}`);
}
