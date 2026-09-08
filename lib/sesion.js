import { supabase } from './supabase'

export const registrarSesion = async (usuarioId) => {
  try {
    await fetch('/api/sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: usuarioId, dispositivo: navigator.userAgent })
    })
  } catch {
    // no bloquear el login si falla el registro de sesion
  }
}

export const cerrarSesionUsuario = async (usuarioId) => {
  // El update tiene que ir ANTES de signOut(): una vez cerrada la sesion de
  // Auth ya no hay JWT valido para que RLS deje marcar la fila como propia.
  if (usuarioId) {
    await supabase.from('sesiones_activas').update({ activo: false }).eq('usuario_id', usuarioId)
  }
  await supabase.auth.signOut()
}
