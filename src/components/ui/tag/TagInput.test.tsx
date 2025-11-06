import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { TagInput } from './TagInput';
import userEvent from '@testing-library/user-event';

describe('TagInput', () => {
  const defaultProps = {
    value: [],
    onChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should render empty input', () => {
      render(<TagInput {...defaultProps} />);
      const input = screen.getByRole('combobox');
      expect(input).toBeInTheDocument();
    });

    it('should display existing tags', () => {
      render(<TagInput {...defaultProps} value={['tag1', 'tag2']} />);
      expect(screen.getByText('tag1')).toBeInTheDocument();
      expect(screen.getByText('tag2')).toBeInTheDocument();
    });

    it('should add tag on Enter', async () => {
      const onChange = vi.fn();
      render(<TagInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'newtag{Enter}');

      expect(onChange).toHaveBeenCalledWith(['newtag']);
    });

    it('should add tag on comma', async () => {
      const onChange = vi.fn();
      render(<TagInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'newtag,');

      expect(onChange).toHaveBeenCalledWith(['newtag']);
    });

    it('should remove tag when remove button clicked', async () => {
      const onChange = vi.fn();
      render(<TagInput {...defaultProps} value={['tag1']} onChange={onChange} />);
      
      const removeButton = screen.getByLabelText('Remove tag1');
      await userEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('should remove last tag on Backspace when input is empty', async () => {
      const onChange = vi.fn();
      render(<TagInput {...defaultProps} value={['tag1']} onChange={onChange} />);
      const input = screen.getByRole('textbox');

      await userEvent.type(input, '{Backspace}');

      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Delimiters', () => {
    it('should support custom delimiters', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          onChange={onChange}
          delimiters={[';', 'Tab']}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'tag1;');

      expect(onChange).toHaveBeenCalledWith(['tag1']);
    });

  });

  describe('Duplicate prevention', () => {
    it('should prevent duplicates by default', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          value={['existing']}
          onChange={onChange}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'existing{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should allow duplicates when allowDuplicates is true', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          value={['existing']}
          onChange={onChange}
          allowDuplicates={true}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'existing{Enter}');

      expect(onChange).toHaveBeenCalledWith(['existing', 'existing']);
    });
  });

  describe('Validation', () => {
    it('should validate tags with onValidate', async () => {
      const onChange = vi.fn();
      const onValidate = vi.fn((tag: string) => tag.length >= 3);
      
      render(
        <TagInput
          {...defaultProps}
          onChange={onChange}
          onValidate={onValidate}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'ab{Enter}');
      expect(onChange).not.toHaveBeenCalled();

      await userEvent.type(input, 'abc{Enter}');
      expect(onChange).toHaveBeenCalledWith(['abc']);
    });

    it('should enforce maxTagLength', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          onChange={onChange}
          maxTagLength={5}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'toolongtag{Enter}');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should enforce maxTags', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          value={['tag1', 'tag2']}
          onChange={onChange}
          maxTags={2}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'tag3{Enter}');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Suggestions', () => {
    it('should show suggestions dropdown', async () => {
      render(
        <TagInput
          {...defaultProps}
          suggestions={['suggestion1', 'suggestion2']}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'sug');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('should filter suggestions based on input', async () => {
      render(
        <TagInput
          {...defaultProps}
          suggestions={['javascript', 'typescript', 'python']}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'script');

      await waitFor(() => {
        expect(screen.getByText('javascript')).toBeInTheDocument();
        expect(screen.getByText('typescript')).toBeInTheDocument();
        expect(screen.queryByText('python')).not.toBeInTheDocument();
      });
    });

    it('should navigate suggestions with arrow keys', async () => {
      render(
        <TagInput
          {...defaultProps}
          suggestions={['suggestion1', 'suggestion2']}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'sug');
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await userEvent.keyboard('{ArrowDown}');
      const option1 = screen.getByRole('option', { name: 'suggestion1' });
      expect(option1).toHaveAttribute('aria-selected', 'true');
    });

    it('should select suggestion on Enter', async () => {
      const onChange = vi.fn();
      render(
        <TagInput
          {...defaultProps}
          onChange={onChange}
          suggestions={['suggestion1']}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'sug');
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await userEvent.keyboard('{ArrowDown}{Enter}');

      expect(onChange).toHaveBeenCalledWith(['suggestion1']);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<TagInput {...defaultProps} label="Tags" />);
      
      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'false');
      expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('should have live region for announcements', () => {
      render(<TagInput {...defaultProps} />);
      
      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have error message with alert role', () => {
      render(<TagInput {...defaultProps} error="Error message" />);
      
      const error = screen.getByRole('alert');
      expect(error).toHaveTextContent('Error message');
    });

    it('should link input to label', () => {
      render(<TagInput {...defaultProps} label="Tags" id="tag-input" />);
      
      const label = screen.getByText('Tags');
      expect(label).toHaveAttribute('for', 'tag-input');
    });
  });

  describe('IME composition', () => {
    it('should not add tag during composition', async () => {
      const onChange = vi.fn();
      render(<TagInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;

      // Simulate composition start
      fireEvent.compositionStart(input);
      
      await userEvent.type(input, 'tag{Enter}');
      
      // Should not add tag during composition
      expect(onChange).not.toHaveBeenCalled();

      // Simulate composition end
      fireEvent.compositionEnd(input);
      
      // Now Enter should work
      await userEvent.type(input, '{Enter}');
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('Normalization', () => {
    it('should normalize tags with normalizeTag function', async () => {
      const onChange = vi.fn();
      const normalizeTag = (tag: string) => tag.toLowerCase().trim();
      
      render(
        <TagInput
          {...defaultProps}
          onChange={onChange}
          normalizeTag={normalizeTag}
        />
      );
      const input = screen.getByRole('textbox');

      await userEvent.type(input, '  TAG  {Enter}');

      expect(onChange).toHaveBeenCalledWith(['tag']);
    });
  });

  describe('Sizes and variants', () => {
    it('should apply size classes', () => {
      const { container } = render(
        <TagInput {...defaultProps} size="sm" />
      );
      const combobox = container.querySelector('[role="combobox"]');
      expect(combobox).toHaveClass('px-2', 'py-1');
    });

    it('should apply error variant', () => {
      const { container } = render(
        <TagInput {...defaultProps} variant="error" />
      );
      const combobox = container.querySelector('[role="combobox"]');
      expect(combobox).toHaveClass('border-red-300');
    });
  });
});

