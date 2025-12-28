import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.yulu34.vocabulary',
    appName: 'Visual Vocabulary',
    webDir: 'out',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        Camera: {
            permissions: ['camera', 'photos']
        }
    }
};

export default config;
