module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/*.screen.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm/|@expo/|@react-navigation/|@react-native/|expo[^/]*/|expo/|react-native/|standard-navigation/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/tests/imageMock.cjs',
  },
};
