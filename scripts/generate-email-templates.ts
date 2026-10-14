/*
 * Writes the branded Supabase Auth email templates to supabase/templates/.
 * Paste each file into Supabase → Authentication → Emails (see README).
 *
 *   npx vite-node scripts/generate-email-templates.ts
 *
 * People sign in with the {{ .Token }} code. The button goes to
 * /#/verify/<token_hash> in the app, which signs in with supabase.auth.verifyOtp
 * on whichever device opens it.
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
  `<p style="margin:0 0 16px;"><a href="${link}" style="display:inline-block;background:${c.accent};color:${c.accentInk};text-decoration:none;font-weight:600;padding:12px 20px;border-radius:${brand.theme.radius - 4}px;">${label}</a></p>`;

/** The code, large and easy to copy; phones also offer it above the keyboard. */
const code = `<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,Consolas,monospace;">{{ .Token }}</p>`;

const signInLink = '{{ .SiteURL }}/#/verify/{{ .TokenHash }}';

const codeEmail = (intro: string) =>
  layout(`<p style="margin:0 0 12px;">${greeting}</p>
<p style="margin:0 0 16px;">${intro}</p>
${code}
<p style="margin:0 0 16px;color:${c.textMuted};font-size:13px;">Or, on this device, tap:</p>
${button(signInLink, `Sign in to ${esc(brand.name)}`)}
<p style="margin:16px 0 0;color:${c.textMuted};font-size:13px;">The code works once and expires in an hour. If you didn't ask for it, ignore this email.</p>`);

// Supabase sends "Confirm signup" to new addresses and "Magic link" to existing
// accounts; both carry the same code.
const templates: Record<string, { subject: string; html: string }> = {
  'confirm-signup': {
    subject: `{{ .Token }} is your ${brand.name} code`,
    html: codeEmail(`Welcome to ${esc(brand.name)}! Enter this code to finish signing up:`),
  },
  'magic-link': {
    subject: `{{ .Token }} is your ${brand.name} code`,
    html: codeEmail(`Enter this code to sign in to ${esc(brand.name)}:`),
  },
};

const dir = new URL('../supabase/templates/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(new URL(`${name}.html`, dir), t.html);
  console.log(`${name}.html  —  subject: ${t.subject}`);
}
