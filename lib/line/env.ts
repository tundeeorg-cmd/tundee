/**
 * Every LINE environment variable this app reads, in one file.
 *
 * WHY THIS EXISTS
 * ───────────────
 * On 3 Sep 2026 several hours were lost to this: the Messaging API channel
 * secret was pasted into LINE_LOGIN_CHANNEL_SECRET. Nothing noticed. The app
 * booted, the sign-in page rendered, the LINE button worked — and the token
 * exchange failed much later with an error from LINE's servers that named
 * neither variable. There was no way to tell from the symptom which of the two
 * similarly-named secrets was wrong.
 *
 * The variables are NOT duplicates and must not be merged:
 *
 *   LINE_CHANNEL_SECRET        Messaging API channel. Verifies the
 *                              x-line-signature HMAC on webhooks.
 *   LINE_LOGIN_CHANNEL_SECRET  LINE Login channel. The OAuth client_secret.
 *
 *   LINE_REDIRECT_URI          → /api/line/callback      (links LINE to an
 *                                existing account; entry /api/line/connect)
 *   LINE_AUTH_REDIRECT_URI     → /api/auth/line/callback (signs in / creates
 *                                the account; entry /api/auth/line/start)
 *
 * Two LINE channels issue two different secrets, and LINE requires redirect_uri
 * to be byte-identical between the authorize call and the token exchange — so
 * two flows landing on two routes need two values. Collapsing either pair
 * breaks whichever flow loses. See the table in app/api/line/callback/route.ts.
 *
 * What was missing was never a second variable. It was anything that noticed a
 * value sitting in the wrong slot. That is what assertLineEnvCoherent does, and
 * it is the reason this module exists rather than a scattering of
 * process.env.X reads.
 */

/** The variables this module owns, and how a human finds each one. */
const VARS = {
  LINE_CHANNEL_ACCESS_TOKEN: {
    what:  'Long-lived access token for the Messaging API channel — pushes and replies.',
    where: 'LINE Developers Console → your MESSAGING API channel → Messaging API tab → Channel access token',
  },
  LINE_CHANNEL_SECRET: {
    what:  'Messaging API channel secret — verifies the x-line-signature header on webhooks.',
    where: 'LINE Developers Console → your MESSAGING API channel → Basic settings → Channel secret',
  },
  LINE_LOGIN_CHANNEL_ID: {
    what:  'LINE Login channel id — the OAuth client_id.',
    where: 'LINE Developers Console → your LINE LOGIN channel → Basic settings → Channel ID',
  },
  LINE_LOGIN_CHANNEL_SECRET: {
    what:  'LINE Login channel secret — the OAuth client_secret. NOT the Messaging API secret.',
    where: 'LINE Developers Console → your LINE LOGIN channel (the one whose id is in '
         + 'LINE_LOGIN_CHANNEL_ID) → Basic settings → Channel secret',
  },
  LINE_REDIRECT_URI: {
    what:  'redirect_uri for LINKING a LINE account to an already signed-in user.',
    where: 'Must equal, byte for byte, a Callback URL registered in LINE Developers Console '
         + '→ LINE Login → Callback URL. Ends with /api/line/callback',
  },
  LINE_AUTH_REDIRECT_URI: {
    what:  'redirect_uri for SIGNING IN with LINE, which creates the account.',
    where: 'Must equal, byte for byte, a second Callback URL registered on the same channel. '
         + 'Ends with /api/auth/line/callback',
  },
} as const;

type LineVar = keyof typeof VARS;

/** Thrown for anything wrong with LINE configuration. Named so a startup crash
 *  is identifiable at a glance in the Vercel log. */
export class LineEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LineEnvError';
  }
}

/**
 * Read one variable, trimmed, with blank treated as absent.
 *
 * The trim is not cosmetic. A channel secret copied out of the LINE console
 * frequently carries a trailing newline, and Vercel's environment editor keeps
 * whatever it is given. An untrimmed secret produces an HMAC that never matches
 * and an OAuth call that is rejected as invalid_client — both of which look
 * exactly like having the WRONG secret, which is how an afternoon disappears.
 * '' is treated as unset for the same reason: an empty box in a dashboard means
 * "I did not fill this in", never "the value is the empty string".
 */
function read(name: LineVar): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Read, or throw naming the variable and where to find its value. */
function required(name: LineVar): string {
  const value = read(name);
  if (value) return value;

  const { what, where } = VARS[name];
  throw new LineEnvError(
    `${name} is not set.\n` +
    `  What it is:  ${what}\n` +
    `  Where to get it: ${where}\n` +
    `  Where to put it: Vercel → Settings → Environment Variables (Production AND Preview), ` +
    `or .env.local for local development. See .env.example.`,
  );
}

