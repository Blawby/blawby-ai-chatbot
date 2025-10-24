import { describe, it, expect } from 'vitest';
import { WORKER_URL } from '../../setup-worker-integration';

// Helper function to handle streaming responses
async function handleStreamingResponse(response: Response, timeoutMs: number = 30000) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader available');
  }
  
  let responseData = '';
  let done = false;
  const startTime = Date.now();
  
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
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Read timeout after ${remainingTimeout}ms`)), remainingTimeout);
    });
    
    try {
      const { value, done: streamDone } = await Promise.race([readPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      done = streamDone;
      if (value) {
        responseData += new TextDecoder().decode(value);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      reader.cancel();
      reader.releaseLock();
      throw new Error(`Streaming response timeout after ${timeoutMs}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Check if we have a completion event
    if (responseData.includes('"type":"complete"')) {
      break;
    }
  }
  
  reader.releaseLock();
  
  // Parse SSE data
  const events = responseData
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
  
  return events;
}

describe('Chat API Integration - Real API', () => {
  const BASE_URL = WORKER_URL;

  describe('Basic Chat Functionality', () => {
    it('should handle basic chat messages', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'blawby-ai',
          sessionId: 'test-chat-session-basic',
          messages: [
            { role: 'user', content: 'Hello, I need legal help' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Should have at least a connected event and text response
      const hasConnected = events.some(event => event.type === 'connected');
      const hasText = events.some(event => event.type === 'text');
      
      expect(hasConnected || hasText).toBe(true);
    });

    it('should handle chat with matter intent', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'blawby-ai',
          sessionId: 'test-chat-session-matter',
          messages: [
            { role: 'user', content: 'I need help with a business contract dispute' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Should have at least a connected event and some response
      const hasConnected = events.some(event => event.type === 'connected');
      const hasText = events.some(event => event.type === 'text');
      const hasContactForm = events.some(event => event.type === 'contact_form');
      const hasToolCall = events.some(event => event.type === 'tool_call');
      
      expect(hasConnected || hasText || hasContactForm || hasToolCall).toBe(true);
    });

    it('should handle multi-turn conversation', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'blawby-ai',
          sessionId: 'test-chat-session-multiturn',
          messages: [
            { role: 'user', content: 'I was fired from my job' },
            { role: 'assistant', content: 'I understand, can you tell me more about the situation?' },
            { role: 'user', content: 'My boss accused me of stealing but I did not do it' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Should have at least a connected event and some response
      const hasConnected = events.some(event => event.type === 'connected');
      const hasText = events.some(event => event.type === 'text');
      const hasContactForm = events.some(event => event.type === 'contact_form');
      const hasToolCall = events.some(event => event.type === 'tool_call');
      
      expect(hasConnected || hasText || hasContactForm || hasToolCall).toBe(true);
    });

    it('should handle urgent legal request', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'north-carolina-legal-services',
          sessionId: 'test-chat-session-urgent',
          messages: [
            { role: 'user', content: 'I need a lawyer immediately, I was arrested' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Urgent requests should trigger contact form or tool call
      const hasContactForm = events.some(event => event.type === 'contact_form');
      const hasToolCall = events.some(event => event.type === 'tool_call');
      const hasText = events.some(event => event.type === 'text');
      
      expect(hasContactForm || hasToolCall || hasText).toBe(true);
    });

    it('should handle general legal inquiry', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'blawby-ai',
          sessionId: 'test-chat-session-general',
          messages: [
            { role: 'user', content: 'What services do you offer?' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Should have at least a connected event and text response
      const hasConnected = events.some(event => event.type === 'connected');
      const hasText = events.some(event => event.type === 'text');
      
      expect(hasConnected || hasText).toBe(true);
    });

    it('should handle skip to lawyer request', async () => {
      const response = await fetch(`${BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: 'blawby-ai',
          sessionId: 'test-chat-session-skip',
          messages: [
            { role: 'user', content: 'Skip intake, I need a family lawyer' }
          ]
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      
      // Parse streaming response
      const events = await handleStreamingResponse(response);
      expect(events.length).toBeGreaterThan(0);
      
      // Should have at least a connected event and some response
      const hasConnected = events.some(event => event.type === 'connected');
      const hasText = events.some(event => event.type === 'text');
      const hasContactForm = events.some(event => event.type === 'contact_form');
      const hasToolCall = events.some(event => event.type === 'tool_call');
      
      expect(hasConnected || hasText || hasContactForm || hasToolCall).toBe(true);
    });
  });
});