import { Resend } from 'resend';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'Snapshot <no-reply@example.com>';
}

export async function sendTrialStartedEmail(email: string, trialEndsAt?: string | null) {
  const resend = getResendClient();
  if (!resend) {
    return;
  }

  await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject: 'Your Snapshot trial has started',
    html: `<p>Your 3-day Snapshot trial is active.</p><p>Trial ends: ${trialEndsAt ?? 'soon'}.</p>`,
  });
}

export async function sendPaymentFailedEmail(email: string) {
  const resend = getResendClient();
  if (!resend) {
    return;
  }

  await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject: 'Snapshot payment failed',
    html: '<p>Your latest Snapshot subscription payment failed. Update your payment method to keep access.</p>',
  });
}
