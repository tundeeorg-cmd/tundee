'use client';

/**
 * Fires CompleteRegistration for signups that skipped the setup wizard.
 *
 * app/auth/callback writes the profile server-side when a visitor arrives from
 * /start with their answers and consent, then redirects straight to results —
 * so app/profile/setup, which is where the wizard fires its own
 * CompleteRegistration, is never mounted. This component covers that path by
 * reading the marker cookie the callback leaves behind.
 *
 * Exactly one of the two fires for any given signup: the callback only sets the
 * cookie on the branch that skips the wizard.
 */

import { useEffect } from 'react';
import { trackSignupComplete } from '@/lib/adTracking';
import {
  readSignupConversion,
  expireSignupConversionCookie,
} from '@/lib/analytics/signupConversion';

export default function SignupConversion() {
  useEffect(() => {
    const method = readSignupConversion(document.cookie);
    if (!method) return;

    // Delete first. If the event throws, or the page is closed mid-flight, the
    // worst case is a lost conversion — never a duplicated one, which would
    // quietly corrupt the ad-platform numbers this exists to make correct.
    document.cookie = expireSignupConversionCookie();

    trackSignupComplete(method);
  }, []);

  return null;
}
