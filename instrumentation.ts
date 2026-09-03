/**
 * Runs once when the server starts, before it serves anything.
 *
 * Next.js calls register() on boot. It is the only place in a Next app where
 * "check this before any request" is expressible — route handlers each run on
 * their first request, which is too late to be a startup check.
 *
 * What it is for: on 3 Sep 2026 the Messaging API channel secret was pasted
 * into LINE_LOGIN_CHANNEL_SECRET. Everything booted. The failure surfaced hours
 * later as an error from LINE's servers naming neither variable. A misplaced
 * value should be caught here, at deploy time, addressed to whoever is looking
 * at the log — not by a student who cannot sign in.
 *
 * The blast radius is deliberate and bounded, because a startup throw takes the
 * site down and that is a worse outcome than most misconfigurations:
 *
 *   throws  a value in the wrong slot (two secrets equal, two redirect URIs
 *           equal or swapped) — impossible in a correct deployment, so it
 *           cannot fire on one; and, in production only, a missing variable
 *           the LINE sign-in path needs, since that button is on /auth for
 *           every visitor and a deployment without it is broken for everyone.
 *
 *   logs    a missing bot variable. Reminders and account linking degrade
 *           rather than break, and app/api/line/callback records that
 *           LINE_REDIRECT_URI may never have been registered — refusing to
 *           boot over an unused linking flow would be the bigger outage.
 *
 * See lib/line/env.ts, which owns every LINE variable and all of these rules.
 */

export async function register(): Promise<void> {
  // Only the Node.js server runtime has the environment; the edge runtime
  // re-runs this file with a different subset and would report false gaps.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { validateLineEnvAtStartup } = await import('@/lib/line/env');
  validateLineEnvAtStartup();
}
