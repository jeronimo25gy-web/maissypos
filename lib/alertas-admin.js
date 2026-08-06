import { supabase } from './supabase'

// Crea una alerta en alertas_admin (Centro de alertas de Ejecutivo) y de paso
// avisa por WhatsApp a jero/kathe -- un solo lugar para no repetir esta pareja
// de pasos en cada pantalla que genera alertas.
export async function crearAlertaAdmin({ empresaId, tipo, mensaje, referenciaTipo, referenciaId }) {
  const { error } = await supabase.from('alertas_admin').insert({
    empresa_id: empresaId,
    tipo,
    mensaje,
    referencia_tipo: referenciaTipo || null,
    referencia_id: referenciaId || null,
  })

  // El aviso de WhatsApp no debe tumbar el flujo principal si falla (token
  // vencido, plantilla aun no aprobada, etc.) -- por eso va en su propio try.
  try {
    await fetch('/api/whatsapp-alerta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, mensaje }),
    })
  } catch {
    // silencioso a proposito
  }

  return { error }
}
