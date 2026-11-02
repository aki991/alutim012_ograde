import { defineConfig } from '@playwright/test';

// E2E test prijave: aplikacija se gradi sa lažnim Supabase adresom i ključem, a lažni server odgovara na prijavu.
export default defineConfig({
  testDir: 'e2e-auth',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', browserName: 'chromium', viewport: { width: 1440, height: 900 } },
  webServer: [
    { command: 'node e2e-auth/mock-supabase.mjs', port: 18321, reuseExistingServer: true },
    {
      command: 'npx vite build --outDir dist-auth && npx vite preview --outDir dist-auth --port 4174',
      url: 'http://localhost:4174',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_SUPABASE_URL: 'http://localhost:18321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    },
  ],
});
