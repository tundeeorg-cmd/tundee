/**
 * /api/send-reminders
 *
 * Vercel Cron job — runs daily at 09:00 Thailand time (02:00 UTC).
 * Finds users who have saved scholarships with deadlines within 7 days
 * and sends a reminder email via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY      — Resend API key
 *   CRON_SECRET         — shared secret Vercel sends in Authorization header
 *   NEXT_PUBLIC_SITE_URL — e.g. https://www.tundee.org
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'ทุนดี TunDee <reminders@tundee.org>';
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.tundee.org';

interface ReminderRow {
  user_id: string;
  email: string;
  scholarship_id: string;
  name_th: string;
  name_en: string | null;
  deadline_date: string;
  days_left: number;
}

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[send-reminders] RESEND_API_KEY not set — skipping');
    return NextResponse.json({ ok: true, skipped: true, reason: 'no RESEND_API_KEY' });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const today = new Date();
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const in7daysStr = in7days.toISOString().split('T')[0];

    // Find all saved/tracked scholarships with upcoming deadlines.
    // Join applications → scholarships → auth.users (via user_id → email from auth.users).
    // We use a raw SQL query via rpc or a view — here we query applications then fetch details.
    const { data: apps, error: appsErr } = await supabase
      .from('applications')
      .select(`
        user_id,
        scholarship_id,
        scholarships!inner (
          name_th,
          name_en,
          deadline_date
        )
      `)
      .neq('status', 'not_applying')
      .gte('scholarships.deadline_date', todayStr)
      .lte('scholarships.deadline_date', in7daysStr);

    if (appsErr) {
      console.error('[send-reminders] Query error:', appsErr.message);
      return NextResponse.json({ error: appsErr.message }, { status: 500 });
    }

    if (!apps || apps.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: 'No upcoming deadlines' });
    }

    // Group by user_id to send one email per user with all their reminders
    const byUser = new Map<string, typeof apps>();
    for (const app of apps) {
      const arr = byUser.get(app.user_id) ?? [];
      arr.push(app);
      byUser.set(app.user_id, arr);
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [userId, userApps] of Array.from(byUser.entries())) {
      // Fetch user email from auth.users via admin API
      const { data: adminUser, error: userErr } = await supabase.auth.admin.getUserById(userId);
      if (userErr || !adminUser?.user?.email) {
        errors.push(`user ${userId}: ${userErr?.message ?? 'no email'}`);
        continue;
      }

      const email = adminUser.user.email;

      // Build scholarship list for this user
      const schList = userApps.map((a) => {
        const s = a.scholarships as unknown as { name_th: string; name_en: string | null; deadline_date: string };
        const deadline = new Date(s.deadline_date);
        const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { name_th: s.name_th, name_en: s.name_en, deadline_date: s.deadline_date, days_left: daysLeft, id: a.scholarship_id };
      }).sort((a, b) => a.days_left - b.days_left);

      const subject = schList.length === 1
        ? `⏰ ทุน "${schList[0].name_th}" จะหมดเขตใน ${schList[0].days_left} วัน — TunDee`
        : `⏰ ${schList.length} ทุนกำลังจะหมดเขต — TunDee`;

      const scholarshipRows = schList.map((s) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #E5E5EA;">
            <a href="${SITE}/scholarships/${s.id}" style="color:#F0A500;font-weight:600;text-decoration:none;font-size:15px;">${s.name_th}</a>
            ${s.name_en ? `<div style="color:#6E6E73;font-size:13px;margin-top:2px;">${s.name_en}</div>` : ''}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #E5E5EA;text-align:right;white-space:nowrap;">
            <span style="background:${s.days_left <= 3 ? '#FEE2E2' : '#FEF3C7'};color:${s.days_left <= 3 ? '#DC2626' : '#D97706'};padding:3px 10px;border-radius:999px;font-size:13px;font-weight:600;">
              ${s.days_left} วัน
            </span>
            <div style="color:#6E6E73;font-size:12px;margin-top:4px;">${s.deadline_date}</div>
          </td>
        </tr>
      `).join('');

      const html = `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1D1D1F;padding:32px 40px;">
            <div style="display:inline-block;">
              <span style="color:#F0A500;font-size:26px;font-weight:700;">ทุนดี</span>
              <span style="color:#6E6E73;font-size:13px;letter-spacing:3px;display:block;margin-top:-2px;">TUNDEE</span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 24px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:#1D1D1F;font-weight:700;">⏰ ทุนใกล้หมดเขต</h1>
            <p style="margin:0 0 24px;color:#6E6E73;font-size:15px;line-height:1.6;">
              ทุนการศึกษาที่คุณบันทึกไว้กำลังจะหมดเขตใน 7 วัน อย่าลืมยื่นใบสมัครก่อนหมดเวลา
            </p>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <th style="text-align:left;padding-bottom:8px;color:#6E6E73;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">ทุนการศึกษา</th>
                <th style="text-align:right;padding-bottom:8px;color:#6E6E73;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">เหลืออีก</th>
              </tr>
              ${scholarshipRows}
            </table>

            <div style="margin-top:32px;text-align:center;">
              <a href="${SITE}/scholarships" style="display:inline-block;background:#F0A500;color:#1D1D1F;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;text-decoration:none;">
                ดูทุนทั้งหมด →
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #F2F2F7;text-align:center;">
            <p style="margin:0;color:#ADADB8;font-size:12px;line-height:1.6;">
              คุณได้รับอีเมลนี้เพราะบันทึกทุนไว้บน TunDee<br>
              <a href="${SITE}" style="color:#F0A500;text-decoration:none;">tundee.org</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from: FROM, to: [email], subject, html }),
      });

      if (res.ok) {
        sent++;
      } else {
        const err = await res.text();
        failed++;
        errors.push(`${email}: ${err}`);
      }
    }

    console.log(`[send-reminders] sent=${sent} failed=${failed}`);
    return NextResponse.json({ ok: true, sent, failed, errors: errors.slice(0, 10) });

  } catch (err) {
    console.error('[send-reminders] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
