import { describe, expect, it } from 'vitest';
import { generatedFiles } from '../../vite.brand';
import { brand } from './brand.config';
import { deleteAccountPage, privacyPage } from './legal';

describe('privacy policy and account deletion pages', () => {
  it('are built with the site', () => {
    const files = generatedFiles(brand);
    expect(files['privacy.html'].body).toBe(privacyPage(brand));
    expect(files['delete-account.html'].body).toBe(deleteAccountPage(brand));
    expect(files['privacy.html'].type).toMatch(/^text\/html/);
  });

  it.each([
    ['privacy', privacyPage],
    ['delete-account', deleteAccountPage],
  ] as const)('%s names the product and a way to reach us', (_, render) => {
    const html = render(brand);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain(brand.name);
    expect(html).toContain(`mailto:${brand.supportEmail}`);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/delete-account"');
  });

  it('says how to delete an account in the app, and the last update', () => {
    expect(privacyPage(brand)).toContain('Settings → Account → Delete account');
    expect(deleteAccountPage(brand)).toContain('<strong>Delete account</strong>');
    expect(privacyPage(brand)).toContain(String(new Date(brand.privacyUpdated).getUTCFullYear()));
  });

  it('escapes the configured text', () => {
    const html = privacyPage({ ...brand, name: 'A <b> & C', operator: '"Us"' });
    expect(html).toContain('A &#60;b&#62; &#38; C');
    expect(html).not.toContain('A <b> & C');
    expect(html).toContain('&#34;Us&#34;');
  });
});
