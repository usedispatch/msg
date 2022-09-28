const SUPABASE_URL="https://aiqrzujttjxgjhumjcky.functions.supabase.co"
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjE0NzA5NjgsImV4cCI6MTk3NzA0Njk2OH0.qyDrAwwq1pyys4t12Klp7YWHCV05YRMj29Du2xRLKe8"
const axios = require('axios').default;

axios.defaults.headers.common["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
axios.defaults.headers.common["Content-Type"] = "application/json";
axios.defaults.baseURL = SUPABASE_URL;

export const getMaxChildId = async (cluster: string, forum_id: string): Promise<number> => {
    const requestBody = {
        "cluster": cluster,
        "forum_id": forum_id
    }
    const request = await axios.post(`/getMaxChildId`, requestBody)
        .catch((error: any) => {console.log(error)})
    return request.data.max_child_id
}

export const getNewChildId = async (cluster: string, forum_id: string): Promise<number> => {
    const requestBody = {
        "cluster": cluster,
        "forum_id": forum_id
    }

    const request = await axios.post(`/getNewChildId`, requestBody)
        .catch((error: any) => {console.log(error)})
    return request.data.new_child_id
}

export const addNewPostbox = async (cluster: string, forum_id: string) => {
    const requestBody = {
        "cluster": cluster,
        "forum_id": forum_id
    }



    const request = await axios.post(`/addNewPostbox`, requestBody)
        .catch((error: any) => {console.log(error)})
    return request.data
}
