import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.yulu34.vocabulary',
    appName: 'Snapshot',
    webDir: 'out',
    server: {
        androidScheme: 'https',
        url: 'http://100.76.196.59:3000', // LAN IP for physical device
        cleartext: true,
        allowNavigation: ['*']
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
