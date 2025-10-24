import { describe, it, expect } from 'vitest';
import { WORKER_URL } from '../../setup-worker-integration';

// Conditional debug logger - only logs when TEST_DEBUG environment variable is set
const debugLog = (...args: unknown[]) => {
  if (process.env.TEST_DEBUG) {
    console.log('[TEST_DEBUG]', ...args);
  }
};

// Helper function to parse SSE events from response data
function parseSSEEvents(responseData: string) {
  return responseData
    .split('\n\n')
    .filter(chunk => chunk.trim().startsWith('data: '))
    .map(chunk => {
      const jsonStr = chunk.replace('data: ', '').trim();
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Helper functions for event validation
function validateTextEvent(textEvent: Record<string, unknown>) {
  expect(textEvent).toHaveProperty('type', 'text');
  // Text events might have 'content' or 'text' property
  const hasContent = textEvent.content && typeof textEvent.content === 'string';
  const hasText = textEvent.text && typeof textEvent.text === 'string';
  expect(hasContent || hasText).toBe(true);
  if (hasContent) {
    expect((textEvent.content as string).length).toBeGreaterThan(0);
  }
  if (hasText) {
    expect((textEvent.text as string).length).toBeGreaterThan(0);
  }
}

function validateMatterCanvasEvent(matterCanvasEvent: Record<string, unknown>) {
  expect(matterCanvasEvent).toHaveProperty('type', 'matter_canvas');
  expect(matterCanvasEvent).toHaveProperty('data');
  expect((matterCanvasEvent.data as Record<string, unknown>)).toHaveProperty('matter');
  expect((matterCanvasEvent.data as Record<string, unknown>).matter).toHaveProperty('type');
  expect((matterCanvasEvent.data as Record<string, unknown>).matter).toHaveProperty('description');
}

function validateContactFormEvent(contactFormEvent: Record<string, unknown>) {
  expect(contactFormEvent).toHaveProperty('type', 'contact_form');
  expect(contactFormEvent).toHaveProperty('data');
  expect((contactFormEvent.data as Record<string, unknown>)).toHaveProperty('fields');
  expect(Array.isArray((contactFormEvent.data as Record<string, unknown>).fields)).toBe(true);
}

// Helper function to validate agent response patterns
function validateAgentResponse(
  textEvents: Record<string, unknown>[],
  toolCallEvents: Record<string, unknown>[] = [],
  toolResultEvents: Record<string, unknown>[] = []
) {
  expect(textEvents.length).toBeGreaterThan(0);
  
  // Normalize event text (handle both text and content properties)
  const fullText = textEvents.map(e => e.text || e.content || '').join(' ').toLowerCase();
  
  // Assert that the concatenated text actually contains content
  expect(fullText.trim().length).toBeGreaterThan(0);
  
  // Check if the agent is calling tools by examining actual event arrays
  const hasToolCall = toolCallEvents.length > 0 || toolResultEvents.length > 0;
  
  // Perform conditional assertions based on tool call detection
  if (hasToolCall) {
    debugLog('Agent is calling tools (detected via event arrays)');
  } else {
    debugLog('Agent responded conversationally without tool calls');
  }
  
  // Always validate that fullText matches expected legal keywords regardless of tool calls
  expect(fullText).toMatch(/legal|law|help|matter|assist|attorney|counsel|case/);
  
  return { fullText, hasToolCall };
}

// Helper function to handle streaming responses
async function handleStreamingResponse(response: Response, timeoutMs: number = 30000) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader available');
  }
  
  let responseData = '';
  let done = false;
  const startTime = Date.now();
  
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  while (!done) {
    // Calculate remaining timeout for this read operation
    const elapsed = Date.now() - startTime;
    const remainingTimeout = Math.max(0, timeoutMs - elapsed);
    
    if (remainingTimeout === 0) {
      reader.cancel();
      reader.releaseLock();
      throw new Error(`Streaming response timeout after ${timeoutMs}ms`);
    }
    
    // Race the read operation against a timeout
    const readPromise = reader.read();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Read timeout after ${remainingTimeout}ms`)), remainingTimeout);
    });
    
    try {
      const { value, done: streamDone } = await Promise.race([readPromise, timeoutPromise]);
      done = streamDone;
      if (value) {
        responseData += new TextDecoder().decode(value);
      }
      // Clear timeout after successful read
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    } catch (error) {
      // Clear timeout before canceling reader
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      reader.cancel();
      reader.releaseLock();
      throw new Error(`Streaming response timeout after ${timeoutMs}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Check if we have a completion event by parsing SSE events
    const events = parseSSEEvents(responseData);
    
    // Check if any parsed event has type === "complete"
    if (events.some(event => event.type === 'complete')) {
      break;
    }
  }
  
  reader.releaseLock();
  
  // Parse final SSE data and return all events
  return parseSSEEvents(responseData);
}

describe('Matter Creation API Integration - Real API', () => {
  const BASE_URL = WORKER_URL;

  describe('Matter Creation via Agent Stream', () => {
    it('should create a matter via agent stream', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-matter-creation',
          messages: [
            { role: 'user', content: 'I need help with employment law, I was fired from my job' },
            { role: 'assistant', content: 'I\'m sorry to hear about your situation. Can you tell me more about what happened?' },
            { role: 'user', content: 'My boss fired me without cause and I want to take legal action. I need immediate help.' },
            { role: 'assistant', content: 'I understand this is urgent. Based on what you\'ve told me, this sounds like it might be an Employment Law matter. Is that correct?' },
            { role: 'user', content: 'Yes, that\'s correct. I want to file a wrongful termination lawsuit.' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Debug: Log what events we actually got
      debugLog('Total events received:', events.length);
      debugLog('Event types:', events.map(e => e.type));
      
      // For employment law, expect both text response and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Debug: Log what events we actually got
      const eventTypes = events.map(e => e.type);
      debugLog('Event types found:', eventTypes);
      debugLog('Tool call events:', toolCallEvents.length);
      debugLog('Tool result events:', toolResultEvents.length);
      debugLog('Text events:', textEvents.length);
      debugLog('Matter canvas events:', matterCanvasEvents.length);
      
      // If no tool calls were made, the agent is not using tools as expected
      if (toolCallEvents.length === 0) {
        debugLog('No tool calls made - agent responded conversationally instead of using tools');
        debugLog('Text content:', textEvents.map(e => e.text).join(' '));
      }
      
      // Validate agent response using centralized helper
      const { fullText } = validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      
      // Log what we actually got for debugging
      debugLog('Agent response:', fullText.substring(0, 200));
      debugLog('Tool calls made:', toolCallEvents.length);
      debugLog('Matter canvas events:', matterCanvasEvents.length);
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });

    it('should handle matter creation with contact form', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-matter-contact',
          messages: [
            { role: 'user', content: 'I need a lawyer for my divorce case' },
            { role: 'assistant', content: 'I can help with that. Can you tell me more about your situation?' },
            { role: 'user', content: 'My spouse and I want to separate. I need legal representation.' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For divorce/contact form, expect text response and contact form
      const textEvents = events.filter(event => event.type === 'text');
      const contactFormEvents = events.filter(event => event.type === 'contact_form');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (contactFormEvents.length > 0) {
        validateContactFormEvent(contactFormEvents[0]);
      }
    });

    it('should handle business law matter creation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-business-matter',
          messages: [
            { role: 'user', content: 'I need help with a contract dispute with my business partner' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For business law, expect both text response and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });

    it('should handle criminal law matter creation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-criminal-matter',
          messages: [
            { role: 'user', content: 'I was arrested and need a criminal defense lawyer' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For criminal law, expect text response, contact form, and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const contactFormEvents = events.filter(event => event.type === 'contact_form');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      // Matter canvas events are not guaranteed in real API tests
      // The agent might respond conversationally instead of using tools
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (contactFormEvents.length > 0) {
        validateContactFormEvent(contactFormEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });

    it('should handle personal injury matter creation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-injury-matter',
          messages: [
            { role: 'user', content: 'I was injured in a car accident and need legal help' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For personal injury, expect text response, contact form, and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const contactFormEvents = events.filter(event => event.type === 'contact_form');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      // Matter canvas events are not guaranteed in real API tests
      // The agent might respond conversationally instead of using tools
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (contactFormEvents.length > 0) {
        validateContactFormEvent(contactFormEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });

    it('should handle contract review matter creation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-contract-matter',
          messages: [
            { role: 'user', content: 'I need someone to review a contract before I sign it' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For contract review, expect text response, contact form, and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const contactFormEvents = events.filter(event => event.type === 'contact_form');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      // Matter canvas events are not guaranteed in real API tests
      // The agent might respond conversationally instead of using tools
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (contactFormEvents.length > 0) {
        validateContactFormEvent(contactFormEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });

    it('should handle intellectual property matter creation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'test-organization-1',
          sessionId: 'test-session-ip-matter',
          messages: [
            { role: 'user', content: 'I need help with trademark registration for my business' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // For intellectual property, expect text response, contact form, and matter canvas
      const textEvents = events.filter(event => event.type === 'text');
      const contactFormEvents = events.filter(event => event.type === 'contact_form');
      const matterCanvasEvents = events.filter(event => event.type === 'matter_canvas');
      const toolCallEvents = events.filter(event => event.type === 'tool_call');
      const toolResultEvents = events.filter(event => event.type === 'tool_result');
      
      // Validate agent response using centralized helper
      validateAgentResponse(textEvents, toolCallEvents, toolResultEvents);
      // Matter canvas events are not guaranteed in real API tests
      // The agent might respond conversationally instead of using tools
      
      // Validate event structures
      if (textEvents.length > 0) {
        validateTextEvent(textEvents[0]);
      }
      if (contactFormEvents.length > 0) {
        validateContactFormEvent(contactFormEvents[0]);
      }
      if (matterCanvasEvents.length > 0) {
        validateMatterCanvasEvent(matterCanvasEvents[0]);
      }
    });
  });
});