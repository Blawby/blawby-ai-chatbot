import type { FileAttachment } from '../../../../worker/types';

export const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function createFileAttachment(name: string, type: string, size: number): FileAttachment {
  return {
    id: randomId(),
    name,
    size,
    type,
    url: `https://example.com/mock/${name}`
  };
}

export function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function applyDeliveryState(metadata: Record<string, unknown> | undefined, deliveryState: string) {
  return { ...(metadata ?? {}), deliveryState };
}
