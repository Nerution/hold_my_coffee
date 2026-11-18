// Bridge between the app (index.html) and the device, used only in the Android and iOS builds.
// scripts/build-web.mjs bundles this file into www/native.js. index.html checks for window.GTNative
// and falls back to web behaviour when it is missing (in the browser).
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import { Network } from "@capacitor/network";
import { LocalNotifications, Weekday } from "@capacitor/local-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";

const platform = Capacitor.getPlatform();
const DIGEST_IDS = [101, 102, 103, 104, 105]; // up to five scheduled reminders (weekdays)

const quiet = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.warn("[native]", e?.message || e); return null; } };

window.GTNative = {
  isNative: Capacitor.isNativePlatform(),
  platform,

  /* Durable key-value storage (SharedPreferences on Android, UserDefaults on iOS). */
  storage: {
    get: quiet(async key => (await Preferences.get({ key })).value),
    set: quiet(async (key, value) => Preferences.set({ key, value })),
    remove: quiet(async key => Preferences.remove({ key })),
  },

  /* The system share sheet. */
  share: quiet(async ({ title, text, url }) => { await Share.share({ title, text, url, dialogTitle: title }); return true; }),

  /* Opens an article in the in-app browser (Safari View Controller / Custom Tabs). */
  openUrl: quiet(async url => { await Browser.open({ url, presentationStyle: "popover" }); return true; }),

  network: {
    status: quiet(async () => (await Network.getStatus()).connected),
    onChange: cb => Network.addListener("networkStatusChange", s => cb(s.connected)),
  },

  /* Daily digest as local notifications: scheduled on the device, no server or push service involved. */
  notifications: {
    permission: quiet(async () => (await LocalNotifications.checkPermissions()).display),
    request: quiet(async () => (await LocalNotifications.requestPermissions()).display),
    cancelDigest: quiet(async () => LocalNotifications.cancel({ notifications: DIGEST_IDS.map(id => ({ id })) })),
    scheduleDigest: quiet(async ({ freq, time, title, body }) => {
      await LocalNotifications.cancel({ notifications: DIGEST_IDS.map(id => ({ id })) });
      if (freq === "Off") return true;
      if ((await LocalNotifications.checkPermissions()).display !== "granted") return false;
      const [hour, minute] = time.split(":").map(Number);
      const days = freq === "Weekdays" ? [Weekday.Monday, Weekday.Tuesday, Weekday.Wednesday, Weekday.Thursday, Weekday.Friday]
        : freq === "Weekly" ? [Weekday.Sunday] : [null];
      if (platform === "android") await LocalNotifications.createChannel({ id: "digest", name: "Daily digest", description: "One calm reminder when your good news is ready", importance: 3 });
      await LocalNotifications.schedule({
        notifications: days.map((weekday, i) => ({
          id: DIGEST_IDS[i], title, body, channelId: "digest", extra: { open: "dose" },
          schedule: { on: weekday ? { weekday, hour, minute } : { hour, minute }, repeats: true, allowWhileIdle: false },
        })),
      });
      return true;
    }),
    onOpen: cb => LocalNotifications.addListener("localNotificationActionPerformed", e => cb(e.notification?.extra?.open || "home")),
  },

  /* Optional app lock with Face ID, Touch ID, fingerprint, or the device passcode. */
  biometric: {
    available: quiet(async () => {
      const r = await BiometricAuth.checkBiometry();
      const type = r.biometryType === BiometryType.faceId ? "Face ID" : r.biometryType === BiometryType.touchId ? "Touch ID"
        : r.biometryType === BiometryType.none ? "passcode" : "fingerprint";
      return { available: r.isAvailable || r.deviceIsSecure, type };
    }),
    authenticate: async reason => {
      try {
        await BiometricAuth.authenticate({ reason, cancelTitle: "Cancel", allowDeviceCredential: true, iosFallbackTitle: "Use passcode", androidTitle: "Suspiciously positive", androidSubtitle: reason });
        return true;
      } catch { return false; }
    },
  },

  /* Saves a picture to app storage so a saved story shows it offline. Returns a URL the WebView can load. */
  cacheImage: quiet(async (id, url) => {
    const res = await CapacitorHttp.get({ url, responseType: "blob", connectTimeout: 10000, readTimeout: 15000 });
    if (res.status !== 200 || typeof res.data !== "string") return null;
    const path = `saved-images/${id}`;
    await Filesystem.writeFile({ path, data: res.data, directory: Directory.Data, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  }),
  removeImage: quiet(async id => Filesystem.deleteFile({ path: `saved-images/${id}`, directory: Directory.Data })),

  /* Data for the home-screen widget (read by the Android widget from SharedPreferences). */
  widget: quiet(async data => Preferences.set({ key: "widget", value: JSON.stringify(data) })),

  onBack: cb => App.addListener("backButton", cb),
  onResume: cb => App.addListener("resume", cb),
  onPause: cb => App.addListener("pause", cb),
  minimize: quiet(async () => (platform === "android" ? App.minimizeApp() : null)),
  statusBar: quiet(async dark => {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (platform === "android") await StatusBar.setBackgroundColor({ color: dark ? "#111915" : "#F6F2EA" });
  }),
  hideSplash: quiet(async () => SplashScreen.hide({ fadeOutDuration: 200 })),
};
