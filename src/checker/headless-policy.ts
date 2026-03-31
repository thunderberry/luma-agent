import type { LaunchOptions } from 'playwright';

export function resolveStrictHeadlessSetting(
  envValue: string | undefined = process.env.LUMA_HEADLESS,
): true {
  if (!envValue) {
    return true;
  }

  const normalized = envValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }

  throw new Error(
    `LUMA_HEADLESS must remain true for this project. Received: ${envValue}`,
  );
}

export function buildChromiumLaunchOptions(): LaunchOptions {
  resolveStrictHeadlessSetting();

  return {
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  };
}
