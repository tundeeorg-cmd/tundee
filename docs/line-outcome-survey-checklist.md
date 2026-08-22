# LINE outcome survey — QA checklist

Covers the flow added in `scripts/20260822_v14_line_outcome_survey.sql`:
ask a student over LINE whether they got a scholarship, capture the amount and
research consent, and expose the result to the admin dashboard and research
export.

## 0. Prerequisites

- [ ] Run `scripts/20260822_v14_line_outcome_survey.sql` in Supabase (SQL editor).
      Verify `outcomes`, `survey_log` and `v_outcomes_research` exist.
- [ ] Confirm `survey_log` was backfilled from `outcome_followup_log`:
      `select count(*) from survey_log where state = 'done';` should match the
      old ledger's row count. **If this is 0 on a system that has sent
      follow-ups before, stop** — the first cron run would re-ask everyone.
- [ ] Server-only env vars set in Vercel: `LINE_CHANNEL_ACCESS_TOKEN`,
      `LINE_CHANNEL_SECRET`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
      Neither LINE value may be prefixed `NEXT_PUBLIC_`.
- [ ] Optional: `SURVEY_REASK_DAYS` (default 30),
      `SURVEY_MAX_PER_USER_PER_DAY` (default 1), `OUTCOME_OFFSETS` (default 30,60,90).
- [ ] Test account has `profiles.line_user_id` set and a `tracked_scholarship`
      row with `status` in (`applying`,`applied`) and `reminder_opt_in = true`.

## 1. The survey sends

- [ ] **Manual trigger.** /admin → 🎓 Outcomes → enter user ID + scholarship ID →
      **ส่งแบบสอบถาม**. Message 1 arrives in LINE with exactly four buttons:
      ได้รับทุนแล้ว 🎉 / ยังรอผลอยู่ / ไม่ได้สมัคร / ไม่ได้รับทุน.
- [ ] A `survey_log` row appears with `state='sent'`, `trigger_source='admin'`.
- [ ] An `outcomes` row appears with `status='unknown'`.
- [ ] **Cron.** With a deadline exactly 30 days ago:
      ```bash
      curl -H "Authorization: Bearer $CRON_SECRET" https://www.tundee.org/api/cron/line-outcomes
      ```
      Response reports `sent >= 1`; `trigger_source='cron'`.
- [ ] Same call without the bearer token returns 401.

## 2. Each of the four answers records correctly

Tap each on a fresh (user, scholarship) pair and check `outcomes`:

- [ ] **ได้รับทุนแล้ว** → `status='awarded'`, `source='line'`; the amount question
      arrives; `tracked_scholarship.status='awarded'`.
- [ ] **ยังรอผลอยู่** → `status='waiting'`; reply promises a re-ask;
      `survey_log.state='awaiting_reask'` with `reask_after` ≈ today + 30;
      `tracked_scholarship` is **unchanged**.
- [ ] **ไม่ได้สมัคร** → `status='not_applied'`; the reminder opt-in question
      arrives; `survey_log.state='awaiting_reminder_optin'`.
- [ ] **ไม่ได้รับทุน** → `status='rejected'`; supportive message mentions
      `tundee.org`; `survey_log.state='done'`.
- [ ] Every answer also writes an `event` row
      (`event_type='self_report_outcome'`, `outcome_source='self_report'`).

## 3. Amount + consent capture

- [ ] Answer **ได้รับทุนแล้ว**, then reply `50000` → `outcomes.amount_thb = 50000`,
      then the consent question arrives.
- [ ] `50,000`, `50000 บาท` and `๕๐๐๐๐` all parse to 50000.
- [ ] **Six-digit regression.** Reply `100000` → recorded as an amount, **not**
      swallowed as a 6-digit account link code. Confirm `profiles.line_user_id`
      was not rewritten.
- [ ] Free text (`ประมาณห้าหมื่น`) → re-prompt, `amount_thb` stays null, state
      stays `awaiting_amount`.
- [ ] **ข้าม** → skips straight to the consent question, `amount_thb` null.
- [ ] Consent **ยินดีค่ะ** → `consent_research=true`, `survey_log.state='done'`.
- [ ] Consent **ไม่สะดวกค่ะ** → `consent_research=false`, state `done`.
- [ ] Reminder opt-in **รับการแจ้งเตือน** → `tracked_scholarship.reminder_opt_in=true`.

## 4. Duplicates are prevented

- [ ] Tap the same quick reply twice → still exactly **one** row in `outcomes`
      for that (user_id, scholarship_id). `select count(*)` confirms.
- [ ] Change the answer (waiting → awarded) → the single row updates; latest
      answer wins; `reported_at` moves forward.
- [ ] Run the cron twice in a day → the second run sends nothing
      (`reasons['asked-recently']` or `['conversation-open']` > 0).
