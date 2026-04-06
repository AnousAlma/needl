import { DriverApiError, driverApiBaseUrl, isDriverBackendConfigured } from './driverApi';

export type DonateServerStatus =
  | { kind: 'no_driver_url' }
  | { kind: 'unreachable' }
  | { kind: 'stripe_disabled' }
  | { kind: 'stripe_enabled' };

/**
 * Calls GET /v1/stripe/donate-status on the driver API.
 * Use this to tell “Stripe key missing on server” vs “can’t reach API”.
 */
export async function fetchDonateServerStatus(): Promise<DonateServerStatus> {
  if (!isDriverBackendConfigured()) return { kind: 'no_driver_url' };
  const url = `${driverApiBaseUrl()}/v1/stripe/donate-status`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const raw = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { kind: 'unreachable' };
    }
    if (!res.ok) return { kind: 'unreachable' };
    const enabled = Boolean(
      parsed && typeof parsed === 'object' && (parsed as { enabled?: unknown }).enabled === true,
    );
    return { kind: enabled ? 'stripe_enabled' : 'stripe_disabled' };
  } catch {
    return { kind: 'unreachable' };
  }
}

export async function createDonationCheckoutSession(
  idToken: string,
  params: { amountCents: number; successUrl: string; cancelUrl: string },
): Promise<string> {
  const url = `${driverApiBaseUrl()}/v1/stripe/create-donation-session`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      amountCents: params.amountCents,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    }),
  });
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (!res.ok) throw new DriverApiError(raw || res.statusText || 'Request failed', res.status);
    throw new DriverApiError('Invalid response from server', res.status);
  }
  if (!res.ok) {
    const err =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
    throw new DriverApiError(err, res.status);
  }
  const checkoutUrl =
    parsed && typeof parsed === 'object' && typeof (parsed as { url?: unknown }).url === 'string'
      ? (parsed as { url: string }).url
      : '';
  if (!checkoutUrl) {
    throw new DriverApiError('Server did not return a checkout URL');
  }
  return checkoutUrl;
}
