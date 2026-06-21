// Dynamic Expo config — reads APP_ENV to configure per-environment name,
// package ID, and icon. Load the right .env.* file before running expo:
//   APP_ENV=development npx expo start
//   APP_ENV=staging     npx expo start
//   APP_ENV=production  npx expo start

const path = require('path');
const fs   = require('fs');

const APP_ENV = process.env.APP_ENV ?? 'development';

// Manually parse .env.{APP_ENV} so app.config.js picks up the right project ID
// even when Expo hasn't loaded the dotenv file yet.
function loadEnvFile(filename) {
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(`.env.${APP_ENV}`);

const envConfig = {
  development: {
    name:           process.env.EXPO_PUBLIC_APP_NAME ?? 'NRB Veg DEV',
    slug:           'darsi-veg-app-dev',
    androidPackage: 'com.darsigreens.veg.dev',
    icon:           './assets/icon-dev.png',
    adaptiveIcon:   './assets/adaptive-icon-dev.png',
    adaptiveBg:     '#e65100',
  },
  staging: {
    name:           process.env.EXPO_PUBLIC_APP_NAME ?? 'NRB Veg QA',
    slug:           'darsi-veg-app-staging',
    androidPackage: 'com.darsigreens.veg.staging',
    icon:           './assets/icon-staging.png',
    adaptiveIcon:   './assets/adaptive-icon-staging.png',
    adaptiveBg:     '#f57f17',
  },
  production: {
    name:           process.env.EXPO_PUBLIC_APP_NAME ?? 'NRB Vegetables',
    slug:           'darsi-veg-app',
    androidPackage: 'com.darsigreens.veg',
    icon:           './assets/icon.png',
    adaptiveIcon:   './assets/adaptive-icon.png',
    adaptiveBg:     '#1a472a',
  },
};

const cfg = envConfig[APP_ENV] ?? envConfig.development;

// Version suffix per environment
const VERSION_SUFFIX = { development: '-dev', staging: '-rc.1', production: '' };
const versionCode = APP_ENV === 'production' ? 1 : APP_ENV === 'staging' ? 2 : 3;

module.exports = {
  expo: {
    name:        cfg.name,
    slug:        cfg.slug,
    version:     `1.0.0${VERSION_SUFFIX[APP_ENV] ?? '-dev'}`,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],

    // Extra env metadata accessible via expo-constants
    extra: {
      appEnv: APP_ENV,
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: cfg.androidPackage,
    },

    android: {
      package:         cfg.androidPackage,
      versionCode,
      adaptiveIcon: {
        foregroundImage: cfg.adaptiveIcon,
        backgroundColor: cfg.adaptiveBg,
      },
    },

    plugins: [
      'expo-asset',
      'expo-font',
      'expo-secure-store',
    ],
  },
};
