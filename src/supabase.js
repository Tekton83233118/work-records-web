import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && key && !url.includes('你的專案代碼'))
export const supabase = isConfigured ? createClient(url, key) : null