import type { Scenario } from './types';

export const scenarios: Scenario[] = [
  {
    id: 'guest-intake',
    name: 'Guest Intake (Anonymous)',
    description: 'Anonymous visitor shares a case summary and gets the contact form prompt.',
    steps: [
      { type: 'user', content: "Hi, I'm looking for help with a landlord issue." },
      {
        type: 'contact_form_submit',
        contactData: {
          name: 'Jamie Tenant',
          email: 'jamie@example.com',
          phone: '555-123-4567',
          location: 'Seattle, WA',
          opposingParty: 'Landlord LLC',
          description: 'My landlord is not returning my security deposit.'
        }
      }
    ],
    mode: 'anonymous'
  }
];
