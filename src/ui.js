// ui.js — toast and confirm modal. No domain logic.

let toastTimer = null

export function toast(message) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600)
}

// Mirrors the React ConfirmModal: title, message, confirmLabel, danger.
// Returns a Promise<boolean>.
export function confirmModal({ title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    const host = document.getElementById('modal-host')
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.setAttribute('role', 'presentation')

    const modal = document.createElement('div')
    modal.className = 'confirm-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-labelledby', 'confirm-title')

    const h2 = document.createElement('h2')
    h2.id = 'confirm-title'
    h2.textContent = title
    const p = document.createElement('p')
    p.textContent = message
    const row = document.createElement('div')
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'secondary-action'
    cancelBtn.textContent = 'Cancel'
    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = danger ? 'danger-action' : 'primary-action'
    confirmBtn.textContent = confirmLabel
    row.append(cancelBtn, confirmBtn)
    modal.append(h2, p, row)
    overlay.appendChild(modal)
    host.appendChild(overlay)

    function close(result) {
      host.removeChild(overlay)
      resolve(result)
    }
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(false) })
    cancelBtn.addEventListener('click', () => close(false))
    confirmBtn.addEventListener('click', () => close(true))
    confirmBtn.focus()
  })
}
