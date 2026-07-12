# Setting Up Avatar Storage

## Step 1 — Create the bucket

1. Supabase Dashboard → **Storage** → **New bucket**
2. Name: `avatars`
3. **Public**: YES (toggle ON)
4. File size limit: `5242880` (5 MB)
5. Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`
6. Click **Save**

## Step 2 — Set Storage policy

Storage → Policies → **avatars** bucket → **New policy** → For full customization:

```sql
-- Allow authenticated users to upload/update/read their own avatar
CREATE POLICY "Users can manage own avatar"
ON storage.objects FOR ALL
TO authenticated
USING  ( bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text )
WITH CHECK ( bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text );
```

Paste this into the SQL editor and click **Run**.

## Step 3 — Run the profile columns migration

In Supabase → **SQL Editor**, run the contents of `scripts/add_profile_columns.sql`.
