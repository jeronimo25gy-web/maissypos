'use client'
import { useState } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { costoLaboral, guardarParametros, PARAMETROS_BASE, CLASES_HORA, NOMBRE_TIPO, tipoEmpleado, NIVEL_ARL, TARIFA_ARL } from '@/lib/nomina'
import InputDinero from '@/components/InputDinero'
import { C, $, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'

// Costo laboral real: salario, auxilio, aportes del empleador y provisión de
// prestaciones. Lo usan Costos (mano de obra y costo de cada ruta) y Finanzas.
const pctTxt = (n) => String(Math.round(n * 100) / 100).replace('.', ',') + '%'
const CONCEPTOS = [
  ['Seguridad social del empleador', [['pension', 'Pensión', (p) => pctTxt(p.pension_empleador)], ['salud', 'Salud', (p) => p.exonerado ? 'Exonerada' : pctTxt(p.salud_empleador)], ['arl', 'Riesgos laborales (ARL)', () => 'Según riesgo'], ['caja', 'Caja de compensación', (p) => pctTxt(p.caja)], ['parafiscales', 'SENA e ICBF', (p) => p.exonerado ? 'Exonerados' : pctTxt(p.sena + p.icbf)]]],
  ['Prestaciones sociales', [['prima', 'Prima de servicios', () => '8,33%'], ['cesantias', 'Cesantías', () => '8,33%'], ['intereses', 'Intereses sobre cesantías', () => '1%'], ['vacaciones', 'Vacaciones', () => '4,17%']]],
  ['Otros', [['auxilio', 'Auxilio de transporte', () => 'Hasta 2 mínimos']]],
]

export default function CostoLaboral({ base, usuario, recargar }) {
  const { empleados, p } = base
  const [editando, setEditando] = useState(false)
  const activos = empleados.filter(e => e.activo)
  const costos = activos.map(e => ({ e, c: costoLaboral(e, p) }))
  const salarios = costos.reduce((s, x) => s + x.c.salario, 0)
  const total = costos.reduce((s, x) => s + x.c.total, 0)
  const factor = salarios ? (total - salarios) / salarios * 100 : 0
  const porTipo = (t) => costos.filter(x => tipoEmpleado(x.e) === t).reduce((s, x) => s + x.c.total, 0)
  const parte = (k) => costos.reduce((s, x) => s + x.c.partes[k], 0)

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Costo laboral mensual" valor={$(total)} nota={`Salarios ${$(salarios)} + ${pctTxt(Math.round(factor))}`} />
        <Kpi rotulo="Factor prestacional" valor={pctTxt(Math.round(factor * 10) / 10)} nota="Sobre el salario, con auxilio" />
        {porTipo('mod') > 0 && <Kpi rotulo="Mano de obra directa" valor={$(porTipo('mod'))} nota="Pasa a Costos de producción" />}
        {porTipo('ventas') > 0 && <Kpi rotulo="Ventas" valor={$(porTipo('ventas'))} nota="Al costo de distribución de cada ruta" />}
        {porTipo('admin') > 0 && <Kpi rotulo="Administrativo" valor={$(porTipo('admin'))} nota="Gasto de la empresa" />}
      </Kpis>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <Tarjeta>
          <H2>Composición del costo</H2>
          <Tabla columnas={['Concepto', 'Porcentaje', 'Mensual']} min={380}>
            {CONCEPTOS.map(([g, items]) => [
              <tr key={g}><td colSpan={3} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{g}</td></tr>,
              ...items.map(([k, n, pc]) => <tr key={k}><td style={td(true)}>{n}</td><td style={td()}>{pc(p)}</td><td style={td()}>{$(parte(k))}</td></tr>),
            ])}
            <tr>{['Total sobre el salario', pctTxt(Math.round(factor * 10) / 10), $(total - salarios)].map((x, i) => <td key={i} style={{ ...td(i === 0), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>{x}</td>)}</tr>
          </Tabla>
        </Tarjeta>
        <Tarjeta>
          <H2>Por empleado</H2>
          <Tabla columnas={['Empleado', 'Salario', 'Aportes y prestaciones', 'Costo mensual']} min={460}>
            {costos.map(({ e, c }) => (
              <tr key={e.id}>
                <td style={td(true)}><b>{e.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{NOMBRE_TIPO[tipoEmpleado(e)]} · riesgo {NIVEL_ARL[e.riesgo_arl || 1]}</span></td>
                <td style={td()}>{$(c.salario)}</td>
                <td style={td()}>{$(c.adicional)}</td>
                <td style={td()}><b>{$(c.total)}</b></td>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
      <Tarjeta>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <H2>Parámetros legales</H2>
          {usuario.rol === 'admin' && !editando && <Boton onClick={() => setEditando(true)}>Editar</Boton>}
        </div>
        {editando ? <EditarParametros p={p} cerrar={() => setEditando(false)} recargar={recargar} /> : (
          <div className="grid gap-x-6 gap-y-2 text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {[['Salario mínimo', $(p.smmlv)], ['Auxilio de transporte', $(p.auxilio_transporte)], ['Horas del mes', `${p.horas_mes} horas`], ['Salud y pensión del empleado', `${pctTxt(p.salud_empleado)} y ${pctTxt(p.pension_empleado)}`],
              ['Exoneración de salud, SENA e ICBF', p.exonerado ? 'Sí, salarios menores a 10 mínimos' : 'No'], ['Pago de seguridad social', `Día ${p.dia_pila} de cada mes`],
              ...Object.entries(CLASES_HORA).map(([k, c]) => [c.nombre, `${c.extra ? '+' : ''}${p.recargos[k]}%`])].map(([r, v]) => (
              <div key={r} className="flex justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="tabular-nums text-right">{v}</b></div>
            ))}
          </div>
        )}
        <Nota>Tarifas ARL: {[1, 2, 3, 4, 5].map(n => `${NIVEL_ARL[n]} ${String(TARIFA_ARL[n]).replace('.', ',')}%`).join(' · ')}. El riesgo de cada empleado se define en Empleados.</Nota>
      </Tarjeta>
    </div>
  )
}

function EditarParametros({ p, cerrar, recargar }) {
  const [f, setF] = useState({ ...p, recargos: { ...p.recargos } })
  const [guardando, setGuardando] = useState(false)
  const num = (v) => parseFloat(String(v).replace(',', '.')) || 0
  const guardar = async () => {
    setGuardando(true)
    try {
      const datos = { ...f, smmlv: num(f.smmlv), auxilio_transporte: num(f.auxilio_transporte), horas_mes: num(f.horas_mes) || PARAMETROS_BASE.horas_mes, salud_empleado: num(f.salud_empleado), pension_empleado: num(f.pension_empleado), dia_pila: Math.min(28, Math.max(1, parseInt(f.dia_pila) || 10)), recargos: Object.fromEntries(Object.entries(f.recargos).map(([k, v]) => [k, num(v)])) }
      await guardarParametros(getEmpresaId(), datos)
      cerrar(); recargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  const texto = (k, etiqueta) => <Campo key={k} etiqueta={etiqueta}><input inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className={campo} style={campoEstilo} /></Campo>
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Campo etiqueta="Salario mínimo"><InputDinero value={f.smmlv} onChange={e => setF({ ...f, smmlv: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Auxilio de transporte"><InputDinero value={f.auxilio_transporte} onChange={e => setF({ ...f, auxilio_transporte: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        {texto('horas_mes', 'Horas del mes')}
        {texto('salud_empleado', 'Salud del empleado (%)')}
        {texto('pension_empleado', 'Pensión del empleado (%)')}
        {texto('dia_pila', 'Día de pago de seguridad social')}
        {Object.entries(CLASES_HORA).map(([k, c]) => (
          <Campo key={k} etiqueta={`${c.nombre} (%)`}><input inputMode="decimal" value={f.recargos[k]} onChange={e => setF({ ...f, recargos: { ...f.recargos, [k]: e.target.value } })} className={campo} style={campoEstilo} /></Campo>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold" style={{ color: C.gris }}>Exoneración de salud, SENA e ICBF (art. 114-1 E.T.)</span>
        <Segmento etiqueta="Exoneración" opciones={[[true, 'Sí aplica'], [false, 'No aplica']]} valor={f.exonerado} onCambio={v => setF({ ...f, exonerado: v })} />
      </div>
      <div className="flex gap-2 justify-end"><Boton onClick={cerrar}>Cancelar</Boton><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar parámetros'}</Boton></div>
    </div>
  )
}
