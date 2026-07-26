import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  moduleNameMapper: {
    '^@card-game/shared-types$': '<rootDir>/../packages/shared-types/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Redirects DATABASE_URL to the isolated `cardgame_test` database BEFORE
  // AppModule/data-source ever read process.env — see test/env.setup.ts.
  // Without this, e2e suites run against whatever the dev .env points at,
  // which is now a database holding real, non-reproducible card/player data.
  setupFiles: ['<rootDir>/test/env.setup.ts'],
  testTimeout: 120000,
};

export default config;
