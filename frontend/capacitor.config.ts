import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fitai.app",
  appName: "FIT AI",
  webDir: "dist",
  android: {
    // https://localhost вместо file:// — иначе fetch к API блокируется как mixed content.
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#090b0a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_fitai",
      iconColor: "#b7f34a",
    },
  },
};

export default config;
