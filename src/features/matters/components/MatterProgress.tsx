import { useState, useEffect, useCallback } from 'preact/hooks';
import { features } from '@/config/features';
import { getParalegalStatusWsEndpoint } from '@/config/api';
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';

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
  const [connectionKey, setConnectionKey] = useState(0);

  const reconnect = useCallback(() => {
    setError(null);
    setLoading(true);
    setConnectionKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!features.enableParalegalAgent || !visible || !practiceId || !matterId) {
      return;
    }

    setLoading(true);
    setError(null);

    const ws = new WebSocket(getParalegalStatusWsEndpoint(practiceId, matterId));
    let settled = false;

    const handleProgressPayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const frame = payload as { type?: string; data?: MatterProgressData };
      if (!frame.data || (frame.type !== 'progress.update' && frame.type !== 'progress.snapshot')) {
        return;
      }
      setProgressData(frame.data);
      setError(null);
      setLoading(false);
    };

    ws.addEventListener('message', (event) => {
      if (settled) return;
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data) as Record<string, unknown>;
        handleProgressPayload(parsed);
      } catch (err) {
        console.warn('Failed to parse matter progress payload:', err);
      }
    });

    ws.addEventListener('error', () => {
      if (settled) return;
      setError('Matter progress connection failed.');
      setLoading(false);
    });

    ws.addEventListener('close', (event) => {
      if (settled) return;
      if (event.code !== 1000 && event.code !== 1001) {
        setError('Matter progress connection closed unexpectedly.');
      }
      setLoading(false);
    });

    return () => {
      settled = true;
      ws.close();
    };
  }, [practiceId, matterId, visible, connectionKey]);

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
      <div className="bg-surface-card border border-line-default rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Matter Formation Progress</h2>
            <p className="text-blue-100 text-sm">Matter ID: {matterId}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:text-blue-200 p-2"
            aria-label="Close"
            icon={
              <XMarkIcon className="w-5 h-5" />
            }
          />
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
              <Button
                variant="link"
                size="sm"
                onClick={reconnect}
                className="mt-2 text-red-600 hover:text-red-800"
              >
                Try again
              </Button>
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

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={reconnect}
            disabled={loading}
            className="text-blue-600 hover:text-blue-800"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
