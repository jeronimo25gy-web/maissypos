import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Interruptor de la Fase 2 del plan de migracion a Supabase Auth (ver
// /Users/jeronimo/.claude/plans/lovely-pondering-perlis.md). Mientras esta en
// 'true' en .env.local/entorno de deploy, este proxy NO redirige a nadie -
// solo mantiene la cookie de sesion viva. Se activa (AUTH_ENFORCEMENT_ENABLED=true)
// unicamente despues de correr la migracion SQL y el script de backfill de
// usuarios, cuando el login ya emite sesiones reales de Supabase Auth.
const ENFORCEMENT_ENABLED = process.env.AUTH_ENFORCEMENT_ENABLED === 'true'

const PUBLIC_PATHS = ['/']

export default async function proxy(request) {
  const response = NextResponse.next({ request })
  const supabase = createSupabaseServerClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()

  if (!ENFORCEMENT_ENABLED) {
    return response
  }

  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname)

  if (!isPublic && !user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)']
}
