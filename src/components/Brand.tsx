// Tony's Fit Habits logo. `mark` = the FH monogram (app header); `full` = with the wordmark.
export function Brand({ variant = 'mark' }: { variant?: 'mark' | 'full' }) {
  const src = `${import.meta.env.BASE_URL}brand/${variant === 'full' ? 'logo-full-sm.png' : 'logo-mark-sm.png'}`;
  return <img className={`brand-logo brand-${variant}`} src={src} alt="Fit Habits" />;
}
