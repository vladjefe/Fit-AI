import { useEffect, useMemo } from "react";
import { isNative, vibrate } from "../services/native";

/**
 * В APK Telegram WebApp отсутствует: тактильная отдача уходит в нативный Haptics,
 * настройки темы применяются через StatusBar в App.tsx.
 */
export function useTelegram() {
  const webApp = useMemo(() => (isNative ? undefined : window.Telegram?.WebApp), []);

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

  const haptic = useMemo(() => {
    if (!webApp?.isVersionAtLeast("6.1")) {
      return { tap: vibrate.tap, success: vibrate.success, select: vibrate.select };
    }
    return {
      tap: () => webApp.HapticFeedback.impactOccurred("light"),
      success: () => webApp.HapticFeedback.notificationOccurred("success"),
      select: () => webApp.HapticFeedback.selectionChanged(),
    };
  }, [webApp]);

  return {
    webApp,
    user: webApp?.initDataUnsafe.user,
    haptic,
  };
}
