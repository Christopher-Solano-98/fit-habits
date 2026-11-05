// Twilio (texts) and Resend (email). Each returns { ok, error } and reports
// "not configured" instead of throwing when its secrets aren't set yet.

export interface SendResult { ok: boolean; error?: string }

export function smsReady(): boolean {
  return Boolean(Deno.env.get('TWILIO_ACCOUNT_SID') && Deno.env.get('TWILIO_AUTH_TOKEN') && (Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || Deno.env.get('TWILIO_FROM')));
}

export function emailReady(): boolean {
  return Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM'));
}

export function e164(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? '+1' + d : '+' + d;
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  if (!smsReady()) return { ok: false, error: 'texting not configured' };
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const form = new URLSearchParams({ To: e164(to), Body: body });
  const svc = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  if (svc) form.set('MessagingServiceSid', svc); else form.set('From', Deno.env.get('TWILIO_FROM')!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  return res.ok ? { ok: true } : { ok: false, error: `twilio ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

export async function sendEmail(to: string, subject: string, text: string, replyTo?: string): Promise<SendResult> {
  if (!emailReady()) return { ok: false, error: 'email not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: [to], subject, text, reply_to: replyTo || undefined }),
  });
  return res.ok ? { ok: true } : { ok: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
}
