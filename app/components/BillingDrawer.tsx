'use client';

import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { X } from 'lucide-react';
import { trackClientEvent } from '@/lib/analytics-client';
import { useMessages } from '@/app/components/LocaleProvider';

interface BillingDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CheckoutResponse {
  clientSecret: string;
  publishableKey: string;
  setupIntentId: string;
}

function BillingForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const copy = useMessages();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: window.location.href,
      },
    });

    if (result.error) {
      setError(result.error.message || 'Payment setup failed');
      await trackClientEvent('billing_checkout_failed', {
        message: result.error.message || 'Payment setup failed',
      });
      setSubmitting(false);
      return;
    }

    const setupIntentId = result.setupIntent?.id;
    if (!setupIntentId) {
      setError('Payment setup did not complete correctly');
      setSubmitting(false);
      return;
    }

    const activation = await fetch('/api/billing/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ setupIntentId }),
    });
    const activationData = await activation.json();

    if (!activation.ok) {
      setError(activationData.error || 'Membership activation failed');
      await trackClientEvent('billing_checkout_failed', {
        message: activationData.error || 'Membership activation failed',
      });
      setSubmitting(false);
      return;
    }

    await trackClientEvent('billing_trial_started');
    onSuccess();
    onClose();
  };

  return (
    <div className="w-full max-w-md rounded-[2rem] bg-[#f8f4ee] p-6 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{copy.billing.title}</h2>
          <p className="mt-2 text-sm text-gray-500">{copy.billing.subtitle}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-black/5">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-6 space-y-3 rounded-3xl bg-white/80 p-4">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="font-medium text-gray-900">Snapshot Pro</span>
          <span className="rounded-full bg-black px-2 py-0.5 text-xs font-semibold text-white">{copy.billing.freeTrialBadge}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{copy.billing.subtotal}</span>
          <span>$9.90 / 月</span>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{copy.billing.trialCharge}</span>
          <span>$9.90</span>
        </div>
        <div className="border-t border-black/5 pt-3 text-base font-semibold text-gray-900 flex items-center justify-between">
          <span>{copy.billing.todayDue}</span>
          <span>$0.00</span>
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-white p-4">
        <PaymentElement />
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={() => void handleSubmit()}
        disabled={!stripe || !elements || submitting}
        className="mt-6 w-full rounded-full bg-[#1d1a15] px-5 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? copy.actions.processing : copy.actions.startFreeTrial}
      </button>
    </div>
  );
}

export function BillingDrawer({ open, onClose, onSuccess }: BillingDrawerProps) {
  const copy = useMessages();
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await trackClientEvent('billing_drawer_opened');

      if (!cancelled) {
        setError(null);
        setCheckout(null);
      }

      try {
        const res = await fetch('/api/billing/checkout', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to create checkout');
        }

        if (!cancelled) {
          setCheckout(data);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to create checkout');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const stripePromise = checkout?.publishableKey ? loadStripe(checkout.publishableKey) : null;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30 p-4 backdrop-blur-sm">
      <div className="max-h-[95vh] overflow-y-auto">
        {error && (
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-gray-900">{copy.billing.unavailableTitle}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-black/5">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-500">{error}</p>
          </div>
        )}

        {!error && checkout?.clientSecret && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: checkout.clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  borderRadius: '18px',
                  colorPrimary: '#1d1a15',
                },
              },
            }}
          >
            <BillingForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}

        {!error && !checkout && (
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <p className="text-sm text-gray-500">{copy.billing.initializing}</p>
          </div>
        )}
      </div>
    </div>
  );
}
