import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Points to the Next.js app so jest can load next.config.ts and .env.local
  dir: "./",
});

const config: Config = {
  displayName: "SpokesBot",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Collect coverage from source files
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/**/layout.tsx",
    "!src/app/**/page.tsx",
    "!src/lib/env.ts",
  ],

  // Map path aliases to match tsconfig paths
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Only pick up unit tests in tests/components/ — Playwright owns e2e/
  testMatch: ["<rootDir>/tests/components/**/*.test.{ts,tsx}"],
};

export default createJestConfig(config);