// ─── Accessors ───────────────────────────────────────────────────────────────
// The only places in the app that may touch process.env for a LINE value.

/** Messaging API push/reply token. */
export function getLineChannelAccessToken(): string {
  return required('LINE_CHANNEL_ACCESS_TOKEN');
}

/** Messaging API channel secret, for webhook signature verification. */
export function getLineMessagingChannelSecret(): string {
  return required('LINE_CHANNEL_SECRET');
}

/** LINE Login OAuth client_id. */
export function getLineLoginChannelId(): string {
  return required('LINE_LOGIN_CHANNEL_ID');
}

/** LINE Login OAuth client_secret. Not the Messaging API secret. */
export function getLineLoginChannelSecret(): string {
  return required('LINE_LOGIN_CHANNEL_SECRET');
}

/**
 * redirect_uri for the account-LINKING flow: /api/line/connect → /api/line/callback.
 *
 * Both ends of that flow must send the identical string; LINE compares them
 * byte for byte and rejects a mismatch as invalid_request.
 */
export function getLineRedirectUri(): string {
  return checkedRedirectUri('LINE_REDIRECT_URI', '/api/line/callback');
}

/**
 * redirect_uri for the SIGN-IN flow: /api/auth/line/start → /api/auth/line/callback.
 *
 * A different route from getLineRedirectUri above, registered separately in the
 * LINE console, and deliberately a separate variable.
 */
export function getLineAuthRedirectUri(): string {
  return checkedRedirectUri('LINE_AUTH_REDIRECT_URI', '/api/auth/line/callback');
}

/**
 * Shared body of the two accessors above.
 *
 * `expectedPath` is the anti-swap check. Setting each variable to the other's
 * value is a natural mistake — they differ by four characters — and produces a
 * failure on LINE's servers, after the redirect, where our logs cannot see it.
 * Here it is one string comparison at boot.
 */
function checkedRedirectUri(name: LineVar, expectedPath: string): string {
  const inDev = process.env.NODE_ENV === 'development';
  const configured = read(name);

  if (!configured) {
    // Local development runs against localhost without any LINE setup; the
    // flow cannot complete there anyway, so a default beats a crash.
    if (inDev) return `http://localhost:3000${expectedPath}`;
    return required(name);
  }

  const isLocalDev = inDev && configured.startsWith('http://localhost');
  if (!configured.startsWith('https://') && !isLocalDev) {
    throw new LineEnvError(
      `${name} is set to "${configured}", which does not start with https://.\n` +
      '  LINE Login requires an HTTPS redirect_uri outside local development.',
    );
  }

  if (!configured.endsWith(expectedPath)) {
    const other = name === 'LINE_REDIRECT_URI' ? 'LINE_AUTH_REDIRECT_URI' : 'LINE_REDIRECT_URI';
    throw new LineEnvError(
      `${name} is set to "${configured}", which does not end with ${expectedPath}.\n` +
      `  What it is: ${VARS[name].what}\n` +
      `  These two variables are easy to swap — check whether this value belongs in ${other}.`,
    );
  }

  return configured;
}

/**
 * LINE's "add as friend" prompt style during login.
 *
 * Defaults to 'aggressive', which invites the student to add the TunDee official
 * account — the friendship app/api/cron/line-reminders needs to reach them
 * before a scholarship deadline closes. Declining still completes the sign-in.
 * Has no effect unless the Login channel has a Linked OA configured.
 */
export function getLineBotPrompt(): 'normal' | 'aggressive' {
  return process.env.LINE_BOT_PROMPT?.trim() === 'normal' ? 'normal' : 'aggressive';
}

// ─── Coherence ───────────────────────────────────────────────────────────────

/**
 * Catch values that are present but in the wrong slot.
 *
 * Distinct from "is it missing", and far more valuable: a missing variable
 * announces itself the first time the feature runs, while a plausible value in
 * the wrong box fails somewhere else entirely, hours later, in someone else's
 * error message.
 *
 * Only compares values that are actually set, so a partly-configured
 * development machine trips nothing. Every check here is a definite
 * misconfiguration — there is no legitimate deployment that fails one.
 */
