// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.131.0/http/server.ts"
import { getMaxPostID } from '../_shared/getMaxPostID.ts'
import { supabaseClient } from '../_shared/supabaseClient.ts'
import { corsHeaders } from '../_shared/cors.ts'


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const { cluster, forum_id } = await req.json()
  const data = {
    message: `Hello ${cluster}! ${forum_id}`,
  }


  try {
    // Set the Auth context of the user that called the function.
    // This way your row-level-security (RLS) policies are applied.
    supabaseClient.auth.setAuth(req.headers.get('Authorization')!.replace('Bearer ', ''))
    const maxChildId = await getMaxPostID(cluster, forum_id);

    return new Response(JSON.stringify({ max_child_id: maxChildId }), {
      headers: {...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: "Forum ID Doesn't Exist" }), {
      headers: {...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

// To invoke:
// curl --request POST 'https:/aiqrzujttjxgjhumjcky.functions.supabase.co/getMaxChildId' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjE0NzA5NjgsImV4cCI6MTk3NzA0Njk2OH0.qyDrAwwq1pyys4t12Klp7YWHCV05YRMj29Du2xRLKe8' \
//   --header 'Content-Type: application/json' \
//   --data '{"cluster":"mainnet", "forum_id": "XtWURxiTuv1eYEhSSuBgKJFfwfnG6BUkFcuCaB2qyu6"}'