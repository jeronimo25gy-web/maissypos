// Fase 1 del plan de migracion a Supabase Auth. Correr localmente, una sola
// vez, DESPUES de aplicar supabase/migrations/0001_auth_empresa_claims.sql.
//
// Uso:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxx \
//   node scripts/backfill-auth-users.mjs
//
// La service_role key sale de Dashboard -> Project Settings -> API. NUNCA la
// pongas en .env.local del proyecto ni la commitees -- pasala solo como
// variable de entorno de esta ejecucion puntual.
//
// Que hace: por cada fila de `usuarios` sin `auth_user_id`, crea su cuenta en
// Supabase Auth y guarda el id en `usuarios.auth_user_id`. Si la fila tiene
// `email` (usuarios administrativos/gerenciales), se usa ese correo real --
// esos usuarios podran recuperar su clave solos desde Supabase Auth. Si no
// tiene `email` (vendedores, operarios de produccion), se usa el sintetico
// {usuario}@maissypos.internal, sin recuperacion self-service. En ambos
// casos la password es nueva y generada al azar. Al final imprime la lista
// de usuario/password nueva para que se la comuniques al equipo -- nadie
// migra su password anterior, todos estrenan una.

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function generarPassword() {
  return randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12)
}

const { data: usuarios, error } = await supabase
  .from('usuarios')
  .select('id, usuario, nombre, email, auth_user_id')
  .is('auth_user_id', null)

if (error) {
  console.error('Error leyendo usuarios:', error.message)
  process.exit(1)
}

if (usuarios.length === 0) {
  console.log('No hay usuarios pendientes de migrar (todos ya tienen auth_user_id).')
  process.exit(0)
}

const resultado = []

for (const u of usuarios) {
  const usaCorreoReal = Boolean(u.email)
  const email = usaCorreoReal ? u.email : `${u.usuario.toLowerCase()}@maissypos.internal`
  const password = generarPassword()

  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })

  if (errorCrear) {
    console.error(`Fallo creando auth.users para "${u.usuario}":`, errorCrear.message)
    continue
  }

  const { error: errorUpdate } = await supabase
    .from('usuarios')
    .update({ auth_user_id: creado.user.id })
    .eq('id', u.id)

  if (errorUpdate) {
    console.error(`Fallo guardando auth_user_id para "${u.usuario}":`, errorUpdate.message)
    continue
  }

  resultado.push({
    usuario: u.usuario,
    nombre: u.nombre,
    email,
    recuperacion_propia: usaCorreoReal ? 'si' : 'no',
    password_nueva: password
  })
}

console.log('\nMigrados. Comunica estas claves nuevas al equipo (no quedan guardadas en ningun lado mas que en esta terminal):\n')
console.table(resultado)
