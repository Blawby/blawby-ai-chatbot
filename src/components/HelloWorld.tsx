import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useSession } from '../contexts/AuthContext';
import { backendClient } from '../lib/backendClient';

export default function HelloWorld() {
  const { data: session, refetch } = useSession();
  const [apiResults, setApiResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testApiCall = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await backendClient.getUserDetails();
      setApiResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API call failed');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await backendClient.signout();
      // Clear localStorage
      localStorage.removeItem('bearer_token');
      localStorage.removeItem('blawby.auth.token');
      localStorage.removeItem('blawby.auth.user');
      // Refresh the page to reset state
      window.location.reload();
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const getTokenInfo = () => {
    const bearerToken = localStorage.getItem('bearer_token');
    const legacyToken = localStorage.getItem('blawby.auth.token');
    const user = localStorage.getItem('blawby.auth.user');
    
    return {
      bearerToken: bearerToken || 'None',
      legacyToken: legacyToken || 'None',
      user: user ? JSON.parse(user) : null,
      backendAuthToken: backendClient.getAuthToken() || 'None'
    };
  };

  const tokenInfo = getTokenInfo();

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-gray-900 dark:text-gray-100">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-dark-card-bg rounded-lg shadow-lg border border-gray-200 dark:border-dark-border p-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 flex items-center gap-2">
            Hello World! 🎉
          </h1>
          
          <div className="grid gap-6 md:grid-cols-2">
            {/* Authentication Status */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Authentication Status</h2>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Session User:</span> 
                  <span className="ml-2 text-gray-900 dark:text-white">{session?.user?.name || 'None'}</span>
                </p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Session Email:</span> 
                  <span className="ml-2 text-gray-900 dark:text-white">{session?.user?.email || 'None'}</span>
                </p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Session Token:</span> 
                  <span className="ml-2 text-gray-900 dark:text-white font-mono text-xs break-all">
                    {session?.token || 'None'}
                  </span>
                </p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Is Loading:</span> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${session?.isLoading ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                    {session?.isLoading ? 'Yes' : 'No'}
                  </span>
                </p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Error:</span> 
                  <span className="ml-2 text-red-600 dark:text-red-400">{session?.error || 'None'}</span>
                </p>
              </div>
            </div>

            {/* Token Storage */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Token Storage</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Bearer Token:</p>
                  <div className="bg-white dark:bg-gray-900 p-2 rounded border font-mono text-xs break-all">
                    {tokenInfo.bearerToken}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Legacy Token:</p>
                  <div className="bg-white dark:bg-gray-900 p-2 rounded border font-mono text-xs break-all">
                    {tokenInfo.legacyToken}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Backend Client:</p>
                  <div className="bg-white dark:bg-gray-900 p-2 rounded border font-mono text-xs break-all">
                    {tokenInfo.backendAuthToken}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Stored User:</p>
                  <div className="bg-white dark:bg-gray-900 p-2 rounded border">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {tokenInfo.user ? JSON.stringify(tokenInfo.user, null, 2) : 'None'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* API Test */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">API Test</h2>
            <button 
              onClick={testApiCall} 
              disabled={loading}
              className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200 disabled:cursor-not-allowed"
            >
              {loading ? 'Testing...' : 'Test API Call (getUserDetails)'}
            </button>
            
            {error && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 font-medium">Error:</p>
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}
            
            {apiResults && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <h3 className="text-green-800 dark:text-green-200 font-medium mb-2">API Results:</h3>
                <pre className="text-xs text-green-700 dark:text-green-300 overflow-auto max-h-64 bg-white dark:bg-gray-900 p-2 rounded border">
                  {JSON.stringify(apiResults, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Actions</h2>
            <div className="flex gap-3">
              <button 
                onClick={signOut}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Sign Out
              </button>
              
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Refresh Page
              </button>
            </div>
          </div>

          {/* Debug Info */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-dark-border">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Debug Info</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-gray-700 dark:text-gray-300">Current URL:</span> 
                <span className="ml-2 text-gray-900 dark:text-white font-mono">{window.location.href}</span>
              </p>
              <p><span className="font-medium text-gray-700 dark:text-gray-300">User Agent:</span> 
                <span className="ml-2 text-gray-900 dark:text-white font-mono text-xs break-all">{navigator.userAgent}</span>
              </p>
              <p><span className="font-medium text-gray-700 dark:text-gray-300">Timestamp:</span> 
                <span className="ml-2 text-gray-900 dark:text-white font-mono">{new Date().toISOString()}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
