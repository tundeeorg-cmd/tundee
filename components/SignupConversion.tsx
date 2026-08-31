'use client';

/**
 * Fires CompleteRegistration for signups that skipped the setup wizard.
 *
 * app/auth/callback and app/api/auth/password write the profile server-side
 * when a visitor arrives from /start with their answers and consent, then
 * redirect straight to results — so app/profile/setup, which is where the
 * wizard fires its own CompleteRegistration, is never mounted. This component
 * covers that path by reading the marker cookie the server left behind.
 *
 * Exactly one of the two fires for any given signup: the server only sets the
 * cookie on the branch that skips the wizard.
 *
 * The marker carries the browser the account was created IN, not the one
 * reading it. Those differ for anyone who escaped a webview into Chrome, and
 * that is the path we most need to measure.
 */

import { useEffect } from 'react';
import { trackSignupComplete } from '@/lib/adTracking';
import {
  readSignupConversion,
  expireSignupConversionCookie,
} from '@/lib/analytics/signupConversion';
import { logFunnelEvent } from '@/lib/research/funnel';

export default function SignupConversion() {
  useEffect(() => {
    const conversion = readSignupConversion(document.cookie);
    if (!conversion) return;

    // Delete first. If the event throws, or the page is closed mid-flight, the
    // worst case is a lost conversion — never a duplicated one, which would
    // quietly corrupt the ad-platform numbers this exists to make correct.
    document.cookie = expireSignupConversionCookie();

    trackSignupComplete(conversion);

    /**
     * The same completion, in our own funnel, labelled by method.
     *
     * The ad pixels above answer "did a signup happen"; this answers "which way
     * in actually works", which is the question the passwordless rebuild exists
     * to settle. 'email' here is the six-digit code — the only method that
     * completes without leaving the Facebook webview — and 'line' is the
     * one-tap path. Comparing the two by in_app_browser is how we find out
     * whether the webview escape is worth keeping.
     */
    logFunnelEvent({
      eventType: 'signup_completed',
      context: {
        method:         conversion.method === 'email' ? 'email_otp' : conversion.method,
        in_app_browser: conversion.inWebview,
        in_app_name:    conversion.app,
      },
    });
  }, []);

  return null;
}
