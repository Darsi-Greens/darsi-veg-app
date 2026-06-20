# దర్శి గ్రీన్స్ — Darsi Greens

React Native + Expo mobile app for **Darsi Greens** vegetable shop.
Telugu & English UI for daily sales entry, stock management, morning price setting, and vendor orders.
Built for low-literacy users with big buttons and photo-based vegetable selection.

## Features

- PIN-based login (no complex auth for shop staff)
- Morning price setting screen in Telugu + English
- Firebase Firestore for real-time price sync
- i18next for Telugu / English localisation
- Works offline-first with AsyncStorage cache

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Expo ~52 / React Native 0.76 |
| Navigation | React Navigation v6 |
| Backend | Firebase Firestore + Auth |
| i18n | i18next + react-i18next |
| Storage | expo-secure-store, AsyncStorage |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in Firebase credentials
cp .env.example .env

# 3. Start Expo
npm start
```

## Project Structure

```
src/
  firebase/
    config.js        Firebase initialisation
  screens/
    PinLogin.js      PIN entry screen (shop owner login)
    MorningPrices.js Set daily vegetable prices (Telugu + English)
```

## Environment Variables

See `.env.example` for all required variables.
All env vars are prefixed with `EXPO_PUBLIC_` to be available in the Expo client.
