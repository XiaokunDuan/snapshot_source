'use client';

import { motion } from 'framer-motion';
import { useHaptics } from '@/hooks/useHaptics';
import { ImpactStyle } from '@capacitor/haptics';

interface PressableProps {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    enableHaptic?: boolean;
}

export const Pressable = ({ children, onClick, className = '', enableHaptic = true }: PressableProps) => {
    const { impact } = useHaptics();

    const handlePress = () => {
        if (enableHaptic) impact(ImpactStyle.Light);
        onClick?.();
    };

    return (
        <motion.div
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            onClick={handlePress}
            className={`cursor-pointer ${className}`}
        >
            {children}
        </motion.div>
    );
};
