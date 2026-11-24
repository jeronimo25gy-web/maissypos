import { createBrowserClient } from '@supabase/ssr'
import { getEmpresaId } from './empresa'
import { traducirRespuesta } from './errores-db'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// createBrowserClient (en vez de createClient) guarda la sesion tambien en
// cookies, no solo en localStorage, para que proxy.js pueda leerla en el servidor.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers)
      const empresaId = typeof window !== 'undefined' ? getEmpresaId() : null
      if (empresaId) headers.set('x-empresa-id', empresaId)
      // Los errores de la base de datos llegan en inglés: se traducen aquí.
      return fetch(url, { ...options, headers }).then(traducirRespuesta)
    }
  }
})