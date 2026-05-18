import { render, screen } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import FileMenu from '@/features/media/components/FileMenu';

vi.mock('@/shared/ui/Icon', () => ({
  Icon: ({ className }: { className?: string }) => <div className={className} />,
}));

vi.mock('@/shared/ui/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe('FileMenu', () => {
  const defaultProps = {
    onFileSelect: vi.fn(),
    onCameraCapture: vi.fn(),
  };

  it('shows file menu button when isReadyToUpload is true', () => {
    render(<FileMenu {...defaultProps} isReadyToUpload={true} />);
    const fileMenu = screen.getByTitle('Add attachment');
    expect(fileMenu).toBeEnabled();
  });

  it('disables file menu button when isReadyToUpload is false', () => {
    render(<FileMenu {...defaultProps} isReadyToUpload={false} />);
    const fileMenu = screen.getByTitle('File upload not ready yet');
    expect(fileMenu).toBeDisabled();
  });
});