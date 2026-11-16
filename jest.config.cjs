const domainCriticalGlobs = [
  'src/billing/domain/entities/budget.ts',
  'src/billing/domain/entities/payment.ts',
  'src/billing/application/use-case/budget/generate-budget-from-event.ts',
  'src/billing/application/use-case/budget/mark-budget-approved.ts',
];

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: domainCriticalGlobs,
  coveragePathIgnorePatterns: ['\\.spec\\.ts$'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 65,
      functions: 80,
      lines: 80,
    },
  },
};
