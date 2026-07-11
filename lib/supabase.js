import { createClient } from '@supabase/supabase-js'
import { getEmpresaId } from './empresa'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers)
      const empresaId = typeof window !== 'undefined' ? getEmpresaId() : null
      if (empresaId) headers.set('x-empresa-id', empresaId)
      return fetch(url, { ...options, headers })
    }
  }
})