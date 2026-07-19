/** LINE Messaging API push helper — no SDK dependency, just fetch. */

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export interface LineTextMessage {
  type: 'text';
  text: string;
}

export async function linePush(
  lineUserId: string,
  messages: LineTextMessage[],
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');

  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LINE push failed (${res.status}): ${body}`);
  }
}
