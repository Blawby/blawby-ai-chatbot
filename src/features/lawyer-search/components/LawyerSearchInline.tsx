import { FunctionComponent } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { FormItem } from '@/shared/ui/form/FormItem';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/shared/hooks/useTheme';
import { useToastContext } from '@/shared/contexts/ToastContext';
import LawyerSearchResults from './LawyerSearchResults';
import type { LawyerProfile } from '../../../../worker/schemas/lawyer';

interface LawyerApiRecord extends Record<string, unknown> {
  id?: number | string;
  name?: string;
  firm?: string | null;
  url?: string;
  snippet?: string;
  city?: string;
  state?: string;
  image_url?: string;
  description?: string;
  website_title?: string;
  website_domain?: string;
  practice_area?: string | string[];
  practiceAreas?: string[];
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  rating?: number;
  review_count?: number;
  languages?: string[] | string;
  experience?: number | string;
}

interface LawyerSearchResponse {
  success: boolean;
  data?: {
    lawyers?: LawyerApiRecord[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
  error?: string;
}

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
};

const safeOpenUrl = (url: string) => {
  try {
    const urlWithProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      globalThis.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    }
  } catch {
    // Invalid URL, ignore
  }
};

const mapLawyerRecord = (record: LawyerApiRecord, index: number): LawyerProfile => {
  const name = record.name?.trim() || record.website_title?.trim() || 'Attorney';
  const locationParts = [record.city, record.state].filter((part) => typeof part === 'string' && part.trim().length > 0);
  const location = locationParts.length > 0
    ? locationParts.join(', ')
    : record.address?.trim() || 'Location unavailable';
  const practiceAreas = normalizeList(record.practiceAreas ?? record.practice_area);
  const website = record.url?.trim() || record.website_domain?.trim();
  const languages = normalizeList(record.languages);
  const experience = typeof record.experience === 'number'
    ? String(record.experience)
    : record.experience?.toString();
  const fallbackSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: String(record.id ?? `${name}-${index}-${fallbackSuffix}`),
    name,
    firm: record.firm ?? undefined,
    location,
    practiceAreas,
    rating: typeof record.rating === 'number' ? record.rating : undefined,
    reviewCount: typeof record.review_count === 'number' ? record.review_count : undefined,
    phone: record.phone ?? undefined,
    email: record.email ?? undefined,
    website: website || undefined,
    bio: record.description?.trim() || record.snippet?.trim() || undefined,
    experience,
    languages: languages.length > 0 ? languages : undefined
  };
};

