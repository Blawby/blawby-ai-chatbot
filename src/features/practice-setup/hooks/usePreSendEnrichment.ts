import { useCallback, useState } from 'preact/hooks';
import type { ConversationMode, SetupFieldsPayload } from '@/shared/types/conversation';
import { normalizeSetupFieldsPayload } from '@/shared/utils/setupState';
import { apiClient, isHttpError } from '@/shared/lib/apiClient';

const URL_RE = /https?:\/\/[^\s]+|(?:www\.)[^\s]+\.[a-z]{2,}/i;

const messageFromHttpError = (error: unknown, fallback: string): string => {
  if (isHttpError(error)) {
    const data = error.response.data as { message?: string; error?: string } | undefined;
    if (data?.message?.trim()) return data.message;
    if (data?.error?.trim()) return data.error;
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
    const cleanedUrl = urlMatch ? urlMatch[0].replace(/[.,;:!?]+$/, '') : null;
    const needsRichData = completionScore < 40;
    const looksLikeBusinessName = trimmed.length > 5 && (trimmed.includes(' ') || trimmed.includes('.'));
    if (!cleanedUrl && !(needsRichData && looksLikeBusinessName)) return {};

    setIsEnriching(true);
    const query = cleanedUrl
      ? `site:${cleanedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}`
      : trimmed;
    setStatusText(`Looking up ${query}…`);

    let additionalContext: string | undefined;
    try {
      try {
        const { data: searchData } = await apiClient.get<{ contextBlock?: string }>(
          '/api/tools/search',
          { params: { q: query } },
        );
        if (searchData?.contextBlock) {
          additionalContext = searchData.contextBlock;
        }
      } catch (searchError) {
        // Search is best-effort: any HTTP/network error → no context block.
        if (!isHttpError(searchError)) throw searchError;
      }

      if (cleanedUrl && practiceId) {
        const raw = cleanedUrl;
        const normalizedUrl = raw.startsWith('http') ? raw : `https://${raw}`;
        setStatusText(`Scanning ${normalizedUrl.replace(/^https?:\/\//, '')} for practice details…`);
        try {
          const { data: extractData } = await apiClient.post<{ fields?: Record<string, unknown> }>(
            '/api/ai/extract-website',
            { practiceId, url: normalizedUrl },
          );
          const normalizedFields = normalizeSetupFieldsPayload(extractData.fields ?? null);
          if (Object.keys(normalizedFields).length > 0) {
            await onFieldsExtracted?.(normalizedFields);
          }
        } catch (extractError) {
          if (isHttpError(extractError)) {
            setStatusText(messageFromHttpError(
              extractError,
              'I could not scan that website. You can continue by answering a few quick questions.',
            ));
            return { additionalContext };
          }
          throw extractError;
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
