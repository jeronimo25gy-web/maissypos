// Ubicacion del celular para las visitas y ventas en ruta. Nunca frena el
// flujo: si el vendedor no da permiso o no hay señal, sigue sin ubicacion.
export const ubicacionActual = (espera = 8000) => new Promise((resolve) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({})
  const t = setTimeout(() => resolve({}), espera + 500)
  navigator.geolocation.getCurrentPosition(
    p => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision_m: Math.round(p.coords.accuracy) }) },
    () => { clearTimeout(t); resolve({}) },
    { enableHighAccuracy: true, timeout: espera, maximumAge: 60000 }
  )
})

export const linkMapa = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
