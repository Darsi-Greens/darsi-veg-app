// Dynamic Expo config — reads APP_ENV to configure name, package ID, icon,
// and version suffix per environment.
//
// Local dev:  APP_ENV=development npx expo start   (or npm run start:dev)
// EAS build:  eas.json sets APP_ENV per profile automatically

const path = require('path');
const fs   = require('fs');

const APP_ENV = process.env.APP_ENV ?? 'development';

// Load .env.{APP_ENV} so app.config.js picks up the right EXPO_PUBLIC_APP_NAME
// before Expo has had a chance to load it.
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
    androidPackage: 'com.nrbveg.dev',
    icon:           './assets/icon-dev.png',
    adaptiveIcon:   './assets/adaptive-icon-dev.png',
    adaptiveBg:     '#b71c1c',
    versionSuffix:  '-dev',
    versionCode:    3,
  },
  staging: {
    name:           process.env.EXPO_PUBLIC_APP_NAME ?? 'NRB Veg BETA',
    androidPackage: 'com.nrbveg.staging',
    icon:           './assets/icon-staging.png',
    adaptiveIcon:   './assets/adaptive-icon-staging.png',
    adaptiveBg:     '#e65100',
    versionSuffix:  '-rc.1',
    versionCode:    2,
  },
  production: {
    name:           process.env.EXPO_PUBLIC_APP_NAME ?? 'NRB Vegetables',
    androidPackage: 'com.nrbveg.app',
    icon:           './assets/icon.png',
    adaptiveIcon:   './assets/adaptive-icon.png',
    adaptiveBg:     '#1a472a',
    versionSuffix:  '',
    versionCode:    1,
  },
};

const cfg = envConfig[APP_ENV] ?? envConfig.development;

module.exports = {
  expo: {
    name:        cfg.name,
    slug:        'nrb-vegetables',
    owner:       'nrbvegetables-darsi',
    version:     `1.0.0${cfg.versionSuffix}`,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],

    extra: {
      appEnv: APP_ENV,
      eas: { projectId: '86bdbe86-aa66-4041-b332-f5f3b4c1f7ce' },
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: cfg.androidPackage,
    },

    android: {
      package:      cfg.androidPackage,
      versionCode:  cfg.versionCode,
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
