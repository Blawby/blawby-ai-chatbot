import type { Scenario } from './types';

export const scenarios: Scenario[] = [
  {
    id: 'guest-intake',
    name: 'Guest Intake (Anonymous)',
    description: 'Anonymous visitor shares a case summary and gets the contact form prompt.',
    steps: [
      { type: 'user', content: "Hi, I'm looking for help with a landlord issue." }
    ],
    mode: 'anonymous'
  }
];