export function assertLineEnvCoherent(): void {
  const problems: string[] = [];

  const messagingSecret = read('LINE_CHANNEL_SECRET');
  const loginSecret     = read('LINE_LOGIN_CHANNEL_SECRET');

  // The 3 Sep 2026 outage, exactly. Two channels never issue the same secret,
  // so equality can only mean one value was pasted into both boxes.
  if (messagingSecret && loginSecret && messagingSecret === loginSecret) {
    problems.push(
      'LINE_CHANNEL_SECRET and LINE_LOGIN_CHANNEL_SECRET hold the SAME value.\n' +
      '    They belong to two different LINE channels and can never legitimately match.\n' +
      `    LINE_CHANNEL_SECRET:       ${VARS.LINE_CHANNEL_SECRET.where}\n` +
      `    LINE_LOGIN_CHANNEL_SECRET: ${VARS.LINE_LOGIN_CHANNEL_SECRET.where}`,
    );
  }

  const linkUri = read('LINE_REDIRECT_URI');
  const authUri = read('LINE_AUTH_REDIRECT_URI');

  if (linkUri && authUri && linkUri === authUri) {
    problems.push(
      'LINE_REDIRECT_URI and LINE_AUTH_REDIRECT_URI hold the SAME value.\n' +
      '    They are two different callback routes, registered separately in the LINE console:\n' +
      '    LINE_REDIRECT_URI      must end with /api/line/callback      (account linking)\n' +
      '    LINE_AUTH_REDIRECT_URI must end with /api/auth/line/callback (sign-in)',
    );
  }

  // Suffix checks, which catch the two values swapped. Skipped when unset so an
  // absent variable is reported once, as missing, rather than twice.
  if (linkUri && !linkUri.endsWith('/api/line/callback')) {
    problems.push(
      `LINE_REDIRECT_URI is "${linkUri}", which does not end with /api/line/callback.\n` +
      '    Check whether this value belongs in LINE_AUTH_REDIRECT_URI.',
    );
  }
  if (authUri && !authUri.endsWith('/api/auth/line/callback')) {
    problems.push(
      `LINE_AUTH_REDIRECT_URI is "${authUri}", which does not end with /api/auth/line/callback.\n` +
      '    Check whether this value belongs in LINE_REDIRECT_URI.',
    );
  }

  if (problems.length) {
    throw new LineEnvError(
      'LINE environment variables are misconfigured:\n\n' +
      problems.map((p, i) => `  ${i + 1}. ${p}`).join('\n\n') +
      '\n\nNothing was started. Fix the values above in Vercel → Settings → ' +
      'Environment Variables (Production AND Preview), then redeploy.',
    );
  }
}

/**
 * Variables the LINE sign-in path needs. That button is on /auth for every
 * visitor, so a deployment missing any of these is broken for everyone and
 * should not come up.
 */
const REQUIRED_FOR_LOGIN: readonly LineVar[] = [
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_AUTH_REDIRECT_URI',
];

/**
 * Variables the bot needs: deadline reminders, the webhook, account linking.
 *
 * Reported but NOT fatal, deliberately. These power features that degrade
 * rather than break — reminders stop, the /tracker link button errors — and
 * app/api/line/callback records that LINE_REDIRECT_URI may never have been
 * registered at all. Refusing to boot the whole site over an unused linking
 * flow would be a worse outage than the one it prevents.
 */
const REQUIRED_FOR_BOT: readonly LineVar[] = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_REDIRECT_URI',
];

function missingFrom(names: readonly LineVar[]): LineVar[] {
  return names.filter((n) => !read(n));
}

/**
 * The startup check. Called once from instrumentation.ts, before any request.
 *
 * Throws on incoherence in every environment, and on a missing sign-in variable
 * in production. Development is allowed to run without LINE configured at all —
 * the flow cannot complete against localhost regardless, and making every
 * contributor hold production secrets to run `next dev` is its own problem.
 */
export function validateLineEnvAtStartup(): void {
  assertLineEnvCoherent();

  const forBot = missingFrom(REQUIRED_FOR_BOT);
  if (forBot.length) {
    console.error(
      '[line/env] LINE bot features are not configured. Deadline reminders, the ' +
      'webhook and account linking will not work:\n' +
      forBot.map((n) => `  ${n} — ${VARS[n].what}\n    ${VARS[n].where}`).join('\n'),
    );
  }

  if (process.env.NODE_ENV !== 'production') return;

  const forLogin = missingFrom(REQUIRED_FOR_LOGIN);
  if (forLogin.length) {
    throw new LineEnvError(
      'LINE sign-in cannot start — required environment variables are missing:\n\n' +
      forLogin.map((n) => `  ${n}\n    What it is: ${VARS[n].what}\n    Where: ${VARS[n].where}`).join('\n\n') +
      '\n\nSet them in Vercel → Settings → Environment Variables (Production AND ' +
      'Preview), then redeploy. See .env.example.',
    );
  }

  // Force the redirect-URI format checks now rather than at first sign-in.
  getLineAuthRedirectUri();
}
