const SUPABASE_URL = 'https://aiqrzujttjxgjhumjcky.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjE0NzA5NjgsImV4cCI6MTk3NzA0Njk2OH0.qyDrAwwq1pyys4t12Klp7YWHCV05YRMj29Du2xRLKe8';
import {createClient} from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const getMaxChildId = async (cluster: string, forumID: string): Promise<number> => {
  const requestBody = {
    clusterName: cluster,
    forum_id: forumID,
  };
  
  if (cluster === 'mainnet-beta') {
    requestBody.clusterName = 'mainnet';
  }


  const {data, error} = await supabase.from(`ro_view_postbox_post_id_${requestBody.clusterName}`)
    .select("*")
    .eq('forum_id', forumID)
    .limit(1)
    .single()
  
  return data.max_child_id
};

export const updateAndGetNewChildId = async (cluster: string, forumID: string): Promise<number> => {
  const requestBody = {
    clusterName: cluster,
    forum_id: forumID,
  };

  if (cluster === 'mainnet-beta') {
    requestBody.clusterName = 'mainnet';
  }
  const { data, error } = await supabase.rpc(`increment_max_child_${requestBody.clusterName}`, { forum_id_key: forumID })
  return data;
};

export const addNewPostbox = async (cluster: string, forumID: string): Promise<void> => {
  const requestBody = {
    clusterName: cluster,
    forum_id: forumID,
  };

  if (cluster === 'mainnet-beta') {
    requestBody.clusterName = 'mainnet';
  }

  await supabase.rpc(`add_postbox_${requestBody.clusterName}`, { forum_id_key: forumID });

  return;
};
