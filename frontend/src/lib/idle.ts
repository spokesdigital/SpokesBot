type IdleDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

type IdleCallbackLike = (deadline: IdleDeadlineLike) => void
type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleCallbackLike, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export function scheduleIdleTask(task: () => void, timeout = 900): number {
  if (typeof window === 'undefined') {
    return 0
  }

  const idleWindow = window as IdleWindow

  if (typeof idleWindow.requestIdleCallback === 'function') {
    return idleWindow.requestIdleCallback(() => task(), { timeout })
  }

  return window.setTimeout(task, Math.min(timeout, 250))
}

export function cancelIdleTask(handle: number) {
  if (typeof window === 'undefined' || handle === 0) {
    return
  }

  const idleWindow = window as IdleWindow

  if (typeof idleWindow.cancelIdleCallback === 'function' && typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.cancelIdleCallback(handle)
    return
  }

  window.clearTimeout(handle)
}
