import { defineConfig, devices } from '@playwright/test';

// Testa o build do Artifact (dist/preview.html) servido localmente, no modo de banco
// local (fora do claude.ai não há `claude.use("db")`). Rode `npm run build` antes.
const PORTA = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    timezoneId: 'America/Sao_Paulo',
    locale: 'pt-BR',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: {
    command: `node scripts/servir-preview.mjs ${PORTA}`,
    port: PORTA,
    reuseExistingServer: true,
  },
});
