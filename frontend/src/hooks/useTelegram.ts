import { useEffect, useMemo } from "react";

export function useTelegram() {
  const webApp = useMemo(() => window.Telegram?.WebApp, []);

  useEffect(() => {
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    if (webApp.isVersionAtLeast("6.1")) {
      webApp.setHeaderColor("#090b0a");
      webApp.setBackgroundColor("#090b0a");
    }
    if (webApp.isVersionAtLeast("7.7")) {
      webApp.disableVerticalSwipes?.();
    }
  }, [webApp]);

  const haptic = {
    tap: () => webApp?.isVersionAtLeast("6.1") && webApp.HapticFeedback.impactOccurred("light"),
    success: () => webApp?.isVersionAtLeast("6.1") && webApp.HapticFeedback.notificationOccurred("success"),
    select: () => webApp?.isVersionAtLeast("6.1") && webApp.HapticFeedback.selectionChanged(),
  };

  return {
    webApp,
    user: webApp?.initDataUnsafe.user,
    haptic,
  };
}
