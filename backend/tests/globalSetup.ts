import { execSync } from 'node:child_process';

const TEST_DB = 'postgresql://ats:ats@localhost:5433/ats_test';

export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DB },
  });
}
