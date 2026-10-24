const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  // @noble e @scure (criptografia) só existem como ES modules: o Jest precisa transformá-los
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map(pattern =>
    pattern.startsWith('/node_modules/(?!(') ? pattern.replace('(?!(', '(?!(@noble|@scure|') : pattern
  ),
};
