import { useCallback, useState } from 'preact/hooks';
import type { ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { normalizeSetupFieldsPayload } from '@/shared/utils/setupState';
import { getWorkerApiUrl } from '@/config/urls';

const URL_RE = /https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}/i;

const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const payload = await res.json() as { error?: string; message?: string };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // ignore parse failures
  }
  return fallback;
};

interface UsePreSendEnrichmentOptions {
  mode: ConversationMode;
  practiceId?: string | null;
  completionScore: number;
  onFieldsExtracted?: (fields: Partial<SetupFieldsPayload>) => Promise<void> | void;
}

export function usePreSendEnrichment({
  mode,
  practiceId,
  completionScore,
  onFieldsExtracted,
}: UsePreSendEnrichmentOptions) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const enrichMessage = useCallback(async (message: string): Promise<{ additionalContext?: string }> => {
    if (mode !== 'PRACTICE_ONBOARDING') return {};

    const trimmed = message.trim();
    if (!trimmed) return {};

    const urlMatch = trimmed.match(URL_RE);
    const needsRichData = completionScore < 40;
    const looksLikeBusinessName = trimmed.length > 5 && (trimmed.includes(' ') || trimmed.includes('.'));
    if (!urlMatch && !(needsRichData && looksLikeBusinessName)) return {};

    setIsEnriching(true);
    const query = urlMatch
      ? `site:${urlMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}`
      : trimmed;
    setStatusText(`Looking up ${query}…`);

    let additionalContext: string | undefined;
    try {
      const searchRes = await fetch(`${getWorkerApiUrl()}/api/tools/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json() as { contextBlock?: string };
        if (searchData.contextBlock) {
          additionalContext = searchData.contextBlock;
        }
      }

      if (urlMatch && practiceId) {
        const raw = urlMatch[0];
        const normalizedUrl = raw.startsWith('http') ? raw : `https://${raw}`;
        setStatusText(`Scanning ${normalizedUrl.replace(/^https?:\/\//, '')} for practice details…`);
        const extractRes = await fetch(`${getWorkerApiUrl()}/api/ai/extract-website`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ practiceId, url: normalizedUrl }),
        });
        if (!extractRes.ok) {
          const errorMessage = await readErrorMessage(extractRes, 'I could not scan that website. You can continue by answering a few quick questions.');
          setStatusText(errorMessage);
          return { additionalContext };
        }
        const extractData = await extractRes.json() as { fields?: Record<string, unknown> };
        const normalizedFields = normalizeSetupFieldsPayload(extractData.fields ?? null);
        if (Object.keys(normalizedFields).length > 0) {
          try {
            await onFieldsExtracted?.(normalizedFields);
          } catch (fieldsErr) {
            console.error('[usePreSendEnrichment] onFieldsExtracted threw:', fieldsErr);
          }
        }
      }

      setStatusText(null);
      return { additionalContext };
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setStatusText('I could not enrich that message right now. You can continue by answering a few quick questions.');
      }
      return { additionalContext };
    } finally {
      setIsEnriching(false);
    }
  }, [completionScore, mode, onFieldsExtracted, practiceId]);

  return {
    enrichMessage,
    isEnriching,
    statusText,
  };
}
