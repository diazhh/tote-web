export function getWebApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;
}
export function getInitData() { const w = getWebApp(); return w ? w.initData : ''; }
export function tgReady() { const w = getWebApp(); if (w) { w.ready(); w.expand(); } }
export function showConfirm(message) {
  return new Promise((resolve) => {
    const w = getWebApp();
    if (w && w.showConfirm) w.showConfirm(message, (ok) => resolve(!!ok));
    else resolve(window.confirm(message));
  });
}
export function haptic(type = 'success') {
  const w = getWebApp();
  try { w && w.HapticFeedback && w.HapticFeedback.notificationOccurred(type); } catch { /* noop */ }
}
let _backHandler = null;
export function setBackButton(onClick) {
  const w = getWebApp();
  if (!w || !w.BackButton) return;
  if (_backHandler) { try { w.BackButton.offClick(_backHandler); } catch { /* noop */ } _backHandler = null; }
  if (onClick) { _backHandler = onClick; w.BackButton.show(); w.BackButton.onClick(onClick); }
  else { w.BackButton.hide(); }
}
export function getStartParam() {
  const w = getWebApp();
  return (w && w.initDataUnsafe && w.initDataUnsafe.start_param) || null;
}
