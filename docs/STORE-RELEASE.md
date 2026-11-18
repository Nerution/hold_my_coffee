# Publishing Suspiciously positive on Google Play and the App Store

The mobile app is a [Capacitor](https://capacitorjs.com) project: the web app is bundled inside native Android and iOS shells, with native plugins for the device features. This guide covers everything from a first test build to the store forms.

## What is in the app

| Area | How it works |
| --- | --- |
| Bundled app | `npm run build` copies the page, translations, fonts, the native bridge and the privacy policy into `www/`. Capacitor puts that folder inside the app, so nothing is loaded from a remote URL except news data and pictures. |
| Offline | The last story list, the reader's settings and full copies of saved stories (with their pictures) are stored on the device. Without a connection the app opens normally and says "Offline · stories from …". |
| Daily digest | Local notifications scheduled on the phone (`@capacitor/local-notifications`). Daily, weekdays or weekly at a chosen time. Off until the reader turns it on. Tapping one opens the Daily Dose. |
| Share | The system share sheet (`@capacitor/share`). |
| Articles | Open in the in-app browser: Safari View Controller on iOS, Custom Tabs on Android (`@capacitor/browser`). |
| App lock | Optional. Face ID, Touch ID, fingerprint or device passcode (`@aparajita/capacitor-biometric-auth`). It asks again after the app has been in the background for more than a minute. |
| Widget | Android: included (`GoodNewsWidget.java`), shows the top headline the app last loaded. iOS: source in `ios/GoodThingsWidget/`, added in Xcode (see below). |
| System | Android back button, status bar matching light/dark mode, native splash screen, network status. |
| Delete my data | Profile → Privacy → Delete my data. This removes everything the app stored and cancels reminders. |

The bridge to the device is `src/native.js`. The page calls it as `window.GTNative` and falls back to web behaviour in the browser.

## What you need

- **The news server online over HTTPS.** The app can't use `localhost`. The quickest route is `render.yaml`: in Render, choose New → Blueprint and pick this repository. Note the address, for example `https://good-things.onrender.com`.
- **For Android:** Android Studio (a 2025 or newer release, for Android SDK 36) and a [Google Play Console](https://play.google.com/console) account (one-time fee).
- **For iOS:** a Mac with a current Xcode and an [Apple Developer Program](https://developer.apple.com/programs/) membership (yearly fee). The project uses Swift Package Manager, so CocoaPods is not needed.

## Before the first upload

1. **Choose the app ID.** It is set to `com.goodthings.news` in `capacitor.config.json`, and it can never change once the app is published.
   - To use your own (for example `com.yourname.goodthings`), change it in `capacitor.config.json`.
   - On Android, also change `namespace` and `applicationId` in `android/app/build.gradle`, and move `MainActivity.java` and `GoodNewsWidget.java` into the matching package folder.
   - On iOS, change the Bundle Identifier in Xcode.
2. **Check the name.** Check that no app on either store already uses "Suspiciously positive". Store listings allow up to 30 characters, and the name has 21.
3. **Fill in the privacy policy.** Replace every highlighted `[…]` in `privacy.html`: date, your name or company and address, contact email, server address and hosting provider. Then redeploy the server. The policy will be at `https://<your server>/privacy.html`.

## Build

```bash
npm install
GOOD_THINGS_API_URL=https://good-things.onrender.com npm run sync
```

`npm run sync` builds `www/` and copies it into both native projects. Run it again after every change to `index.html`, `i18n.js` or `src/native.js`. `GOOD_THINGS_PRIVACY_URL` overrides the policy link; it defaults to `<server>/privacy.html`.

Icons and splash screens are generated from the files in `assets/` with `npm run assets`. To restyle them, replace those PNGs and run it again.

### Android

```bash
npm run android
```

This opens Android Studio. Run it on an emulator or phone to test.

For a release, choose Build → Generate Signed App Bundle, create an upload key, and keep the keystore and its passwords safe. Upload the `.aab` file to Play Console, starting with Internal testing. Use Play App Signing; Play Console suggests it by default.

To test against a news server on your computer from the Android emulator, temporarily set these in `capacitor.config.json`:
- `"server": { "cleartext": true }`;
- `"android": { "allowMixedContent": true }`.

Then build with `GOOD_THINGS_API_URL=http://10.0.2.2:8787`. Remove both settings before a release.

### iOS

```bash
npm run ios
```

This opens Xcode.
1. Under Signing & Capabilities, choose your Team and confirm the Bundle Identifier.
2. Run it on a simulator or a phone.
3. For a release, choose Product → Archive, then Distribute App → App Store Connect, and test through TestFlight first.

To add the widget:
1. Choose File → New → Target → Widget Extension, name it `GoodThingsWidget`, and untick Live Activity and Configuration Intent.
2. Replace the generated Swift file with `ios/GoodThingsWidget/GoodThingsWidget.swift`, and delete the generated `…Bundle.swift`.
3. In the widget's Info.plist, add `GoodThingsAPIURL` with your server address.

The widget fetches the newest headline from the server itself, so it needs no App Group.

## Privacy and data declarations

Both stores ask what data the app collects. The answers below match the app as built. Check them again if you add analytics, accounts, purchases, remote push or crash reporting.

### What actually happens

- **On the device:** everything personal stays on the device: settings, saved stories, history and the optional name.
  - Android cloud backup and device transfer are switched off in `data_extraction_rules.xml`, so the policy's "stays on this device" holds.
- **News requests:** the app requests stories from your server with only the language. The server keeps no request logs and no IP addresses. Make sure your hosting doesn't either, or that its logs are short-lived and used only for security.
- **Pictures:** these load straight from publishers' servers, which see the reader's IP address.
- **Server-side services:** translation (Google) and the optional AI review (Anthropic) are called by the server and receive news text only.

### Apple: App Privacy ("nutrition label")

- **Do you or your third-party partners collect data from this app?** No. Apple doesn't count data that is used only to answer a request and isn't kept. If your server or hosting keeps logs that include IP addresses, answer again with that in mind.
- **Tracking:** No.
- **Privacy manifest:** `ios/App/App/PrivacyInfo.xcprivacy` is already in the Xcode project. It declares no tracking, no collected data, and use of UserDefaults (reason `CA92.1`).
- **Face ID:** `NSFaceIDUsageDescription` is set in `Info.plist`.
- **Encryption:** `ITSAppUsesNonExemptEncryption` is `false`. The app uses only standard HTTPS, so no export documents are needed.
- **Privacy policy URL:** `https://<your server>/privacy.html`.

### Google Play: Data safety

- **Does your app collect or share any of the required user data types?** No. IP addresses used only to deliver content fall under Google's "processed ephemerally" exception, as long as they aren't kept.
- **Is all of the user data collected by your app encrypted in transit?** Yes. Your server must use HTTPS.
- **Do you provide a way for users to request that their data is deleted?** No data is collected. The app also has Delete my data.
- **Privacy policy:** the same URL as above.

Permissions in the Android build, with the reason for each:

| Permission | Why |
| --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Load stories, and notice when the phone goes offline |
| `POST_NOTIFICATIONS` | The daily digest reminder, asked only when the reader turns it on |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | Keep scheduled reminders after a restart (added by the notifications plugin) |
| `USE_BIOMETRIC` | The optional app lock |

`SCHEDULE_EXACT_ALARM` is removed on purpose: Google Play restricts it, and a daily reminder doesn't need to fire to the minute.

## Store review: things to get right

- **Minimum functionality (Apple 4.2):** Apple rejects apps that are only a website in a frame. In the review notes, point to the offline reading, reminders, widget, app lock and share sheet.
- **Content rights (Apple 5.2, Google Play intellectual property):** the app shows publishers' headlines, short descriptions and pictures, always with the source and a link.
  - Headlines with links are common practice.
  - Pictures and longer excerpts can raise copyright questions, so consider an agreement with the main outlets, licensed pictures, or headline-only cards before a public launch.
- **News apps on Google Play:** if you choose the News & Magazines category, Play Console asks you to fill in its News declaration. It asks for contact details and for sources to be clearly shown, and each story already shows its publisher.
- **AI content:** AI summaries are labelled in the app, as both stores expect.
- **Ratings:** answer the age-rating questionnaires honestly. The app has no user-generated content and no chat. Articles open in the system's in-app browser.
- **Free with no purchases:** the Plans screen is hidden in the app build, because both stores require in-app purchases for digital Premium features. Add those with the stores' billing systems before offering Premium, and update both privacy forms then.

## Later: remote push notifications

Reminders are local today, which needs no server or accounts. To send notifications for real news events, you would need to:

1. Add `@capacitor/push-notifications`.
2. Create a Firebase project for Android (`google-services.json`) and an APNs key for iOS.
3. Have the server store device tokens and send pushes.

Device tokens are identifiers, so the privacy policy and both store forms would then need updating: Apple's "Identifiers" category and Google's "Device or other IDs".
