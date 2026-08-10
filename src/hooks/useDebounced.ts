import { useEffect, useState } from 'react'

/**
 * Devuelve `value` con retardo: solo cambia cuando dejas de escribir durante
 * `delay` ms. Sin esto, buscar mientras se teclea dispararía una petición por
 * cada letra y chocaría con los límites de TMDB.
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
