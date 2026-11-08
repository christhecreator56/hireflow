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
  },
};

if (!env.jwtSecret || env.jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be set (min 16 chars)');
}
