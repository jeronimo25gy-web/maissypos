'use client'

// Campo de plata con separador de miles mientras se escribe (100.000 vs
// 1.000.000 se distingue a simple vista) y coma para los centavos (152,32). Por
// fuera se comporta igual que un <input type="number">: onChange recibe
// e.target.value con punto decimal ("152.32"), asi que los handlers existentes
// (setX(e.target.value), parseFloat(...)) no cambian. Con `entero` no admite
// decimales (kilometraje).
const formatear = (v, entero) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const signo = s.startsWith('-') ? '-' : ''
  const [parte, dec] = s.split('.')
  const digitos = parte.replace(/\D/g, '')
  const miles = digitos ? Number(digitos).toLocaleString('es-CO') : dec !== undefined ? '0' : ''
  return signo + (dec === undefined || entero ? miles : `${miles},${dec.slice(0, 2)}`)
}

// Lo escrito pasa a numero con punto decimal. Los puntos son los de miles, salvo
// el ultimo que se teclea: algunos teclados de celular traen punto y no coma.
const leer = (texto, entero) => {
  const t = texto.endsWith('.') ? `${texto.slice(0, -1)},` : texto
  const [parte, ...resto] = t.split(',')
  const digitos = parte.replace(/\D/g, '')
  if (entero || !resto.length) return digitos
  return `${digitos || '0'}.${resto.join('').replace(/\D/g, '').slice(0, 2)}`
}

export default function InputDinero({ value, onChange, type, min, max, step, entero, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode={entero ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={formatear(value, entero)}
      onChange={e => {
        const numero = leer(e.target.value, entero)
        onChange?.({ target: { value: numero, name: e.target.name }, currentTarget: { value: numero } })
      }}
    />
  )
}
