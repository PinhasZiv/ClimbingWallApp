import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.climbingwall.routesetter',
  appName: 'Spray Wall Route Setter',
  webDir: 'dist',
  android: {
    // Photos and blobs are large local IndexedDB data; allow cleartext only
    // for local dev against the Vite server, never in the shipped build.
    allowMixedContent: false,
  },
};

export default config;
