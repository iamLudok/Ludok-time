// Toast mínimo e imperativo, sin dependencias ni providers.
let timer: number | undefined

export function toast(message: string, ms = 2600): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById('ludok-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'ludok-toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = message
  el.style.display = 'block'
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (el) el.style.display = 'none'
  }, ms)
}
