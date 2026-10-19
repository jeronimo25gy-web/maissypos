'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { DIAS, detalleCliente } from '@/lib/rutero'

// Rutero del dia para imprimir en carta: en orden, con espacio para anotar el
// pedido. Lo que debe cada cliente no va aqui: sale en la cartera de la ruta.
export default function ImprimirRutero() {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rutaId = params.get('ruta')
    const dia = Number(params.get('dia'))
    const empresaId = getEmpresaId()
    Promise.all([
      supabase.from('rutas').select('nombre').eq('id', rutaId).maybeSingle(),
      supabase.from('rutero').select('orden, clientes(nombre, direccion, apto, edificio, barrio, notas, estado)')
        .eq('ruta_id', rutaId).eq('dia_semana', dia).eq('empresa_id', empresaId).order('orden'),
      supabase.from('vendedores').select('nombre').eq('ruta_id', rutaId).eq('estado', true).eq('empresa_id', empresaId),
      supabase.from('vehiculos').select('placa').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
      supabase.from('empresas').select('nombre, logo_url').eq('id', empresaId).maybeSingle(),
    ]).then(([{ data: ruta }, { data: filas }, { data: vends }, { data: vehs }, { data: emp }]) => {
      setDatos({
        ruta: ruta?.nombre || '', dia: DIAS.find(d => d.n === dia)?.nombre || '',
        filas: (filas || []).filter(f => f.clientes?.estado !== false),
        vendedor: (vends || []).map(v => v.nombre).join(', '), placa: (vehs || [])[0]?.placa || '',
        empresa: emp?.nombre || '', logo: emp?.logo_url || '',
      })
    })
  }, [])

  if (!datos) return <p className="p-8 text-gray-400">Cargando...</p>

  return (
    <>
      <style>{`
        @page { size: letter; margin: 10mm; }
        @media print { .no-print { display: none !important; } body { background: white; } }
        .rutero { font-family: Arial, sans-serif; color: #000; max-width: 196mm; margin: 0 auto; background: white; }
        .rutero table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        .rutero th, .rutero td { border: 0.6pt solid #000; padding: 4pt 5pt; vertical-align: top; }
        .rutero th { background: #eee; text-align: left; }
        .rutero tr { break-inside: avoid; }
        .rutero thead { display: table-header-group; }
      `}</style>
      <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
        <button onClick={() => window.print()} className="bg-brand text-white px-6 py-2 rounded-lg font-bold text-sm">Imprimir</button>
        <p className="text-gray-500 text-sm">{datos.ruta} · {datos.dia} · {datos.filas.length} clientes · hoja carta</p>
      </div>
      <div className="rutero p-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1.5pt solid #000', paddingBottom: '6pt', marginBottom: '8pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8pt' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {datos.logo && <img src={datos.logo} alt="" style={{ width: '22mm', height: '15mm', objectFit: 'cover' }} />}
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '13pt' }}>Rutero · {datos.ruta} · {datos.dia}</div>
              <div style={{ fontSize: '9pt' }}>{datos.empresa}</div>
            </div>
          </div>
          <div style={{ fontSize: '9pt', textAlign: 'right' }}>
            <div>Vendedor: {datos.vendedor || '__________'}</div>
            <div>Vehículo: {datos.placa || '______'} · Fecha: ____/____/______</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '7mm' }}>#</th>
              <th style={{ width: '48mm' }}>Cliente</th>
              <th>Dirección / apto</th>
              <th style={{ width: '50mm' }}>Pedido</th>
              <th style={{ width: '12mm' }}>Visitó</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map(f => (
              <tr key={f.orden}>
                <td style={{ fontWeight: 'bold' }}>{f.orden}</td>
                <td style={{ fontWeight: 'bold' }}>{f.clientes?.nombre}</td>
                <td>{detalleCliente(f.clientes || {})}{f.clientes?.notas ? <span style={{ fontStyle: 'italic' }}> · {f.clientes.notas}</span> : null}</td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '8.5pt', marginTop: '8pt' }}>Clientes nuevos: anótalos atrás con nombre o apto, dirección y barrio, y se agregan en Rutas.</p>
      </div>
    </>
  )
}
