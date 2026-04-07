# Needl Frontend

Frontend app for Needl (Expo + React Native + React Native Web).

## What Lives Here

- Mobile-first MongoDB Atlas explorer UI
- Authentication flow (Firebase client SDK)
- Collection/document browsing
- Document editing (compact / table / JSON)
- Search + query builder + saved queries
- Support modal (Stripe checkout launch)

## Requirements

- Node.js 18+
- npm
- Expo CLI (via `npx expo ...`)
- iOS Simulator / Android Emulator optional

## Environment Setup

Copy env template:

```bash
cp .env.example .env
```

Required:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

Optional but recommended:

- `EXPO_PUBLIC_DRIVER_API_URL`
  - iOS simulator: `http://127.0.0.1:3001`
  - Android emulator: `http://10.0.2.2:3001`
  - Physical device: `http://<your-lan-ip>:3001`

## Install & Run

```bash
npm install
npm run start
```

Useful scripts:

```bash
npm run ios
npm run android
npm run web
npm run build:web
```

## Main Frontend Modules

- `src/screens/ConnectionsHomeScreen.tsx` — connection list and main entry
- `src/screens/DocumentExplorerScreen.tsx` — querying + browsing documents
- `src/screens/DocumentEditScreen.tsx` — edit document views
- `src/screens/SettingsScreen.tsx` — display config + support entry
- `src/components/SupportDonateModal.tsx` — donation UI

## Troubleshooting

- App cannot reach backend:
  - Confirm `EXPO_PUBLIC_DRIVER_API_URL`
  - Confirm backend is running on reachable host/port
- Data operations fail:
  - Check Firebase auth status and token
  - Inspect backend logs for route/auth errors

