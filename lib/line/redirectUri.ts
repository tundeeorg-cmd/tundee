/**
 * Single source of truth for the LINE Login OAuth redirect_uri. Both the
 * authorize step (app/api/line/connect) and the token-exchange step
 * (app/api/line/callback) MUST call this and use the exact same string —
 * LINE requires byte-identical redirect_uri values between the two calls.
 */
export function getLineRedirectUri(): string {
  const configured = process.env.LINE_REDIRECT_URI;

  if (!configured) {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000/api/line/callback';
    }
    throw new Error(
      'LINE_REDIRECT_URI is not set. Add it to your environment (Vercel → Production ' +
      'and Preview) — see .env.example. It must be the exact URL registered in the ' +
      'LINE Developers Console → LINE Login channel → Callback URL.'
    );
  }

  const isLocalDev = process.env.NODE_ENV === 'development' && configured.startsWith('http://localhost');
  if (!configured.startsWith('https://') && !isLocalDev) {
    throw new Error(
      `LINE_REDIRECT_URI is set to "${configured}", which does not start with https://. ` +
      'LINE Login requires an HTTPS redirect_uri outside local development.'
    );
  }

  return configured;
}

/** LINE's bot_prompt param — see report item F for what "aggressive" requires. */
export function getLineBotPrompt(): 'normal' | 'aggressive' {
  const v = process.env.LINE_BOT_PROMPT;
  return v === 'aggressive' ? 'aggressive' : 'normal';
}
