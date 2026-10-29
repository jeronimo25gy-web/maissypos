const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')

// Lineas de cartera que van al final del ticket (texto, pantalla e imagen).
// cobroCartera: lo abonado en esta misma factura. saldoPendiente: lo que sigue debiendo.
export const lineasCartera = (t) => {
  const cobro = Number(t.cobroCartera) || 0
  const anterior = Number(t.saldoAnterior) || 0
  if (!(anterior > 0) && !(cobro > 0)) return []
  const pendiente = t.saldoPendiente != null ? Number(t.saldoPendiente) : anterior - cobro + (t.forma_pago === 'credito' ? Number(t.total) || 0 : 0)
  return [
    ['Saldo anterior', fmt(anterior)],
    ...(cobro > 0 ? [['Abono a cartera', fmt(cobro)], ['TOTAL PAGADO', fmt((t.forma_pago === 'credito' ? 0 : Number(t.total) || 0) + cobro), true]] : []),
    ['Saldo pendiente', fmt(pendiente)],
  ]
}
