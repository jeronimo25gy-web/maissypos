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
  if (!usuarioId) return
  await supabase.from('sesiones_activas').update({ activo: false }).eq('usuario_id', usuarioId)
}
