import { loadStripe } from '@stripe/stripe-js';

// Centralized Stripe key access from environment variables
const STRIPE_KEY = import.meta.env.VITE_STRIPE_KEY || '';

// Stripe promise initialized with the environment key
export const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

// Helper to quickly check if payment features are available
export const hasStripeKey = Boolean(STRIPE_KEY);
