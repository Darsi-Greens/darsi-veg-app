const { getEnvConfig } = require('./config/app-env');

module.exports = ({ config }) => {
  const { appName, package: pkg, adaptiveIcon, adaptiveBg } = getEnvConfig();

  return {
    ...config,
    name:    appName,
    slug:    'nrb-vegetables',
    owner:   'nrbvegetables-darsi',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    android: {
      package: pkg,
      adaptiveIcon: {
        foregroundImage: adaptiveIcon,
        backgroundColor: adaptiveBg,
      },
    },
    ios: {
      bundleIdentifier: pkg,
      supportsTablet: true,
    },
    plugins: ['expo-asset', 'expo-font', 'expo-secure-store'],
    extra: {
      eas: { projectId: '86bdbe86-aa66-4041-b332-f5f3b4c1f7ce' },
    },
  };
};
