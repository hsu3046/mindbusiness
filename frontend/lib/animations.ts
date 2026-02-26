// Animation configuration for Framer Motion
// Design Philosophy: Organic Growth, Sprouting Animation

export const springTransition = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
}

export const gentleSpring = {
    type: "spring" as const,
    stiffness: 200,
    damping: 25,
}

// Stagger container for sequential children animation
export const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1,
        }
    }
}

// Sprouting animation for child items
export const sproutingItem = {
    hidden: {
        opacity: 0,
        y: 20,
        scale: 0.8
    },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: springTransition
    }
}

// Fade in animation
export const fadeIn = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.3 }
    }
}

// Slide up animation
export const slideUp = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: gentleSpring
    }
}

// Breathing glow CSS (for Whisper nodes)
export const breathingGlowCSS = `
  @keyframes breathe {
    0%, 100% { 
      box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
    }
    50% { 
      box-shadow: 0 0 25px rgba(99, 102, 241, 0.6);
    }
  }
  
  .whisper-glow {
    animation: breathe 2s ease-in-out infinite;
  }
`

// Glassmorphism styles
export const glassStyles = {
    background: "bg-white/80 backdrop-blur-md",
    border: "border border-white/30",
    shadow: "shadow-lg shadow-black/5",
}
