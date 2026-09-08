import type { ExpoConfig } from 'expo/config';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const development = process.env.EAS_BUILD_PROFILE !== 'production';
const config: ExpoConfig = {
  name: 'NearMe',
  slug: 'nearme',
  scheme: 'nearme',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.nearme.poc',
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Ta position permet de decouvrir les personnes proches. Elle reste approximative pour les autres.',
      ...(development
        ? {
            NSLocalNetworkUsageDescription: 'Connexion au serveur NearMe sur ton reseau local.',
            NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
          }
        : {}),
    },
  },
  android: {
    package: 'com.nearme.poc',
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: development } }],
    [
      'expo-location',
      { locationWhenInUsePermission: 'Autorise NearMe a te montrer les personnes a proximite.' },
    ],
    ['expo-notifications', { color: '#087F70', defaultChannel: 'messages' }],
  ],
  extra: { ...(projectId ? { eas: { projectId } } : {}) },
  web: { bundler: 'metro', output: 'single' },
};
export default config;
