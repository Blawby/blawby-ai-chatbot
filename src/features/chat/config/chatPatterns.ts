export const CHAT_PATTERNS: Record<string, { affirmative: RegExp; negative: RegExp }> = {
  en: {
    affirmative: /^(y|yea|yeah|yep|yup|yes|sure|ok|okay|ready|submit)$/i,
    negative: /^(n|no|nope|not yet|later|wait)$/i
  },
  // Add other languages here as needed
};

export const getChatPatterns = (lng: string = 'en') => {
  return CHAT_PATTERNS[lng] || CHAT_PATTERNS['en'];
};
