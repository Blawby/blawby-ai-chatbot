import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../__tests__/test-utils';
import { CopyButton } from '../CopyButton';

// Mock clipboard API
const mockWriteText = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render with default text', () => {
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Copy');
  });

  it('should render with custom label', () => {
    render(<CopyButton text="test text" label="Copy Link" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Copy Link');
  });

  it('should copy text to clipboard when clicked', async () => {
    mockWriteText.mockResolvedValueOnce(undefined);
    
    render(<CopyButton text="test text to copy" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockWriteText).toHaveBeenCalledWith('test text to copy');
  });

  it('should show success state after successful copy', async () => {
    mockWriteText.mockResolvedValueOnce(undefined);
    
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Copied!');
    });
  });

  it('should revert to original text after success timeout', async () => {
    vi.useFakeTimers();
    mockWriteText.mockResolvedValueOnce(undefined);
    
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Copied!');
    });
    
    // Fast-forward time
    vi.advanceTimersByTime(2000);
    
    await waitFor(() => {
      expect(button).toHaveTextContent('Copy');
    });
    
    vi.useRealTimers();
  });

  it('should handle clipboard API errors gracefully', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Clipboard access denied'));
    
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    // Should not show success state on error
    await waitFor(() => {
      expect(button).toHaveTextContent('Copy');
    });
  });

  it('should apply custom className', () => {
    render(<CopyButton text="test text" className="custom-class" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<CopyButton text="test text" disabled />);
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should not copy when disabled', () => {
    render(<CopyButton text="test text" disabled />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it('should have proper accessibility attributes', () => {
    render(<CopyButton text="test text" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('should handle empty text gracefully', async () => {
    mockWriteText.mockResolvedValueOnce(undefined);
    
    render(<CopyButton text="" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockWriteText).toHaveBeenCalledWith('');
  });

  it('should handle very long text', async () => {
    const longText = 'a'.repeat(10000);
    mockWriteText.mockResolvedValueOnce(undefined);
    
    render(<CopyButton text={longText} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockWriteText).toHaveBeenCalledWith(longText);
  });
});
