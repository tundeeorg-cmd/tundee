import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('scholarships')
    .update({ is_active: false })
    .lt('deadline_date', today)
    .eq('is_active', true)
    .select('id, name_th, deadline_date')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`Hidden ${data?.length || 0} expired scholarships`)
  return new Response(JSON.stringify({
    hidden: data?.length || 0,
    scholarships: data?.map(s => `${s.name_th} (${s.deadline_date})`),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
