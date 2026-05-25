import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';

export const AnimatedDropdown = ({
  visible,
  direction = 'down',
  className = 'widgets-list',
  children,
}: {
  visible: boolean;
  direction?: 'down' | 'up';
  className?: string;
  children: React.ReactNode;
}) => {
  const yOffset = direction === 'down' ? -8 : 8;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={className}
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: yOffset }}
          transition={{ duration: 0.15 }}
          style={{ display: 'block' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
