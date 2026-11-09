import Constants from 'expo-constants';

type Extra = Record<string, string | number | boolean | null | undefined>;

interface Reporter {
  captureMessage(message: string, extra?: Extra): void;
  captureError(error: unknown, extra?: Extra): void;
}

const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn
  ?? process.env.EXPO_PUBLIC_SENTRY_DSN
  ?? '';

const consoleReporter: Reporter = {
  captureMessage(message, extra) {
    if (extra) console.warn('[observability]', message, extra);
    else console.warn('[observability]', message);
  },
  captureError(error, extra) {
    if (extra) console.warn('[observability]', error, extra);
    else console.warn('[observability]', error);
  },
};

let active: Reporter = consoleReporter;

if (dsn) {
  // Sentry SDK is intentionally not a required dependency so the base APK stays small.
  // To wire up remote reporting, `npm install sentry-expo`, uncomment the init below,
  // and keep the DSN only in Expo environment variables, never in source.
  //
  // import * as Sentry from 'sentry-expo';
  // Sentry.init({ dsn, enableInExpoDevelopment: false, tracesSampleRate: 0.1 });
  // active = {
  //   captureMessage: (m, extra) => Sentry.Native.captureMessage(m, { extra }),
  //   captureError: (e, extra) => Sentry.Native.captureException(e, { extra }),
  // };
  console.info('[observability] Sentry DSN detected but SDK not installed; using console reporter.');
}

export function reportMessage(message: string, extra?: Extra): void {
  active.captureMessage(message, extra);
}

export function reportError(error: unknown, extra?: Extra): void {
  active.captureError(error, extra);
}

export function observabilityConfigured(): boolean {
  return dsn.length > 0;
}
