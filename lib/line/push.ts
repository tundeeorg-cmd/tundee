/** LINE Messaging API client — no SDK dependency, just fetch. */

import { getLineChannelAccessToken } from '@/lib/line/env';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

export interface LineQuickReplyAction {
  type: 'action';
  action: {
    type: 'postback';
    label: string;
    data: string;
    displayText?: string;
  };
}

export interface LineTextMessage {
  type: 'text';
  text: string;
  quickReply?: { items: LineQuickReplyAction[] };
}

async function lineApiCall(url: string, body: Record<string, unknown>): Promise<void> {
  // Throws naming the variable and the console page it comes from.
  const token = getLineChannelAccessToken();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    throw new Error(`LINE API call failed (${res.status}): ${responseBody}`);
  }
}

/** Push a message to a user outside of a reply window (e.g. from a cron job). */
export async function linePush(
  lineUserId: string,
  messages: LineTextMessage[],
): Promise<void> {
  return lineApiCall(PUSH_URL, { to: lineUserId, messages });
}

/** Reply to an inbound webhook event using its replyToken. */
export async function lineReply(
  replyToken: string,
  messages: LineTextMessage[],
): Promise<void> {
  return lineApiCall(REPLY_URL, { replyToken, messages });
}
