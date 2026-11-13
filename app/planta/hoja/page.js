'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { puedeVerModulo } from '@/lib/permisos'
import { cargarPlanta, gramajeCrudo, rangoPaquete, unidadesPaquete } from '@/lib/planta'
import { C, titulo, Boton } from '../ui'

// Hoja de cada puesto para pegar en la pared: los pasos en la pantalla y los pesos
// de cada referencia. Sale de los estándares del día en que se imprime. Solo
// líneas y contornos, para no gastar tinta.
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
const g = (n) => Number(n).toLocaleString('es-CO')
const POR_DEFINIR = 'Por definir'

const PASOS_ARRIBA = [
  ['Montar', 'En el tanque libre, clic en Montar. Escoja el maíz y los bultos. Clic en Empezar cocción.'],
  ['Apagar', 'Al apagar el tanque, clic en Apagar.'],
  ['Sacar', 'Al sacar el maíz, clic en Sacar.'],
  ['Molde', 'Cada vez que cambie el molde, clic en la referencia nueva, en Cambiar molde.'],
  ['Verificar', 'Pese 5 arepas crudas juntas y compare con la pantalla.'],
  ['Deshacer', 'Si se equivocó, clic en Deshacer en el aviso de abajo.'],
]
const PASOS_ABAJO = [
  ['Verificar', 'Compare el peso del paquete con la pantalla.'],
  ['Ya llegó', 'Cuando baje la referencia que sigue, tecla L o clic en Ya llegó.'],
  ['Contar', 'Por cada caja llena, barra espaciadora. Flechas: más 1 y menos 1.'],
  ['Bolsa dañada', 'Cada bolsa que se dañe, tecla D. No va a la basura sin anotarse.'],
  ['Reproceso', 'Antes de desocupar, clic en Reproceso y desecho y escriba los kilos.'],
  ['Cerrar', 'Al terminar: Pasar a bodega y Cerrar lote. Escriba los kilos; si no hubo, 0.'],
]

function Hoja({ puesto, pasos, nuevo, encabezado, filas, provisional }) {
  return (
    <section className="hoja-puesto flex flex-col gap-5">
      <h1 className="text-[34px] leading-none font-extrabold m-0 pb-3" style={{ ...titulo, borderBottom: `2px solid ${C.tinta}` }}>Puesto de {puesto}</h1>
      <ol className="m-0 p-0 list-none flex flex-col gap-2.5">
        {pasos.map(([n, texto], i) => (
          <li key={n} className="grid gap-3 items-start" style={{ gridTemplateColumns: '34px 110px minmax(0,1fr)' }}>
            <b className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[18px]" style={{ ...titulo, border: `2px solid ${C.tinta}` }}>{i + 1}</b>
            <b className="text-[18px] leading-[34px]">{n}</b>
            <span className="text-[17px] leading-snug pt-1">{texto}</span>
          </li>
        ))}
      </ol>
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead><tr>{encabezado.map(t => <th key={t} className="py-2 pr-3 text-[15px]" style={{ borderBottom: `2px solid ${C.tinta}` }}>{t}</th>)}</tr></thead>
        <tbody>
          {filas.map(f => <tr key={f[0]}>{f.map((v, i) => <td key={i} className={`py-2 pr-3 tabular-nums ${i === 1 ? 'text-[19px] font-extrabold' : 'text-[16px]'}`} style={{ borderBottom: `1px solid ${C.tinta}` }}>{v}</td>)}</tr>)}
        </tbody>
      </table>
      {provisional && <span className="text-[14px]">* Valor provisional, se reemplaza con la medición.</span>}
      <p className="m-0 p-3 text-[16px] leading-snug" style={{ border: `2px solid ${C.tinta}`, borderRadius: 10 }}><b>Lote con Maíz nuevo.</b> {nuevo}</p>
    </section>
  )
}

export default function HojaPuesto() {
  const router = useRouter()
  const [e, setE] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.replace('/entrar'); return }
    if (u.rol !== 'planta' && !puedeVerModulo(u, 'produccion', ['admin', 'auxiliar'])) { router.replace('/despacho'); return }
    cargarPlanta().then(setE).catch(err => setError(err.message))
  }, [router])

  if (error) return <p className="p-6 font-bold" style={{ color: C.rojo }}>No se pudo cargar: {error}</p>
  if (!e) return <p className="p-6 text-center" style={{ color: C.gris }}>Cargando…</p>

  const refs = e.referencias.filter(p => !/kilo de masa/i.test(p.nombre))
  const crudas = refs.map(p => ({ p, r: gramajeCrudo(e, p) }))
  const paquetes = refs.map(p => ({ p, r: rangoPaquete(e, p) }))
  const bolsa = (p) => (e.bolsas?.[p.bolsa_id] || POR_DEFINIR).replace(/^bolsa\s+/i, '').replace(/\s+/g, ' ')

  return (
    <div className="bg-white min-h-screen" style={{ color: C.tinta }}>
      <style>{`
        @page { size: letter; margin: 10mm; }
        .hoja-puesto { max-width: 760px; margin: 0 auto; padding: 24px 16px 40px; }
        @media print {
          .no-imprimir { display: none !important; }
          .hoja-puesto { max-width: none; padding: 0; gap: 12px; break-after: page; }
          .hoja-puesto:last-of-type { break-after: auto; }
          .hoja-puesto ol { gap: 6px; }
          .hoja-puesto th, .hoja-puesto td { padding-top: 4px; padding-bottom: 4px; }
        }
      `}</style>
      <div className="no-imprimir sticky top-0 bg-white flex gap-2 justify-end p-3" style={{ borderBottom: `1px solid ${C.linea}` }}>
        <Boton onClick={() => router.back()}>Volver</Boton>
        <Boton tipo="tinta" onClick={() => window.print()}>Imprimir</Boton>
      </div>
      <Hoja puesto="arriba" pasos={PASOS_ARRIBA} nuevo="Marque Maíz nuevo al montar y anote el agua. La pantalla pide además textura, bolsas testigo, peso de cada bola y recargas de aceite."
        encabezado={['Referencia', 'Arepa cruda', '5 juntas']} provisional={crudas.some(x => x.r?.provisional)}
        filas={crudas.map(({ p, r }) => [corto(p), r ? `${r.min} a ${r.max} g${r.provisional ? ' *' : ''}` : POR_DEFINIR, r ? `${r.min * 5} a ${r.max * 5} g` : ''])} />
      <Hoja puesto="abajo" pasos={PASOS_ABAJO} nuevo="Pese 3 paquetes por caja: tecla P, escriba cada peso y Enter."
        encabezado={['Referencia', 'Paquete', 'Arepas', 'Por caja', 'Bolsa']} provisional={paquetes.some(x => x.r && !x.r.fijo)}
        filas={paquetes.map(({ p, r }) => [corto(p), r ? `${g(r.min)} a ${g(r.max)} g${r.fijo ? '' : ' *'}` : POR_DEFINIR, unidadesPaquete(p) ?? '', p.paquetes_por_caja || POR_DEFINIR, bolsa(p)])} />
    </div>
  )
}
