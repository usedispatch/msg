import { supabaseClient } from '../_shared/supabaseClient.ts'

export const getMaxPostID = async (cluster: string, forum_id: string) => {
    const {data, error} = await supabaseClient.from(`postbox_post_id_${cluster}`)
        .select("*")
        .eq('forum_id', forum_id)
        .limit(1)
        .single()
    return data.max_child_id
}