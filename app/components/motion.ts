// Shared motion presets so animations stay consistent across the app.
// Re-exports the bits of `motion/react` we use, plus named variants.
"use client";

export { motion, AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";
import type { Transition, Variants } from "motion/react";

// Default snappy spring — feels native, doesn't drag.
export const spring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.6,
};

// A softer spring for larger movements / reorder
export const springSoft: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 26,
  mass: 0.8,
};

// Gentle 200ms tween for non-spring transitions (color/opacity).
export const tween: Transition = { duration: 0.2, ease: "easeOut" };

// List item — used for bucket list, occasions, history rows
export const listItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, x: -32, transition: { duration: 0.18, ease: "easeIn" } },
};

// Chat bubble — slight slide-in from the side it lives on
export const chatBubble: Variants = {
  initial: (mine: boolean) => ({ opacity: 0, y: 8, x: mine ? 16 : -16, scale: 0.94 }),
  animate: { opacity: 1, y: 0, x: 0, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.15 } },
};

// Toast — slides up from the bottom and pops in with a spring
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.15 } },
};

// Generic fade-up — for cards / sections appearing on mount
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: spring },
};

// Tap feedback — slight squeeze
export const tapPress = { scale: 0.94 };
