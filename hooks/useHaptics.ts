import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const useHaptics = () => {
    const isNative = Capacitor.isNativePlatform();

    const impact = async (style: ImpactStyle = ImpactStyle.Medium) => {
        try {
            if (isNative) {
                await Haptics.impact({ style });
            } else {
                // Web fallback using Navigator.vibrate
                // Light: 10ms, Medium: 20ms, Heavy: 40ms
                const duration = style === ImpactStyle.Light ? 10 : style === ImpactStyle.Medium ? 20 : 40;
                if (navigator.vibrate) navigator.vibrate(duration);
            }
        } catch (e) {
            console.warn('Haptics failed', e);
        }
    };

    const notification = async (type: NotificationType = NotificationType.Success) => {
        try {
            if (isNative) {
                await Haptics.notification({ type });
            } else {
                // Web fallback
                const pattern = type === NotificationType.Success ? [10, 50, 20] : [50, 100, 50];
                if (navigator.vibrate) navigator.vibrate(pattern);
            }
        } catch (e) {
            console.warn('Haptics notification failed', e);
        }
    };

    const selection = async () => {
        try {
            if (isNative) {
                await Haptics.selectionStart();
                await Haptics.selectionChanged();
                await Haptics.selectionEnd();
            } else {
                if (navigator.vibrate) navigator.vibrate(5);
            }
        } catch (e) {
            console.warn('Haptics selection failed', e);
        }
    };

    return { impact, notification, selection };
};
