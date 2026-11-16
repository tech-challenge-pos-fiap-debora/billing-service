/** Jest config dedicado ao caminho BDD (Gherkin + jest-cucumber). */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testMatch: ['<rootDir>/test/bdd/**/*.steps.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  testEnvironment: 'node',
  verbose: true,
};
