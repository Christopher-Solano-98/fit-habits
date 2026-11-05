import type { IntakeAnswers } from './types.ts';
import { PARQ_QUESTIONS } from './parq.ts';

// Shown until the trainer pastes their own waiver in Settings.
export const DEFAULT_WAIVER =
  'I understand that physical training involves risk of injury. I confirm the health information above is true and complete, I will tell my trainer about any changes to my health, and I take part voluntarily and accept these risks.';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const paras = (s: string) => s.split(/\n{2,}|\r\n\r\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

/** The signed waiver as a standalone HTML document, saved to the client's files when they submit their intake. */
export function signedWaiverHtml(o: { business: string; clientName: string; waiverText: string; answers: IntakeAnswers }): string {
  const a = o.answers;
  const signed = new Date(a.signedAt);
  const when = signed.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const parq = PARQ_QUESTIONS.map((q, i) => `<tr><td>${i + 1}. ${esc(q)}</td><td class="${a.parq[i] ? 'yes' : ''}">${a.parq[i] ? 'Yes' : 'No'}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signed waiver: ${esc(o.clientName)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;color:#15171C;max-width:680px;margin:0 auto;padding:24px;line-height:1.5}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#3D434D}.muted{color:#5E6470;font-size:14px}.sig{border:1px solid #D8D5CC;border-radius:10px;padding:14px 16px;margin-top:12px}.sig strong{font-size:20px;font-family:Georgia,serif;font-style:italic}table{width:100%;border-collapse:collapse;font-size:14px}td{border-bottom:1px solid #EEE;padding:8px 4px;vertical-align:top}td:last-child{width:48px;text-align:right;font-weight:600}td.yes{color:#8F3F00}</style></head><body>
<h1>${esc(o.business)}: waiver and release</h1>
<div class="muted">Client: ${esc(o.clientName)}</div>
<h2>Waiver</h2>${paras(o.waiverText)}
<div class="sig"><div class="muted">Agreed to the waiver and signed by typing their full name</div><strong>${esc(a.signature)}</strong><div class="muted">${esc(when)}</div></div>
<h2>Health questions (PAR-Q+)</h2><table>${parq}</table>
<h2>Medical history</h2><p><b>Current:</b> ${esc(a.medicalCurrent || 'None given')}</p><p><b>Past:</b> ${esc(a.medicalPast || 'None given')}</p>
<h2>Emergency contact</h2><p>${esc(a.emergencyName || 'None given')}${a.emergencyPhone ? ' · ' + esc(a.emergencyPhone) : ''}</p>
</body></html>`;
}
