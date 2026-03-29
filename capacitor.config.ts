import type { CapacitorConfig } from '@capacitor/cli';

const appUrl = process.env.CAP_SERVER_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://yulu34.top';
const appHost = new URL(appUrl).host;
const isLocalServer = appUrl.startsWith('http://localhost') || appUrl.startsWith('http://127.0.0.1');

const config: CapacitorConfig = {
    appId: 'com.yulu34.vocabulary',
    appName: 'Snapshot',
    webDir: 'public',
    server: {
        androidScheme: isLocalServer ? 'http' : 'https',
        url: appUrl,
        cleartext: isLocalServer,
        allowNavigation: [
            appHost,
            '*.yulu34.top',
            '*.vercel.app',
            'clerk.accounts.dev',
            '*.clerk.accounts.dev',
            'js.stripe.com',
            'hooks.stripe.com'
        ]
    },
    plugins: {
        Camera: {
            permissions: ['camera', 'photos']
        },
        SplashScreen: {
            backgroundColor: '#9FE870',
            showSpinner: false,
            androidScaleType: 'CENTER_CROP',
            splashFullScreen: true,
            splashImmersive: true,
            launchShowDuration: 2000
        }
    }
};

export default config;
