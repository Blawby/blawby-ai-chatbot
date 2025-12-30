import type { Scenario } from './types';
import { createFileAttachment } from './utils';

export const scenarios: Scenario[] = [
  {
    id: 'simple-exchange',
    name: 'Simple Exchange',
    description: 'User sends a message and practice member responds after a short delay.',
    steps: [
      { type: 'user', content: 'Hello, I need help with a legal matter.' },
      { type: 'practice_member', content: "Hello! I'd be happy to help. Can you tell me more about your situation?", delay: 1200 }
    ]
  },
  {
    id: 'multi-turn',
    name: 'Multi-turn Conversation',
    description: 'Back-and-forth exchange to test scrolling and batching.',
    steps: [
      { type: 'user', content: 'I have a question about employment law.' },
      { type: 'practice_member', content: 'I can help with that. What specific issue are you facing?', delay: 1500 },
      { type: 'user', content: 'I was wrongfully terminated from my job.' },
      { type: 'practice_member', content: "I'm sorry to hear that. When did this happen?", delay: 1000 },
      { type: 'user', content: 'Last week, on Monday.' },
      { type: 'practice_member', content: 'Thanks for sharing. Let’s schedule a consultation to review your options.', delay: 1600 }
    ]
  },
  {
    id: 'long-message',
    name: 'Long Message',
    description: 'Assistant sends a long streaming-style response.',
    steps: [
      { type: 'user', content: 'Can you summarize the intake steps?' },
      { type: 'practice_member', content: 'Absolutely. I will draft a detailed walkthrough for you now.', delay: 800 }
    ]
  },
  {
    id: 'with-attachments',
    name: 'With Attachments',
    description: 'User sends files and receives an acknowledgement.',
    steps: [
      {
        type: 'user',
        content: 'Here are the supporting documents.',
        attachments: [
          createFileAttachment('evidence.pdf', 'application/pdf', 1024 * 250),
          createFileAttachment('photo.jpg', 'image/jpeg', 1024 * 500)
        ]
      },
      { type: 'practice_member', content: 'Thanks! I have received the documents and will review them shortly.', delay: 1200 }
    ]
  },
  {
    id: 'multiple-participants',
    name: 'Multiple Participants',
    description: 'Simulate multiple practice members with avatars.',
    steps: [
      { type: 'practice_member', content: 'Hi, this is Taylor (paralegal). I’ll gather initial details.', delay: 400 },
      { type: 'practice_member', content: 'Hey, Alex (attorney) here. I’ll step in for the legal review.', delay: 1200 },
      { type: 'user', content: 'Great, thank you both.' },
      { type: 'practice_member', content: 'We’ll coordinate and follow up with next steps.', delay: 900 }
    ]
  },
  {
    id: 'error-state',
    name: 'Error State',
    description: 'Simulate a failed message delivery.',
    steps: [
      { type: 'user', content: 'Is my payment plan set up?' },
      { type: 'practice_member', content: 'Let me check on that for you.', delay: 700 },
      { type: 'user', content: 'I still do not see it.', attachments: [createFileAttachment('screenshot.png', 'image/png', 1024 * 150)] }
    ]
  }
];
