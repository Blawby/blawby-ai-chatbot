import { FunctionComponent } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/input/Input';
import { FormItem } from '@/shared/ui/form/FormItem';
import { useTheme } from '@/shared/hooks/useTheme';
import {
  MagnifyingGlassIcon,
  UserIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

interface LawyerApiRecord extends Record<string, unknown> {
  id?: number | string;
  name: string;
  firm?: string | null;
  url?: string;
  snippet?: string;
  city?: string;
  state?: string;
  image_url?: string;
  description?: string;
  website_title?: string;
  website_domain?: string;
  practice_area?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface LawyerSearchResponse {
  success: boolean;
  data: {
    lawyers: LawyerApiRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
    source: string;
    query: Record<string, unknown>;
  };
}

const LawyerSearchPage: FunctionComponent = () => {
  const { isDark } = useTheme();
  const location = useLocation();
  const [searchParams, setSearchParams] = useState({
    state: '',
    city: '',
    practiceArea: '',
    page: 1,
    limit: 20
  });
  const [results, setResults] = useState<LawyerSearchResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const performSearch = useCallback(async (params: typeof searchParams, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const queryParams = new URLSearchParams();
      if (params.state) queryParams.set('state', params.state);
      if (params.city) queryParams.set('city', params.city);
      if (params.practiceArea) queryParams.set('practice_area', params.practiceArea);
      if (params.page > 1) queryParams.set('page', String(params.page));
      if (params.limit !== 20) queryParams.set('limit', String(params.limit));

      const response = await fetch(`/api/lawyers?${queryParams.toString()}`, {
        signal
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch lawyers' }));
        const errorMessage = (errorData && typeof errorData === 'object' && 'error' in errorData && typeof errorData.error === 'string') 
          ? errorData.error 
          : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const data: LawyerSearchResponse = await response.json();
      
      if (data.success && data.data) {
        setResults(data.data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      // Don't set error or update state if the request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to search lawyers');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Read initial params from URL
  useEffect(() => {
    const state = location.query.state || '';
    const city = location.query.city || '';
    const practiceArea = location.query.practice_area || location.query.practiceArea || '';
    // Validate page parameter to prevent NaN
    const pageRaw = parseInt(location.query.page || '1', 10);
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;

    if (state || city || practiceArea) {
      const abortController = new AbortController();
      setSearchParams({ state, city, practiceArea, page, limit: 20 });
      performSearch({ state, city, practiceArea, page, limit: 20 }, abortController.signal);
      
      // Cleanup: abort request if URL changes or component unmounts
      return () => abortController.abort();
    }
  }, [location.query, performSearch]);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    performSearch({ ...searchParams, page: 1 });
    
    // Update URL without navigation
    const params = new URLSearchParams();
    if (searchParams.state) params.set('state', searchParams.state);
    if (searchParams.city) params.set('city', searchParams.city);
    if (searchParams.practiceArea) params.set('practice_area', searchParams.practiceArea);
    const newUrl = `/lawyers?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
  };


  return (
    <div className={`min-h-screen ${isDark ? 'bg-dark-bg' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <a
            href="/"
            className={`inline-flex items-center text-sm mb-4 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </a>
          <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Find a Lawyer
          </h1>
          <p className={`mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Search our database of lawyers by location and practice area
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className={`mb-8 p-6 rounded-lg ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white border border-gray-200 shadow-sm'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <FormItem>
              <Input
                type="text"
                value={searchParams.state}
                onChange={(value) => setSearchParams(prev => ({ ...prev, state: value, page: 1 }))}
                label="State"
                placeholder="e.g., CA, NY, TX"
              />
            </FormItem>
            <FormItem>
              <Input
                type="text"
                value={searchParams.city}
                onChange={(value) => setSearchParams(prev => ({ ...prev, city: value, page: 1 }))}
                label="City"
                placeholder="e.g., Los Angeles, New York"
              />
            </FormItem>
            <FormItem>
              <Input
                type="text"
                value={searchParams.practiceArea}
                onChange={(value) => setSearchParams(prev => ({ ...prev, practiceArea: value, page: 1 }))}
                label="Practice Area"
                placeholder="e.g., family law, criminal defense"
              />
            </FormItem>
          </div>
          <Button
            type="submit"
            variant="primary"
            icon={<MagnifyingGlassIcon className="w-5 h-5" />}
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search Lawyers'}
          </Button>
        </form>

        {/* Error Message */}
        {error && (
          <div className={`mb-6 p-4 rounded-lg ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}>
            <p className={isDark ? 'text-red-400' : 'text-red-800'}>{error}</p>
          </div>
        )}

        {/* Results - JSON Display */}
        {hasSearched && !loading && results && (
          <div className={`mb-8 p-6 rounded-lg ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white border border-gray-200'}`}>
            <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Results
            </h2>
            <pre className={`text-xs overflow-auto p-4 rounded border ${
              isDark 
                ? 'bg-dark-bg border-dark-border text-gray-300' 
                : 'bg-gray-50 border-gray-200 text-gray-800'
            }`}>
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}

        {/* Initial State */}
        {!hasSearched && !loading && (
          <div className={`p-8 rounded-lg text-center ${isDark ? 'bg-dark-card border border-dark-border' : 'bg-white border border-gray-200'}`}>
            <UserIcon className={`w-16 h-16 mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
              Enter search criteria above to find lawyers
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LawyerSearchPage;

