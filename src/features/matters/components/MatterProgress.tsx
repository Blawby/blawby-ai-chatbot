import { useState, useEffect, useCallback } from 'preact/hooks';
import { features } from '@/config/features';
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface ChecklistItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  description?: string;
  required: boolean;
}

interface MatterProgressData {
  stage: string;
  checklist: ChecklistItem[];
  nextActions: string[];
  missing?: string[];
  completed: boolean;
  metadata?: Record<string, unknown>;
}

interface MatterProgressProps {
  practiceId: string;
  matterId: string;
  visible?: boolean;
  onClose?: () => void;
}

export function MatterProgress({ practiceId, matterId, visible = false, onClose }: MatterProgressProps) {
  const [progressData, setProgressData] = useState<MatterProgressData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchProgress = useCallback(async (signal?: AbortSignal) => {
    if (!practiceId || !matterId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/paralegal/${practiceId}/${matterId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch progress: ${response.statusText}`);
      }

      const data = await response.json() as MatterProgressData;
      setProgressData(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Don't set error for aborted requests
      }
      console.error('Failed to fetch matter progress:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setLoading(false);
    }
  }, [practiceId, matterId]);

  // Poll for updates every 10 seconds when visible and feature is enabled
  useEffect(() => {
    if (!features.enableParalegalAgent || !visible) return;

    const controller = new AbortController();
    const signal = controller.signal;

    fetchProgress(signal); // Initial fetch

    const interval = setInterval(() => fetchProgress(signal), 10000); // Poll every 10 seconds
    
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [visible, fetchProgress]);

  // Don't render if paralegal agent is disabled
  if (!features.enableParalegalAgent || !visible) {
    return null;
  }

  const getStageDisplayName = (stage: string): string => {
    const stageNames: Record<string, string> = {
      collect_parties: 'Collecting Party Information',
      conflicts_check: 'Conflict Check',
      documents_needed: 'Document Collection',
      fee_scope: 'Fee Structure',
      engagement: 'Engagement Letter',
      filing_prep: 'Filing Preparation',
      completed: 'Matter Formation Complete'
    };
    return stageNames[stage] || stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'pending': return '⏳';
      default: return '⚪';
    }
  };

  const getProgressPercentage = (): number => {
    if (!progressData?.checklist) return 0;
    const completed = progressData.checklist.filter(item => item.status === 'completed').length;
    return Math.round((completed / progressData.checklist.length) * 100);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Matter Formation Progress</h2>
            <p className="text-blue-100 text-sm">Matter ID: {matterId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading && !progressData && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-600">Loading progress...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
                <p className="text-red-700">{error}</p>
              </div>
              <button
                onClick={() => fetchProgress()}
                className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
              >
                Try again
              </button>
            </div>
          )}

          {progressData && (
            <div className="space-y-6">
              {/* Current Stage */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Current Stage</h3>
                <p className="text-blue-800 text-lg">{getStageDisplayName(progressData.stage)}</p>
                
                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-sm text-blue-700 mb-1">
                    <span>Overall Progress</span>
                    <span>{getProgressPercentage()}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${getProgressPercentage()}%` }}
                     />
                  </div>
                </div>
              </div>

              {/* Checklist */}
              {progressData.checklist && progressData.checklist.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Progress Checklist</h3>
                  <div className="space-y-2">
                    {progressData.checklist.map((item) => (
                      <div key={item.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                        <span className="text-xl mt-0.5">{getStatusIcon(item.status)}</span>
                        <div className="flex-1">
                          <p className={`font-medium ${
                            item.status === 'completed' ? 'text-green-700 line-through' :
                            item.status === 'in_progress' ? 'text-blue-700' :
                            'text-gray-700'
                          }`}>
                            {item.title}
                            {item.required && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          {item.description && (
                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Actions */}
              {progressData.nextActions && progressData.nextActions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Next Steps</h3>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <ul className="list-disc list-inside space-y-1">
                      {progressData.nextActions.map((action, index) => (
                        <li key={index} className="text-yellow-800">{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Missing Items */}
              {progressData.missing && progressData.missing.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Still Needed</h3>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <ul className="list-disc list-inside space-y-1">
                      {progressData.missing.map((item, index) => (
                        <li key={index} className="text-orange-800">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Completion Status */}
              {progressData.completed && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-6 h-6 text-green-500 mr-2" />
                    <p className="text-green-800 font-semibold">Matter formation completed successfully!</p>
                  </div>
                </div>
              )}

              {/* Last Updated */}
              {lastUpdated && (
                <div className="text-sm text-gray-500 text-center border-t pt-4">
                  Last updated: {lastUpdated.toLocaleString()}
                  {loading && <span className="ml-2 text-blue-600">Updating...</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={() => fetchProgress()}
            disabled={loading}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
