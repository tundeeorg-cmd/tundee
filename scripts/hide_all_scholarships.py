import os
from supabase import create_client

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or \
               os.environ.get('SUPABASE_URL')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SERVICE_KEY:
    raise ValueError(
        'Missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )

supabase = create_client(SUPABASE_URL, SERVICE_KEY)

# Count first so we know what we're hiding
count_resp = supabase.table('scholarships') \
    .select('id', count='exact') \
    .execute()
total = count_resp.count
print(f'About to hide {total} scholarships...')

# Set is_active = FALSE on ALL scholarships
result = supabase.table('scholarships') \
    .update({'is_active': False}) \
    .neq('id', '00000000-0000-0000-0000-000000000000') \
    .execute()

print(f'Done. All {total} scholarships hidden.')
print('They are NOT deleted — only hidden from public view.')
print()
print('To restore all scholarships, run this SQL in Supabase:')
print('  UPDATE scholarships SET is_active = TRUE;')
