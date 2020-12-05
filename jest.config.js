module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '/tests/.*\.test\.ts',
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  }
};
