# Building the Android APK

The game is a static web app, so it is wrapped with Capacitor (the app is the same code, running in a WebView). Nothing in the game code changes.

## Easiest: build in the cloud (no Android Studio)
1. Create a free GitHub account and a new repository, then upload this whole project folder to it (the `.github` folder must be included).
2. Open the repository's **Actions** tab > **Build Android APK** > **Run workflow**.
3. After about 5-10 minutes, open the finished run and download **monarque-debug-apk** from *Artifacts*. Unzip it to get `app-debug.apk`, copy it to your phone and install it (allow "install unknown apps").
The cloud build also runs on every push to `main`. This gives a debug-signed APK, which is fine for testing and sharing. The Play Store needs a signed release build (see below).

## Or build on your computer
1. Install Node 20+, JDK 21, and Android Studio (it installs the Android SDK).
2. In this folder:
   ```
   npm install
   npm run build
   npx cap add android
   ```
3. Lock to landscape and go fullscreen: open `android/app/src/main/AndroidManifest.xml`, and on the `<activity ...>` tag add
   `android:screenOrientation="sensorLandscape"`.
4. App icon: in Android Studio, right-click `app/src/main/res` > New > Image Asset, and pick your icon.

## Every time you change the game
```
npm run android:sync
npm run android:open      # opens Android Studio
```

## Getting the APK
- **Test build:** Android Studio > Build > Build APK(s). The file is `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and install it (allow "install unknown apps").
- **Play Store build:** Build > Generate Signed Bundle / APK. Create a keystore, choose APK (or AAB for the Play Store), and pick `release`. KEEP the keystore file and its passwords safe: you need the same one for every future update.

Command line alternative (after `cap add android`): `cd android && ./gradlew assembleDebug`.

## Notes
- The app id is `com.monarque.cardsofthefallen`; change it in `capacitor.config.json` BEFORE `npx cap add android`, since it cannot be changed cleanly afterwards.
- Saved progress uses the WebView's localStorage, which stays on the device across app updates but is cleared if the app is uninstalled.
- Music is large (public/ is about 22 MB), so the APK will be roughly 25-30 MB.
