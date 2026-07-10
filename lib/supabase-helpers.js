export const formatearMoneda = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

export const obtenerFechaActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
