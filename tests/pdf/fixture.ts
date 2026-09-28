import { localOrigin, requireSetting, fixtureId, type TestEnvironment } from '../e2e/support/contracts';
export function readPrintFixture(env: TestEnvironment = process.env) {
  const secret = requireSetting(env, 'PDF_PRINT_TOKEN_SECRET');
  if (secret.length < 32) throw new Error('BLOCKED: local print secret must be at least 32 characters.');
  return {
    origin: localOrigin(requireSetting(env, 'APP_BASE_URL')),
    renderer: localOrigin(requireSetting(env, 'GOTENBERG_URL')),
    secret,
    employeeId: fixtureId(env, 'E2E_EMPLOYEE_ID'), companyId: fixtureId(env, 'E2E_COMPANY_ID'), userId: fixtureId(env, 'E2E_PROFILE_ID'),
    employeeName: requireSetting(env, 'E2E_EMPLOYEE_NAME'), companyName: requireSetting(env, 'E2E_COMPANY_NAME'),
  };
}
