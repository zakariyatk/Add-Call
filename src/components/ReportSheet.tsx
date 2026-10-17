import { useState, type FormEvent } from 'react';
import { brand } from '../branding/brand.config';
import { blockUser, REPORT_DETAILS_MAX, REPORT_REASONS, reportUser, type ReportReason } from '../people/blocks';
import type { Person } from '../profile/username';
import { Icon } from './Icon';

/**
 * Reports someone (or one of their messages) to the team, and offers to block
 * them at the same time. They're never told who reported them.
 */
export function ReportSheet({
  person,
  messageId,
  blocked,
  onClose,
}: {
  person: Person;
  /** The message being reported, if any. */
  messageId?: string;
  /** Already blocked (then there's no "Also block" option). */
  blocked: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(!blocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sent; true when they were blocked along with it. */
  const [sent, setSent] = useState<{ blocked: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return setError('Choose a reason.');
    setBusy(true);
    setError(null);
    try {
      await reportUser(person.id, reason, details, messageId);
      const block = alsoBlock && !blocked;
      if (block) await blockUser(person);
      setSent({ blocked: block });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
    } finally {
      setBusy(false);
    }
  };

  const title = messageId ? 'Report message' : `Report ${person.name}`;
  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet report-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="report-done" role="status">
            <span className="report-done-icon">
              <Icon name="check" size={26} />
            </span>
            <p className="report-done-title">Thanks for letting us know</p>
            <p className="muted">
              The {brand.name} team will review it. {person.name} won’t know you reported them.
              {sent.blocked && ` You blocked ${person.name}: they can’t call or message you.`}
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="sheet-title">{title}</p>
            <p className="report-intro muted">
              {messageId ? `The message and who sent it go to the ${brand.name} team.` : `Tell the ${brand.name} team what’s wrong.`} {person.name} won’t
              know you reported them.
            </p>
            <fieldset className="report-reasons">
              <legend className="visually-hidden">Reason</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className="report-reason">
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => (setReason(r.id), setError(null))} />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="field report-details">
              <span>Details (optional)</span>
              <textarea
                rows={3}
                maxLength={REPORT_DETAILS_MAX}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What happened?"
              />
            </label>
            {!blocked && (
              <label className="report-block">
                <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
                <span>Also block {person.name}</span>
              </label>
            )}
            {error && (
              <p role="alert" className="form-error report-error">
                {error}
              </p>
            )}
            <div className="report-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-danger-fill" disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
