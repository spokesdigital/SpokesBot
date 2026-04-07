/**
 * Environment variable validation — fails fast at server start if any required
 * variable is missing so the error is obvious instead of surfacing later as a
 * cryptic undefined-is-not-a-function at runtime.
 *
 * Pattern: declare the schema, validate once on module load, export the
 * typed env object. Import `env` everywhere instead of `process.env.*` directly.
 */

type EnvSchema = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_API_URL: string;
};

function validateEnv(): EnvSchema {
  const required: (keyof EnvSchema)[] = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_API_URL",
  ];

  const missing: string[] = [];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[SpokesBot] Missing required environment variables:\n` +
        missing.map((k) => `  • ${k}`).join("\n") +
        `\n\nCopy frontend/.env.local.example to frontend/.env.local and fill in the values.`
    );
  }

  // Validate URL shapes
  const urlVars: (keyof EnvSchema)[] = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_API_URL",
  ];
  for (const key of urlVars) {
    const value = process.env[key]!;
    try {
      new URL(value);
    } catch {
      throw new Error(
        `[SpokesBot] ${key} must be a valid URL, got: "${value}"`
      );
    }
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL!,
  };
}

export const env = validateEnv();
