/**
 * /auth — the signup and sign-in screen.
 *
 * A SERVER component, deliberately. It reads the User-Agent from the request
 * and resolves the embedded-webview question before a single byte of HTML is
 * sent, then hands the answer to both the no-JS shell and the hydrated form.
 *
 * That ordering is the point. When this was a client component the page began
 * life as "not in a webview" and corrected itself in an effect, so a student in
 * the Facebook browser was served a Google button — one that Google refuses
 * with disallowed_useragent — and watched it disappear a moment later. The
 * server already knows; asking the browser was never necessary.
 */

import { Suspense } from 'react';
import { headers } from 'next/headers';
import { inspectUserAgent } from '@/lib/browser/inAppBrowser';
import AuthShell from './AuthShell';
import AuthForm from './AuthForm';

export const dynamic = 'force-dynamic';

export default async function AuthPage() {
  const iab = inspectUserAgent((await headers()).get('user-agent'));

  return (
    // AuthForm calls useSearchParams(), which makes Next bail out of SSR for
    // that subtree and render this fallback on the server instead. So the
    // fallback is a real, working page rather than a spinner: without any
    // JavaScript the email + password form still creates an account, because it
    // is a plain <form method="POST">. On a stalled 3G connection that is the
    // difference between a signup and a blank screen.
    <Suspense fallback={<AuthShell iab={iab} />}>
      <AuthForm initialIab={iab} />
    </Suspense>
  );
}
