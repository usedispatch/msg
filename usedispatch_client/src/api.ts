const SUPABASE_URL = 'https://aiqrzujttjxgjhumjcky.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjE0NzA5NjgsImV4cCI6MTk3NzA0Njk2OH0.qyDrAwwq1pyys4t12Klp7YWHCV05YRMj29Du2xRLKe8';
import { createClient } from '@supabase/supabase-js';
import * as web3 from '@solana/web3.js';
import { ForumInfo } from './forum';
import { FORUM_IMAGE_URL } from './constants';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const getNormalizedCluster = (cluster: web3.Cluster) => {
  return cluster === 'mainnet-beta' ? 'mainnet' : cluster;
};

export const getMaxChildId = async (cluster: web3.Cluster, forumID: web3.PublicKey): Promise<number> => {
  const { data, error } = await supabase
    .from(`ro_view_postbox_post_id_${getNormalizedCluster(cluster)}`)
    .select('*')
    .eq('forum_id', forumID.toBase58())
    .limit(1)
    .single();
  return data.max_child_id;
};

export const updateAndGetNewChildId = async (cluster: web3.Cluster, forumID: web3.PublicKey): Promise<number> => {
  const { data, error } = await supabase.rpc(`increment_max_child_${getNormalizedCluster(cluster)}`, {
    forum_id_key: forumID.toBase58(),
  });
  return data;
};

export const addNewPostbox = async (cluster: web3.Cluster, forumID: web3.PublicKey): Promise<void> => {
  await supabase.rpc(`add_postbox_${getNormalizedCluster(cluster)}`, { forum_id_key: forumID.toBase58() });
};

export const createNewForum = async (cluster: web3.Cluster, forumInfo: ForumInfo ): Promise<void> => {
  const info = {
    forum_id_key: forumInfo.collectionId.toBase58(),
    vanity_url_key: forumInfo.collectionId.toBase58(),
    forum_name_key: forumInfo.title,
    forum_desc_key: forumInfo.description,
    forum_image_url_key: FORUM_IMAGE_URL,
    show_forum_key: true,
    featured_forum_key: false,
  }
  await supabase.rpc(`create_new_forum_${getNormalizedCluster(cluster)}`, info);
}

export const addSolanartMap = async (cluster: web3.Cluster, solanart_id: string, forumID: web3.PublicKey): Promise<void> => {
  await supabase.rpc(`add_solanart_${getNormalizedCluster(cluster)}`, { solanart_id_key: solanart_id, forum_id_key: forumID.toBase58() });
}

export const getForumIdFromSolanartId = async (cluster: web3.Cluster, solanart_id: string): Promise<string> => {
  try {
  const { data, error } = await supabase
    .from(`ro_view_solanart_${getNormalizedCluster(cluster)}`)
    .select('*')
    .eq('solanart_id', solanart_id)
    .limit(1)
    .single();
  return data.forum_id;
  } catch (e) {
    // add new ID if not found
    if (e.code == 406) {
      await addSolanartMap(cluster, solanart_id, new web3.PublicKey(solanart_id));
    }
  }

}
