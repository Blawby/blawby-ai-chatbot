-- Seed default blawby-ai organization (idempotent)
-- This organization is critical for public/default mode
-- Fixed ID must match src/utils/constants.ts DEFAULT_ORGANIZATION_ID

INSERT OR IGNORE INTO organizations (
  id,
  slug,
  name,
  domain,
  subscription_tier,
  seats,
  is_personal,
  config,
  created_at,
  updated_at
) VALUES (
  '01K0TNGNKTM4Q0AG0XF0A8ST0Q',
  'blawby-ai',
  'Blawby AI',
  'ai.blawby.com',
  'free',
  1,
  0,
  json('{
    "aiProvider": "workers-ai",
    "aiModel": "@cf/openai/gpt-oss-20b",
    "aiModelFallback": ["@cf/openai/gpt-oss-20b"],
    "consultationFee": 0,
    "requiresPayment": false,
    "availableServices": [
      "Family Law",
      "Business Law",
      "Contract Review",
      "Intellectual Property",
      "Employment Law",
      "Personal Injury",
      "Criminal Law",
      "Civil Law",
      "General Consultation"
    ],
    "serviceQuestions": {
      "Family Law": [
        "I understand this is a difficult time. Can you tell me what type of family situation you''re dealing with?",
        "What are the main issues you''re facing?",
        "Have you taken any steps to address this situation?",
        "What would a good outcome look like for you?"
      ],
      "Business Law": [
        "What type of business entity are you operating or planning to start?",
        "What specific legal issue are you facing with your business?",
        "Are you dealing with contracts, employment issues, or regulatory compliance?",
        "What is the size and scope of your business operations?"
      ],
      "Contract Review": [
        "What type of contract do you need reviewed?",
        "What is the value or importance of this contract?",
        "Are there any specific concerns or red flags you''ve noticed?",
        "What is the timeline for this contract?"
      ],
      "Intellectual Property": [
        "What type of intellectual property are you dealing with?",
        "Are you looking to protect, license, or enforce IP rights?",
        "What is the nature of your IP (patent, trademark, copyright, trade secret)?",
        "What is the commercial value or importance of this IP?"
      ],
      "Employment Law": [
        "What specific employment issue are you facing?",
        "Are you an employer or employee in this situation?",
        "Have you taken any steps to address this issue?",
        "What is the timeline or urgency of your situation?"
      ],
      "Personal Injury": [
        "Can you tell me about the incident that caused your injury?",
        "What type of injuries did you sustain?",
        "Have you received medical treatment?",
        "What is the current status of your recovery?"
      ],
      "Criminal Law": [
        "What type of legal situation are you facing?",
        "Are you currently facing charges or under investigation?",
        "Have you been arrested or contacted by law enforcement?",
        "Do you have an attorney representing you?"
      ],
      "Civil Law": [
        "What type of civil legal issue are you dealing with?",
        "Are you involved in a lawsuit or considering legal action?",
        "What is the nature of the dispute?",
        "What outcome are you hoping to achieve?"
      ],
      "General Consultation": [
        "Thanks for reaching out! I''d love to help. Can you tell me what legal situation you''re dealing with?",
        "Have you been able to take any steps to address this yet?",
        "What would a good outcome look like for you?",
        "Do you have any documents or information that might be relevant?"
      ]
    },
    "description": "AI-powered legal assistance for businesses and individuals",
    "brandColor": "#2563eb",
    "accentColor": "#3b82f6",
    "introMessage": "Hello! I''m Blawby AI, your intelligent legal assistant. I can help you with family law, business law, contract review, intellectual property, employment law, personal injury, criminal law, civil law, and general legal consultation. How can I assist you today?",
    "voice": {
      "enabled": false,
      "provider": "cloudflare",
      "voiceId": null,
      "displayName": null,
      "previewUrl": null
    },
    "blawbyApi": {
      "enabled": false,
      "apiUrl": "https://staging.blawby.com"
    }
  }'),
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);


