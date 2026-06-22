const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK (v10) fix for React Native / Hermes:
// "Component auth has not been registered yet" happens because Metro's new
// package-exports resolver picks Firebase's browser build, which doesn't
// register the RN auth component. Disabling package exports + allowing .cjs
// forces the React-Native-compatible CommonJS build to load.
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
