'use client';

import { motion } from 'framer-motion';

export const PageTransition = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

export const FadeIn = ({ children, delay = 0, className }: { children: React.ReactNode, delay?: number, className?: string }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, type: "spring", stiffness: 260, damping: 20 }}
            className={className}
        >
            {children}
        </motion.div>
    )
}
