import { brand } from '../branding/brand.config';
import { logoSvg } from '../branding/logo';
import { themedLogoColors } from '../branding/theme';

// Built once from trusted config — not user input — so injecting it is safe.
const MARK = logoSvg(brand, { colors: themedLogoColors });

/** The Add Call mark, recoloured by the active theme. Decorative by default. */
export function LogoMark({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <span
      className="logo-mark"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: MARK }}
    />
  );
}

/** Mark + product name, as used in navigation and on the sign-in screen. */
export function Lockup({ size = 32 }: { size?: number }) {
  return (
    <span className="lockup" style={{ fontSize: size * 0.56 }}>
      <LogoMark size={size} />
      <span className="wordmark">{brand.name}</span>
    </span>
  );
}
