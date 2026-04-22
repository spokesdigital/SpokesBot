import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDatasets() {
  const { data: { session } } = await supabase.auth.signInWithPassword({
    email: 'client@gmail.com',
    password: 'pass@123'
  })
  
  if (!session) {
    console.error('Failed to sign in')
    return
  }
  
  const res = await fetch('https://spokesbot.vercel.app/api/datasets/', {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  })
  const data = await res.json()
  console.log('Datasets found:', data.datasets.length)
  data.datasets.forEach((d: any) => {
    console.log(`- ${d.id} (${d.report_type}): mappings=`, d.metric_mappings)
  })
}

checkDatasets()
