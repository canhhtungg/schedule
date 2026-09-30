import { useCallback, useEffect, useRef, useState } from 'react'
import { detectNotificationEnvironment, readNotificationSettings, saveNotificationSettings, urlBase64ToUint8Array } from './notificationSettings.js'

const jsonRequest = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  cache: 'no-store',
  body: JSON.stringify(body),
})

function publicEvents(events) {
  return events.map(({ id, date, title, time, room }) => ({ id, date, title, time, room }))
}

export function useScheduleNotifications(events, storage = globalThis.localStorage) {
  const [settings, setSettings] = useState(() => readNotificationSettings(storage))
  const [server, setServer] = useState({ loading: true, available: false, publicKey: '' })
  const [state, setState] = useState({ phase: 'idle', count: 0, message: '' })
  const environment = detectNotificationEnvironment()
  const supported = environment.supported
  const settingsRef = useRef(settings)
  const operationRef = useRef(Promise.resolve())
  const mountedRef = useRef(true)

  const persist = useCallback((next) => {
    const saved = saveNotificationSettings(storage, next)
    settingsRef.current = saved
    setSettings(saved)
    return saved
  }, [storage])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  useEffect(() => {
    let active = true
    fetch('/api/notifications/config', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!active) return
        setServer({ loading: false, available: response.ok && payload?.available === true, publicKey: response.ok ? payload?.publicKey || '' : '' })
      })
      .catch(() => { if (active) setServer({ loading: false, available: false, publicKey: '' }) })
    return () => { active = false }
  }, [])

  const enqueue = useCallback((task) => {
    operationRef.current = operationRef.current.catch(() => {}).then(task)
    return operationRef.current
  }, [])

  const schedule = useCallback((eventsSnapshot, leadMinutes) => enqueue(async () => {
    const current = settingsRef.current
    if (!current.enabled || !server.available || !supported || Notification.permission !== 'granted') return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      if (mountedRef.current) setState({ phase: 'needs-action', count: 0, message: 'Đăng ký push không còn hiệu lực. Hãy tắt rồi bật lại.' })
      return
    }
    if (mountedRef.current) setState((value) => ({ ...value, phase: 'scheduling', message: 'Đang đồng bộ lịch nhắc…' }))
    const response = await jsonRequest('/api/notifications/schedule', {
      subscription: subscription.toJSON(),
      leadMinutes,
      events: publicEvents(eventsSnapshot),
      previousMessageId: settingsRef.current.messageId,
      previousChainId: settingsRef.current.chainId,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.message || 'Không thể lên lịch thông báo.')
    persist({ ...settingsRef.current, messageId: payload.messageId, chainId: payload.chainId })
    if (mountedRef.current) setState({ phase: 'active', count: payload.count, message: payload.count ? `Đã lên lịch ${payload.count} lời nhắc.` : 'Không có lịch hợp lệ sắp tới để nhắc.' })
  }).catch((error) => {
    if (mountedRef.current) setState({ phase: 'error', count: 0, message: error.message || 'Không thể lên lịch thông báo.' })
  }), [enqueue, persist, server.available, supported])

  useEffect(() => {
    if (!settings.enabled || !server.available || !supported) return undefined
    if (Notification.permission !== 'granted') {
      setState({ phase: 'needs-action', count: 0, message: Notification.permission === 'denied' ? 'Trình duyệt đã chặn quyền thông báo.' : 'Hãy tắt rồi bật lại để cấp quyền.' })
      return undefined
    }
    const timer = window.setTimeout(() => schedule(events, settings.leadMinutes), 300)
    return () => window.clearTimeout(timer)
  }, [events, schedule, server.available, settings.enabled, settings.leadMinutes, supported])

  const enable = useCallback(async () => {
    if (environment.needsInstallation) {
      setState({ phase: 'needs-action', count: 0, message: 'Trên iPhone/iPad, hãy Thêm vào Màn hình chính rồi mở ứng dụng từ biểu tượng trước khi bật thông báo.' })
      return
    }
    if (!supported || !server.available || !server.publicKey) return
    setState({ phase: 'permission', count: 0, message: 'Đang chờ quyền thông báo…' })
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      persist({ ...settingsRef.current, enabled: false, messageId: null, chainId: null })
      setState({ phase: 'needs-action', count: 0, message: permission === 'denied' ? 'Quyền thông báo đã bị chặn trong cài đặt trình duyệt.' : 'Bạn chưa cấp quyền thông báo.' })
      return
    }
    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(server.publicKey) }
        try {
          subscription = await registration.pushManager.subscribe(options)
        } catch (firstError) {
          // Safari can retain a stale push state after reinstall/update. Refresh the
          // registration and retry once while still handling the user's click.
          if (!environment.ios) throw firstError
          await registration.update()
          subscription = await registration.pushManager.getSubscription()
            || await registration.pushManager.subscribe(options)
        }
      }
      if (!subscription) throw new Error('Không thể tạo push subscription.')
      persist({ ...settingsRef.current, enabled: true })
      setState({ phase: 'scheduling', count: 0, message: 'Đang đồng bộ lịch nhắc…' })
    } catch (error) {
      persist({ ...settingsRef.current, enabled: false, messageId: null, chainId: null })
      setState({ phase: 'error', count: 0, message: error.message || 'Trình duyệt không thể đăng ký Web Push.' })
    }
  }, [environment.ios, environment.needsInstallation, persist, server.available, server.publicKey, supported])

  const disable = useCallback(async () => {
    const previous = settingsRef.current
    persist({ ...previous, enabled: false, messageId: null, chainId: null })
    setState({ phase: 'idle', count: 0, message: 'Thông báo đang tắt.' })
    await enqueue(async () => {
      try {
        if (previous.messageId || previous.chainId) await jsonRequest('/api/notifications/cancel', { messageId: previous.messageId, chainId: previous.chainId })
      } catch { /* Unsubscribe locally even when the server is temporarily unavailable. */ }
      if (supported) {
        try {
          const registration = await navigator.serviceWorker.ready
          const subscription = await registration.pushManager.getSubscription()
          await subscription?.unsubscribe()
        } catch { /* Browser state can already be gone. */ }
      }
    })
  }, [enqueue, persist, supported])

  const toggle = useCallback(async (enabled) => {
    if (enabled) await enable()
    else await disable()
  }, [disable, enable])

  const changeLead = useCallback((leadMinutes) => {
    persist({ ...settingsRef.current, leadMinutes })
  }, [persist])

  let availability
  if (environment.needsInstallation) availability = 'Trên iPhone/iPad: chọn Chia sẻ → Thêm vào Màn hình chính, rồi mở ứng dụng từ biểu tượng để bật Web Push.'
  else if (!supported) availability = 'Trình duyệt hoặc ngữ cảnh hiện tại không hỗ trợ Web Push.'
  else if (server.loading) availability = 'Đang kiểm tra máy chủ thông báo…'
  else if (!server.available) availability = 'Máy chủ chưa cấu hình Web Push.'
  else if (Notification.permission === 'denied') availability = 'Quyền thông báo đang bị chặn trong trình duyệt.'
  else if (settings.enabled && Notification.permission === 'granted') availability = state.message || 'Web Push đang hoạt động.'
  else availability = state.message || 'Sẵn sàng. Quyền chỉ được hỏi khi bạn bật.'

  return {
    settings,
    state,
    supported,
    environment,
    server,
    availability,
    toggle,
    changeLead,
    shutdown: disable,
  }
}
