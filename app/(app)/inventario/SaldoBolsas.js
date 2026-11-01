'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import InputDinero from '@/components/InputDinero'
import { C, titulo } from './ui'

// Saldo de las bolsas: no pasan por el conteo. Se escribe lo que hay (pacas por
// unidades) y entra como movimiento por la diferencia, así se puede corregir
// cuando se quiera sin tocar el conteo del día.
const num = (n) => Math.round(Number(n) || 0).toLocaleString('es-CO')

export default function SaldoBolsas({ empresaId, usuario }) {
  const [bolsas, setBolsas] = useState(null)
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const [{ data }, stock] = await Promise.all([
      supabase.from('productos').select('sku, nombre').eq('empresa_id', empresaId).eq('estado', true).eq('tipo', 'materia_prima').eq('categoria', 'Insumos de reparto').order('nombre'),
      calcularStockPorSku({ empresaId }),
    ])
    setBolsas((data || []).map(b => ({ ...b, hay: Number(stock[b.sku]?.stockActual) || 0 })))
    setValores({})
  }, [empresaId])
  useEffect(() => { cargar() }, [cargar])

  if (!bolsas?.length) return null
  const cambios = bolsas.filter(b => valores[b.sku] !== undefined && valores[b.sku] !== '' && Number(valores[b.sku]) !== b.hay)

  const guardar = async () => {
    setGuardando(true); setAviso('')
    const { error } = await supabase.from('inventario_mov').insert(cambios.map(b => {
      const diferencia = Number(valores[b.sku]) - b.hay
      return { empresa_id: empresaId, sku: b.sku, cantidad: Math.abs(diferencia), fecha: obtenerFechaActual(), tipo_movimiento: diferencia > 0 ? 'entrada' : 'salida', referencia: `Saldo de bolsas · ${usuario.nombre}` }
    }))
    setGuardando(false)
    if (error) { setAviso('No se pudo guardar: ' + error.message); return }
    setAviso(`${cambios.length} ${cambios.length === 1 ? 'saldo guardado' : 'saldos guardados'}`)
    await cargar()
  }

  return (
    <section className="bg-white rounded-[18px] p-4 flex flex-col gap-3" aria-label="Saldo de bolsas">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[21px] font-extrabold m-0" style={titulo}>Saldo de bolsas</h2>
        <button type="button" onClick={guardar} disabled={guardando || !cambios.length} className="rounded-xl min-h-[44px] px-4 font-bold text-white disabled:opacity-40" style={{ background: C.tinta }}>
          {guardando ? 'Guardando…' : cambios.length ? `Guardar ${cambios.length}` : 'Guardar'}
        </button>
      </div>
      {aviso && <span className="text-[14px] font-bold" style={{ color: aviso.startsWith('No') ? C.rojo : C.verde }}>{aviso}</span>}
      <div className="grid gap-x-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        {bolsas.map(b => (
          <div key={b.sku} className="flex items-center gap-3 py-2" style={{ borderTop: `1px solid ${C.linea}` }}>
            <span className="flex-1 min-w-0 leading-tight">
              <b className="block text-[14px]">{b.nombre.replace(/\s+/g, ' ')}</b>
              <span className="text-[12.5px] tabular-nums" style={{ color: C.gris }}>Hay {num(b.hay)}</span>
            </span>
            <InputDinero entero value={valores[b.sku] ?? ''} onChange={e => setValores(v => ({ ...v, [b.sku]: e.target.value }))} placeholder="Saldo" aria-label={`Saldo de ${b.nombre}`}
              className="w-[110px] h-[42px] text-right rounded-xl px-2.5 font-extrabold bg-white border-[1.5px] outline-none focus:border-[#1C1B19] shrink-0 tabular-nums" style={{ borderColor: C.linea }} />
          </div>
        ))}
      </div>
    </section>
  )
}
