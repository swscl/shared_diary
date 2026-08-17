import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://thvgettphbzsxcnhhvsi.supabase.co'
const supabaseAnonKey = 'sb_publishable_ZHj3nhmNqy_xAR71xrFjuw_G1w8N7wD'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)