const LawyerSearchInline: FunctionComponent = () => {
  const { isDark } = useTheme();
  const { showInfo } = useToastContext();
  const [searchParams, setSearchParams] = useState({
    state: '',
    city: '',
    practiceArea: '',
    page: 1,
    limit: 20
  });
  const [certifiedResults, setCertifiedResults] = useState<LawyerProfile[]>([]);
  const [standardResults, setStandardResults] = useState<LawyerProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certifiedLoaded, setCertifiedLoaded] = useState(false);
  const [showOutOfNetwork, setShowOutOfNetwork] = useState(false);
  const [hasOutOfNetworkSearched, setHasOutOfNetworkSearched] = useState(false);
  const initialLoadRef = useRef(false);
  const certifiedLengthRef = useRef(0);
  const standardLengthRef = useRef(0);

  useEffect(() => {
    certifiedLengthRef.current = certifiedResults.length;
    standardLengthRef.current = standardResults.length;
  }, [certifiedResults.length, standardResults.length]);

  const performSearch = useCallback(async (page: number, append: boolean, includeStandardResults: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (searchParams.state.trim()) queryParams.set('state', searchParams.state.trim());
      if (searchParams.city.trim()) queryParams.set('city', searchParams.city.trim());
      if (searchParams.practiceArea.trim()) queryParams.set('practice_area', searchParams.practiceArea.trim());
      if (page > 1) queryParams.set('page', String(page));
      if (searchParams.limit !== 20) queryParams.set('limit', String(searchParams.limit));

      const response = await fetch(`/api/lawyers?${queryParams.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json() as LawyerSearchResponse;
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to search lawyers');
      }

      const records = data.data.lawyers ?? [];
      const offset = append ? certifiedLengthRef.current + standardLengthRef.current : 0;

      const certifiedRecords = records.filter((record) => {
        const name = record.name?.toLowerCase() || '';
        const firm = record.firm?.toLowerCase() || '';
        const title = record.website_title?.toLowerCase() || '';
        const domain = record.website_domain?.toLowerCase() || '';
        const url = record.url?.toLowerCase() || '';
        return (
          name.includes('blawby') ||
          firm.includes('blawby') ||
          title.includes('blawby') ||
          domain.includes('blawby.com') ||
          url.includes('blawby.com')
        );
      });
      const standardRecords = records.filter((record) => !certifiedRecords.includes(record));

      const mappedCertified = certifiedRecords.map((record, index) => mapLawyerRecord(record, index + offset));
      const mappedStandard = standardRecords.map((record, index) => mapLawyerRecord(record, index + offset + mappedCertified.length));

      setCertifiedResults((prev) => (append ? [...prev, ...mappedCertified] : mappedCertified));
      if (includeStandardResults) {
        setStandardResults((prev) => (append ? [...prev, ...mappedStandard] : mappedStandard));
        setTotal(data.data.pagination?.total ?? records.length);
      } else if (!append) {
        setStandardResults([]);
        setTotal(mappedCertified.length);
      }
      setSearchParams((prev) => ({ ...prev, page }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search lawyers');
      setCertifiedResults([]);
      setStandardResults([]);
      setTotal(0);
    } finally {
      setCertifiedLoaded(true);
      setLoading(false);
    }
  }, [certifiedResults.length, searchParams, standardResults.length]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void performSearch(1, false, false);
  }, [performSearch]);

  const handleSearch = (event: Event) => {
    event.preventDefault();
    setHasOutOfNetworkSearched(true);
    void performSearch(1, false, true);
  };

  const handleLoadMore = () => {
    if (loading) return;
    setHasOutOfNetworkSearched(true);
    void performSearch(searchParams.page + 1, true, true);
  };

  const handleSearchAgain = () => {
    setCertifiedResults([]);
    setStandardResults([]);
    setTotal(0);
    setHasOutOfNetworkSearched(false);
    void performSearch(1, false, showOutOfNetwork);
  };

  const matterType = searchParams.practiceArea.trim() || 'your case';
  const visibleCount = showOutOfNetwork
    ? certifiedResults.length + standardResults.length
    : certifiedResults.length;
  const visibleTotal = showOutOfNetwork ? total : certifiedResults.length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6 rounded-lg border border-gray-200 bg-light-card-bg p-6 text-gray-900 dark:border-dark-border dark:bg-dark-card-bg dark:text-white">
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Find a lawyer to start a chat
          </h2>
          <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            You&apos;re not viewing a practice yet. Start with Blawby Certified practices, or search the wider network below.
          </p>
        </div>

        {error && (
          <div className={`mb-6 rounded-lg border p-4 ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
            <p className={isDark ? 'text-red-400' : 'text-red-800'}>{error}</p>
          </div>
        )}

        {!certifiedLoaded && (
          <div className={`mb-6 rounded-lg border p-4 ${isDark ? 'bg-dark-card border-dark-border text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
            Loading Blawby Certified practices...
          </div>
        )}

        {certifiedLoaded && (
          <>
            <div className={`mb-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Showing {visibleCount} of {visibleTotal} results
            </div>

            <LawyerSearchResults
              matterType={matterType}
              title="Blawby Certified"
              description="Practices verified by Blawby for faster intake and follow-up."
              lawyers={certifiedResults}
              total={certifiedResults.length}
              showCount={false}
              emptyTitle="No Blawby Certified practices yet"
              emptyDescription="Try expanding your search location or practice area."
              showSearchAgain={false}
              onContactLawyer={(lawyer) => {
                if (lawyer.phone) {
                  globalThis.open(`tel:${lawyer.phone}`, '_self');
                } else if (lawyer.email) {
                  globalThis.open(`mailto:${lawyer.email}?subject=Legal Consultation Request`, '_self');
                } else if (lawyer.website) {
                  safeOpenUrl(lawyer.website);
                } else {
                  showInfo('Contact Information', `Contact ${lawyer.name} at ${lawyer.firm || 'their firm'} for a consultation.`);
                }
              }}
              onSearchAgain={handleSearchAgain}
            />

            <div className="my-6 border-t border-gray-200 dark:border-dark-border" />

            {!showOutOfNetwork && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowOutOfNetwork(true)}
                >
                  Find out-of-network lawyers
                </Button>
              </div>
            )}

            {showOutOfNetwork && (
              <div className="mt-6 rounded-lg border border-gray-200 bg-light-card-bg p-6 text-gray-900 dark:border-dark-border dark:bg-dark-card-bg dark:text-white">
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Out-of-network search
                </h3>
                <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Use filters to explore additional practices outside the Blawby Certified network.
                </p>

                <form onSubmit={handleSearch} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormItem>
                    <Input
                      type="text"
                      value={searchParams.state}
                      onChange={(value) => setSearchParams((prev) => ({ ...prev, state: value, page: 1 }))}
                      label="State"
                      placeholder="e.g., CA, NY"
                    />
                  </FormItem>
                  <FormItem>
                    <Input
                      type="text"
                      value={searchParams.city}
                      onChange={(value) => setSearchParams((prev) => ({ ...prev, city: value, page: 1 }))}
                      label="City"
                      placeholder="e.g., Austin"
                    />
                  </FormItem>
                  <FormItem>
                    <Input
                      type="text"
                      value={searchParams.practiceArea}
                      onChange={(value) => setSearchParams((prev) => ({ ...prev, practiceArea: value, page: 1 }))}
                      label="Practice Area"
                      placeholder="e.g., family law"
                    />
                  </FormItem>
                  <div className="md:col-span-3">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={<MagnifyingGlassIcon className="w-5 h-5" />}
                      disabled={loading}
                    >
                      {loading ? 'Searching...' : 'Search Lawyers'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {showOutOfNetwork && hasOutOfNetworkSearched && !loading && (
              <div className="mt-6">
                <LawyerSearchResults
                  matterType={matterType}
                  title="More practices"
                  description="Additional matches from the wider network."
                  lawyers={standardResults}
                  total={total}
                  showCount={false}
                  onContactLawyer={(lawyer) => {
                    if (lawyer.phone) {
                      globalThis.open(`tel:${lawyer.phone}`, '_self');
                    } else if (lawyer.email) {
                      globalThis.open(`mailto:${lawyer.email}?subject=Legal Consultation Request`, '_self');
                  } else if (lawyer.website) {
                    safeOpenUrl(lawyer.website);
                  } else {
                    showInfo('Contact Information', `Contact ${lawyer.name} at ${lawyer.firm || 'their firm'} for a consultation.`);
                  }
                }}
                  onSearchAgain={handleSearchAgain}
                  onLoadMore={visibleCount < total ? handleLoadMore : undefined}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LawyerSearchInline;
