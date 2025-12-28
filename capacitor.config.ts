import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.yulu34.vocabulary',
    appName: 'Snapshot',
    webDir: 'out',
    server: {
        androidScheme: 'https',
        url: 'http://10.0.2.2:3000', // Points to dev server from Android Emulator
        cleartext: true,
        allowNavigation: ['10.0.2.2']
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
