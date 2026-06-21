module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Force 'default' transform profile so Babel compiles private class fields (#field)
      // instead of leaving them for Hermes to handle natively.
      // Expo Go's Hermes JIT does not support private class fields in dev mode.
      ['babel-preset-expo', { unstable_transformProfile: 'default' }],
    ],
  };
};
