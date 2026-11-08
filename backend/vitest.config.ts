import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: 'postgresql://ats:ats@localhost:5433/ats_test',
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      COOKIE_SECURE: 'false',
      S3_ENDPOINT: 'http://localhost:8333',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'resumes',
      S3_ACCESS_KEY: 'minioadmin',
      S3_SECRET_KEY: 'minioadmin',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
    },
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/index.ts'] },
  },
});
