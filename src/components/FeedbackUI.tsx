import { FunctionComponent } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { HandThumbUpIcon, HandThumbDownIcon, CheckIcon, StarIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { memo } from 'preact/compat';
import { getFeedbackEndpoint } from '../config/api';

interface FeedbackUIProps {
  sessionId?: string;
  organizationId?: string;
  onFeedbackSubmit?: (feedback: FeedbackData) => void;
}

interface FeedbackData {
  rating?: number;
  thumbsUp?: boolean;
  comments?: string;
  intent?: string;
}

const FeedbackUI: FunctionComponent<FeedbackUIProps> = memo(({ 
  sessionId, 
  organizationId, 
  onFeedbackSubmit 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Define submitFeedback before it's used in other callbacks
  const submitFeedback = useCallback(async (feedbackData: FeedbackData) => {
    if (isSubmitting || hasSubmitted) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(getFeedbackEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          organizationId,
          ...feedbackData,
          intent: 'message_feedback'
        }),
      });

      if (response.ok) {
        setHasSubmitted(true);
        onFeedbackSubmit?.(feedbackData);
        
        // Auto-collapse after successful submission
        setTimeout(() => {
          setIsExpanded(false);
        }, 2000);
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, hasSubmitted, onFeedbackSubmit, organizationId, sessionId]);

  const handleThumbsUp = useCallback(() => {
    const newFeedback = { ...feedback, thumbsUp: true };
    setFeedback(newFeedback);
    submitFeedback(newFeedback);
  }, [feedback, submitFeedback]);

  const handleThumbsDown = useCallback(() => {
    const newFeedback = { ...feedback, thumbsUp: false };
    setFeedback(newFeedback);
    setIsExpanded(true); // Expand to show comment box for negative feedback
  }, [feedback]);

  const handleRating = useCallback((rating: number) => {
    const newFeedback = { ...feedback, rating };
    setFeedback(newFeedback);
    if (rating <= 3) {
      setIsExpanded(true); // Expand for low ratings
    }
  }, [feedback]);

  const handleCommentChange = useCallback((e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    setFeedback(prev => ({ ...prev, comments: target.value }));
  }, []);

  const handleSubmitComment = useCallback(() => {
    submitFeedback(feedback);
  }, [feedback, submitFeedback]);

  if (hasSubmitted) {
    return (
      <div className="feedback-ui submitted">
        <div className="feedback-thanks">
          <CheckIcon className="w-4 h-4" />
          Thank you for your feedback!
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-ui">
      <div className="feedback-actions">
        {/* Thumbs up/down buttons */}
        <div className="feedback-thumbs">
          <button
            className={`feedback-btn ${feedback.thumbsUp === true ? 'active' : ''}`}
            onClick={handleThumbsUp}
            disabled={isSubmitting}
            aria-label="This response was helpful"
            title="This response was helpful"
          >
            <HandThumbUpIcon className="w-4 h-4" />
          </button>
          <button
            className={`feedback-btn ${feedback.thumbsUp === false ? 'active' : ''}`}
            onClick={handleThumbsDown}
            disabled={isSubmitting}
            aria-label="This response was not helpful"
            title="This response was not helpful"
          >
            <HandThumbDownIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Star rating */}
        <div className="feedback-rating">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              className={`feedback-star ${feedback.rating && feedback.rating >= star ? 'active' : ''}`}
              onClick={() => handleRating(star)}
              disabled={isSubmitting}
              aria-label={`Rate ${star} out of 5 stars`}
              title={`Rate ${star} out of 5 stars`}
            >
              <StarIcon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Expand button for comments */}
        {!isExpanded && (
          <button
            className="feedback-expand-btn"
            onClick={() => setIsExpanded(true)}
            disabled={isSubmitting}
            aria-label="Add detailed feedback"
            title="Add detailed feedback"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expanded comment area */}
      {isExpanded && (
        <div className="feedback-expanded">
          <textarea
            className="feedback-comment"
            placeholder="What could be improved? (optional)"
            value={feedback.comments || ''}
            onInput={handleCommentChange}
            rows={3}
            disabled={isSubmitting}
          />
          <div className="feedback-submit-actions">
            <button
              className="feedback-submit-btn"
              onClick={handleSubmitComment}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <button
              className="feedback-cancel-btn"
              onClick={() => setIsExpanded(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default FeedbackUI; 