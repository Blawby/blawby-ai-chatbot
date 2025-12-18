import { Page } from '@playwright/test';

export interface JsonResult<T = any> {
  status: number;
  data?: T;
  error?: string;
}

export async function fetchJsonViaPage(page: Page, url: string, init?: any): Promise<JsonResult> {
  return page.evaluate(async ({ url, init }: any) => {
    try {
      const response = await fetch(url, { credentials: 'include', ...init });
      if (!response.ok) {
        const text = await response.text();
        return { status: response.status, error: `HTTP ${response.status}: ${text}` };
      }
      const data = await response.json();
      return { status: response.status, data };
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }, { url, init });
}

export async function postStreamViaPage(page: Page, url: string, body: unknown): Promise<{ status: number; error?: string }> {
  return page.evaluate(async ({ url, body }) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 402) {
        const text = await response.text();
        return { status: response.status, error: text };
      }
      return { status: response.status };
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }, { url, body });
}

export async function uploadFileViaPage(page: Page, url: string, params: { practiceId: string; conversationId: string; fileName: string; fileType?: string; content: string; }): Promise<{ status: number; data?: any; error?: string }> {
  const { practiceId, conversationId, fileName, fileType = 'text/plain', content } = params;
  return page.evaluate(async ({ url, practiceId, conversationId, fileName, fileType, content }) => {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([content], { type: fileType }), fileName);
      formData.append('practiceId', practiceId);
      formData.append('conversationId', conversationId);

      const response = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
      if (!response.ok) {
        const text = await response.text();
        return { status: response.status, error: text };
      }
      const data = await response.json();
      return { status: response.status, data };
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }, { url, practiceId, conversationId, fileName, fileType, content });
}