- [ ] A user asked 3 days ago is skipped; simulate a send 30+ days ago
      (`update survey_log set sent_at = now() - interval '31 days'`) and confirm
      they are asked again.
- [ ] With two eligible scholarships for one user and
      `SURVEY_MAX_PER_USER_PER_DAY=1`, only one push goes out.
- [ ] Verify the DB refuses two open conversations:
      inserting a second `survey_log` row with an open state for the same pair
      must violate `uniq_survey_log_open`.

## 5. Only consented rows export

- [ ] Seed one `consent_research=true` row and one `false` row.
- [ ] /admin → Outcomes → **Export consented CSV**. The `false` row is absent.
- [ ] `X-Record-Count` matches the consented count; `X-Export-Basis` is
      `PDPA-2562-consent`.
- [ ] No raw `user_id`, name, email or LINE id appears anywhere in the CSV —
      only 64-char SHA-256 pseudonyms.
- [ ] Hitting `/api/admin/outcomes/export` while signed out or as a non-admin
      returns 403.
- [ ] `select * from v_outcomes_research;` returns consented rows only.
- [ ] Flip a consented row to `false` → it disappears from both the view and the
      next export (PDPA s.33 erasure path).

## 6. Re-ask loop

- [ ] Answer **ยังรอผลอยู่**, then set `reask_after` to yesterday and run the
      cron → the survey is re-sent, `reasked >= 1`, the old row becomes
      `skipped`, and a new `sent` row appears with `attempt_no` incremented.

## Automated coverage

```bash
npx vitest run __tests__/lineSurvey.test.ts __tests__/lineSurveyWebhook.test.ts __tests__/lineOutcomesCron.test.ts __tests__/outcomesExport.test.ts
```

`lineSurvey` (33) covers copy, postback protocol, amount parsing, branch
routing, the 30-day guard and rate limiting. `lineSurveyWebhook` (19) covers
each answer end-to-end, amount + consent capture, idempotency and the six-digit
collision. `lineOutcomesCron` (12) covers auth, scheduling and the send guards.
`outcomesExport` (7) covers the PDPA gate.

---

# Admin Awards section — QA checklist

Covers `scripts/20260823_v15_admin_awards.sql` and /admin → 🎓 Awards / ผลการได้ทุน.

## 7. Setup

- [ ] Run `scripts/20260823_v15_admin_awards.sql` (after v12 and v14).
- [ ] `select * from v_admin_outcomes limit 5;` returns province, region and
      education_level alongside each outcome.
- [ ] Confirm `status` now accepts `applied` **and** `not_applied`:
      both inserts succeed, `'bogus'` is rejected by the CHECK.

## 8. Summary tiles

- [ ] Five tiles render: signups, apply-clicks, awarded, total THB, award rate.
- [ ] Total THB counts only `status='awarded'` rows and ignores null amounts.
- [ ] Award rate = awarded ÷ apply-clicks, one decimal.
- [ ] With zero apply-clicks the rate shows `—`, not `0.0%` or `NaN%`.

## 9. Filters and search

- [ ] Status filter narrows to that status only.
- [ ] Province and region filters work independently and together.
- [ ] Date range is inclusive at both ends (a row reported on the `to` date
      still appears).
- [ ] Search matches scholarship name, scholarship ID, display name **and email**.
- [ ] **Clear** resets all six controls and restores the full list.
- [ ] Filters carry through to the CSV — what you see is what you download.

## 10. Add outcome (manual)

- [ ] **➕ บันทึกผลทุน / Add outcome** → fill user ID, scholarship ID, status,
      amount → row appears in the table with source `Admin`.
- [ ] Saving the same user + scholarship again **updates** the row rather than
      creating a second one.
- [ ] `consent_research` is untouched by the admin form — verify in SQL that a
      manually-added row is still `false` unless the student granted it.
- [ ] Bad status → 422. Negative amount → 422. Unknown scholarship → 404.

## 11. Research CSV

- [ ] Export contains province, region, education level, scholarship, status,
      amount and dates.
- [ ] Only `consent_research = true` rows appear.
- [ ] The ID column is a 64-char SHA-256 hash — no raw UUID, name or email
      anywhere in the file.
- [ ] The same student exports to the same hash on two different days
      (rows stay linkable for the paper).

## 12. Bilingual + access

- [ ] Every label, filter, column header and button shows TH and EN.
- [ ] Signed out → /admin redirects; the API routes return 403.
- [ ] Signed in as a non-admin → same.

## Automated coverage

```bash
npx vitest run __tests__/adminAwards.test.ts __tests__/outcomesExport.test.ts
```

`adminAwards` (20) covers the award-rate maths, filter normalisation, search,
bilingual label completeness, the tiles route and the manual-add endpoint
(including that it can never grant consent). `outcomesExport` (7) covers the
PDPA gate and the research columns.
