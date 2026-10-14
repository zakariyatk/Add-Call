import { useEffect, useState, type FormEvent } from 'react';
import { checkUsername, normalizeUsername, saveUsername, USERNAME_MAX, usernameProblem } from '../profile/username';

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad' | 'error'; text: string };

/** Pick a username: live "available / taken" check as you type, then save. */
export function UsernameForm({
  me,
  initial,
  current,
  submitLabel,
  onSaved,
  onCancel,
}: {
  me: { email: string };
  initial: string;
  /** Your username now (it counts as available). */
  current?: string | null;
  submitLabel: string;
  onSaved: (username: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [check, setCheck] = useState<Check>({ state: 'idle', text: '' });
  const [saving, setSaving] = useState(false);
  const u = normalizeUsername(value);

  // Ask the server once typing pauses.
  useEffect(() => {
    if (!u) return setCheck({ state: 'idle', text: '' });
    const local = usernameProblem(u);
    if (local) return setCheck({ state: 'bad', text: local });
    if (u === current) return setCheck({ state: 'ok', text: 'This is your username.' });
    setCheck({ state: 'checking', text: 'Checking…' });
    let live = true;
    const t = setTimeout(() => {
      checkUsername(u).then(
        (problem) => live && setCheck(problem ? { state: 'bad', text: problem } : { state: 'ok', text: `@${u} is available.` }),
        () => live && setCheck({ state: 'error', text: 'Couldn’t check right now. You can still try to save.' }),
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [u, current]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (check.state === 'bad' || check.state === 'checking' || !u) return;
    if (u === current) return onSaved(u);
    setSaving(true);
    try {
      onSaved(await saveUsername(u, me));
    } catch (err) {
      setCheck({ state: 'bad', text: err instanceof Error ? err.message : 'Could not save your username.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="username-form" onSubmit={submit} noValidate>
      <label className="field">
        <span>Username</span>
        <span className={`handle-input is-${check.state}`}>
          <span className="handle-at" aria-hidden="true">
            @
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/^@+/, ''))}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            maxLength={USERNAME_MAX + 1}
            placeholder="your.name"
            aria-invalid={check.state === 'bad' ? true : undefined}
            aria-describedby="username-status"
            autoFocus
          />
        </span>
        <span id="username-status" className={`field-hint username-status is-${check.state}`} role="status">
          {check.text || 'Letters, numbers, periods and underscores. People use it to find and call you.'}
        </span>
      </label>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || !u || check.state === 'bad' || check.state === 'checking'}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
