export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGIN?: string;
  PORT?: string;
}

export function validateEnv(config: Record<string, unknown>): Env {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    ...config,
    JWT_EXPIRES_IN: (config.JWT_EXPIRES_IN as string) || '1h',
  } as unknown as Env;
}
