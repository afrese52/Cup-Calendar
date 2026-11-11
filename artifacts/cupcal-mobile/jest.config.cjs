module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/*.screen.test.tsx'],
  transformIgnorePatterns: ['node_modules/(?!\\.pnpm/|@react-native/|react-native/)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
