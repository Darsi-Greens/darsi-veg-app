const ENV = {
  development: {
    appName:   'NRB Veg DEV',
    package:   'com.nrbveg.dev',
    envBanner: 'DEV',
    icon:      './assets/icon-dev.png',
    adaptiveIcon: './assets/adaptive-icon-dev.png',
    adaptiveBg:   '#b71c1c',
  },
  staging: {
    appName:   'NRB Veg BETA',
    package:   'com.nrbveg.staging',
    envBanner: 'BETA',
    icon:      './assets/icon-staging.png',
    adaptiveIcon: './assets/adaptive-icon-staging.png',
    adaptiveBg:   '#e65100',
  },
  production: {
    appName:   'NRB Vegetables',
    package:   'com.nrbveg.app',
    envBanner: '',
    icon:      './assets/icon.png',
    adaptiveIcon: './assets/adaptive-icon.png',
    adaptiveBg:   '#1a472a',
  },
};

const getEnvConfig = () => {
  const env = process.env.APP_ENV || 'development';
  if (!ENV[env]) throw new Error(`Unknown APP_ENV "${env}". Must be development | staging | production.`);
  return { ...ENV[env], env };
};

module.exports = { getEnvConfig };
