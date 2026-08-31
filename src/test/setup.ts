// jsdom doesn't implement <dialog> behavior (showModal/close, or the native
// auto-close-on-submit for <form method="dialog">), which every modal in this
// app relies on. Polyfill just enough of the spec for tests to exercise real
// dialog flows instead of mocking them away.

const dialogProto = HTMLDialogElement.prototype as HTMLDialogElement & {
  showModal?: () => void
  close?: (returnValue?: string) => void
}

if (!dialogProto.showModal) {
  dialogProto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}

if (!dialogProto.close) {
  dialogProto.close = function (this: HTMLDialogElement, returnValue?: string) {
    if (returnValue !== undefined) this.returnValue = returnValue
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// Native behavior for <form method="dialog">: submitting it closes the
// nearest ancestor <dialog>, using the submitter button's `value` as
// `returnValue` — unless the app's own submit handler already called
// preventDefault() (e.g. our forms that need to run their own save logic
// first). Registered without `capture` so it runs on the bubble phase,
// after any listener bound directly to the form has already run.
document.addEventListener('submit', (event) => {
  if (event.defaultPrevented) return
  const form = event.target
  if (!(form instanceof HTMLFormElement) || form.method !== 'dialog') return
  const dialog = form.closest('dialog')
  if (!dialog) return
  const submitter = (event as SubmitEvent).submitter
  dialog.close(submitter?.getAttribute('value') ?? undefined)
})
