# iOS Release Checklist

## Native Build

- Xcode opens `ios/App/App.xcworkspace`.
- Target `App` uses the paid developer team.
- Bundle identifier is `com.schadegg.arena`.
- Display name is `BattleBots Arena`.
- iPhone/iPad orientation is landscape only.
- App icon uses `assets/title/app_icon.png`.
- Launch screen uses the branded title-screen artwork.
- Build runs on a real iPhone.

## Game Smoke Test

- Title screen loads with music after first tap.
- Mobile controls appear in the side gutters.
- `ATK`, `SWAP`, `DODGE`, `BLK`, and `PAUSE` work.
- Battle starts and ends without freezing.
- Victory/defeat buttons navigate away from the result screen.
- Music changes correctly between title, arena, victory, and defeat.
- Save/progression survives force quit and relaunch.
- App resumes cleanly after backgrounding.

## App Store Connect

- App record created for `com.schadegg.arena`.
- Category, age rating, pricing, and availability are filled out.
- Privacy policy URL is available.
- Privacy nutrition labels are completed accurately.
- Support URL is available.
- Screenshots are uploaded for required iPhone sizes.
- App description, keywords, subtitle, and promotional text are drafted.
- First upload goes through TestFlight before App Review.

## Build Commands

Run after web/game changes:

```bash
npm run ios:sync
```

Open Xcode:

```bash
npm run ios:open
```

Archive for App Store from Xcode:

```text
Product > Archive
```
