'use client'

// Campo de plata con separador de miles mientras se escribe (100.000 vs
// 1.000.000 se distingue a simple vista). Por fuera se comporta igual que un
// <input type="number">: onChange recibe e.target.value con solo los digitos,
// asi que los handlers existentes (setX(e.target.value), parseFloat(...)) no
// cambian. Pesos colombianos: sin decimales.
const formatear = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  // Valores que vienen del estado/BD como numero ("6000", "6000.5"): el punto
  // es decimal. Lo que digita la persona llega siempre solo con digitos.
  if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s)).toLocaleString('es-CO')
  const digitos = s.replace(/\D/g, '')
  return digitos ? Number(digitos).toLocaleString('es-CO') : ''
}

export default function InputDinero({ value, onChange, type, min, max, step, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatear(value)}
      onChange={e => {
        const digitos = e.target.value.replace(/\D/g, '')
        onChange?.({ target: { value: digitos, name: e.target.name }, currentTarget: { value: digitos } })
      }}
    />
  )
}
