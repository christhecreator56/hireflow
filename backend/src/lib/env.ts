// Load .env before anything reads process.env (Node 22 built-in, no dotenv).
try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on real environment (Docker / CI)
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? '',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'resumes',
    accessKey: process.env.S3_ACCESS_KEY ?? '',
    secretKey: process.env.S3_SECRET_KEY ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.MAIL_FROM ?? 'ATS <no-reply@ats.local>',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
};

/**
 * Settings the API cannot run without. Reported instead of thrown: a throw at import time
 * crashes a serverless function on every request (FUNCTION_INVOCATION_FAILED) with no readable error.
 */
export const missingConfig = [
  ...(!env.jwtSecret || env.jwtSecret.length < 16 ? ['JWT_SECRET (16+ characters)'] : []),
  ...(!process.env.DATABASE_URL ? ['DATABASE_URL'] : []),
];
if (missingConfig.length) console.error(`Missing configuration: ${missingConfig.join(', ')}`);
