import { useRef, useEffect, useCallback, useState } from 'preact/hooks';

interface UseChatScrollOptions {
  threshold?: number; // Distance from bottom to consider "at bottom"
  smoothScroll?: boolean;
  autoScrollOnNewMessage?: boolean;
}

// Strongly-typed event detail for chat scroll events
type ChatScrollDetail = { 
  scrollTop: number; 
  scrollDelta: number 
};

export const useChatScroll = (options: UseChatScrollOptions = {}) => {
  const {
    threshold = 50,
    smoothScroll = true,
    autoScrollOnNewMessage = true
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastScrollTop = useRef(0);

  // Check if user is scrolled to bottom
  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return Math.abs(scrollHeight - scrollTop - clientHeight) < threshold;
  }, [threshold]);

  // Scroll to bottom with smooth behavior
  const scrollToBottom = useCallback((force = false) => {
    if (!containerRef.current) return;
    
    const element = containerRef.current;
    const isBottom = checkIfAtBottom();
    
    // Only auto-scroll if user hasn't manually scrolled up, or if forced
    if (force || !isUserScrolledUp || isBottom) {
      if (smoothScroll) {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        element.scrollTop = element.scrollHeight;
      }
      setIsUserScrolledUp(false);
      setIsAtBottom(true);
    }
  }, [isUserScrolledUp, smoothScroll, checkIfAtBottom]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const element = containerRef.current;
    const currentScrollTop = element.scrollTop;
    const isBottom = checkIfAtBottom();
    
    // Detect if user is manually scrolling up
    if (currentScrollTop < lastScrollTop.current && !isBottom) {
      setIsUserScrolledUp(true);
    } else if (isBottom) {
      setIsUserScrolledUp(false);
    }
    
    setIsAtBottom(isBottom);
    lastScrollTop.current = currentScrollTop;
  }, [checkIfAtBottom]);

  // Set up scroll listener
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Use a more specific handler that doesn't conflict with other scroll listeners
    const scrollHandler = () => {
      handleScroll();
    };

    element.addEventListener('scroll', scrollHandler, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', scrollHandler);
    };
  }, [handleScroll]);

  // Auto-scroll on new messages
  const scrollOnNewMessage = useCallback(() => {
    if (autoScrollOnNewMessage) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [autoScrollOnNewMessage, scrollToBottom]);

  // Force scroll to bottom (for user actions like sending messages)
  const forceScrollToBottom = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  return {
    containerRef,
    isUserScrolledUp,
    isAtBottom,
    scrollToBottom: forceScrollToBottom,
    scrollOnNewMessage
  };
};

// New hook for navbar scroll behavior with threshold
interface UseNavbarScrollOptions {
  threshold?: number; // Minimum scroll distance to trigger navbar visibility
  debounceMs?: number; // Debounce delay for scroll events
}

export const useNavbarScroll = (options: UseNavbarScrollOptions = {}) => {
  const {
    threshold = 50,
    debounceMs = 0
  } = options;

  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const lastScrollTop = useRef(0);
  const latestDirection = useRef<'up' | 'down' | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScrollEvent = useCallback((event: CustomEvent<ChatScrollDetail>) => {
    const { scrollTop, scrollDelta } = event.detail;
    
    // Clear existing timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Only process if scroll distance is significant
    if (scrollDelta > threshold) {
      const direction = scrollTop < lastScrollTop.current ? 'up' : 'down';
      
      // Always update the latest direction
      latestDirection.current = direction;
      
      // Always reschedule the debounce with the latest direction
      debounceTimeout.current = setTimeout(() => {
        setIsNavbarVisible(latestDirection.current === 'up');
      }, debounceMs);
    }
    
    lastScrollTop.current = scrollTop;
  }, [threshold, debounceMs]);

  // Set up scroll event listener
  useEffect(() => {
    const scrollHandler = (event: Event) => {
      handleScrollEvent(event as CustomEvent<ChatScrollDetail>);
    };

    window.addEventListener('chat-scroll', scrollHandler);
    
    return () => {
      window.removeEventListener('chat-scroll', scrollHandler);
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [handleScrollEvent]);

  return {
    isNavbarVisible,
    lastScrollDirection: latestDirection.current
  };
}; 