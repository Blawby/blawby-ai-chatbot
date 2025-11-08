/**
 * TagInput Stories
 * 
 * Storybook stories for TagInput component demonstrating various use cases.
 */

import { TagInput, type TagInputProps } from './TagInput';
import { h } from 'preact';
import { useState } from 'preact/hooks';

const meta = {
  title: 'Components/Input/TagInput',
  component: TagInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'A multi-select input component with freeform entry, tag display, and optional suggestions. Follows ARIA combobox pattern for accessibility.'
      }
    }
  },
  tags: ['autodocs'],
  args: {
    // Provide required props so individual stories can override as needed
    value: [],
    onChange: () => {}
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size variant matching Input component'
    },
    variant: {
      control: 'select',
      options: ['default', 'error', 'success'],
      description: 'Visual variant matching Input component'
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the input'
    },
    allowDuplicates: {
      control: 'boolean',
      description: 'Allow duplicate tags'
    },
    maxTags: {
      control: 'number',
      description: 'Maximum number of tags allowed'
    },
    maxTagLength: {
      control: 'number',
      description: 'Maximum length per tag'
    }
  }
} as const;

export default meta;
type Story = { render: (args: TagInputProps) => unknown; args?: Partial<TagInputProps> };
const StatefulTagInput = (args: TagInputProps) => {
  const [value, setValue] = useState<string[]>(Array.isArray(args.value) ? args.value : []);
  const handleChange = (next: string[]) => {
    setValue(next);
    args.onChange?.(next);
  };
  return h(TagInput, { ...args, value, onChange: handleChange });
};

const renderTagInput = (args: TagInputProps) => h(StatefulTagInput, args);

export const Default: Story = {
  render: renderTagInput,
  args: {
    placeholder: 'Type and press Enter',
    value: []
  }
};

export const WithTags: Story = {
  render: renderTagInput,
  args: {
    value: ['React', 'Preact', 'TypeScript'],
    placeholder: 'Add more tags...'
  }
};

export const WithSuggestions: Story = {
  render: renderTagInput,
  args: {
    value: [],
    suggestions: [
      'JavaScript',
      'TypeScript',
      'React',
      'Preact',
      'Vue',
      'Angular',
      'Svelte',
      'Node.js',
      'Python',
      'Java',
      'C++',
      'Go',
      'Rust'
    ],
    placeholder: 'Start typing to see suggestions...'
  }
};

export const WithLabel: Story = {
  render: renderTagInput,
  args: {
    label: 'Skills',
    description: 'Add your technical skills',
    value: []
  }
};

export const ErrorStory: Story = {
  render: renderTagInput,
  args: {
    label: 'Tags',
    error: 'Please add at least one tag',
    variant: 'error',
    value: []
  }
};

export const Disabled: Story = {
  render: renderTagInput,
  args: {
    value: ['React', 'TypeScript'],
    disabled: true
  }
};

export const MaxTags: Story = {
  render: renderTagInput,
  args: {
    value: ['Tag1', 'Tag2'],
    maxTags: 3,
    placeholder: 'Maximum 3 tags allowed',
    suggestions: ['Tag3', 'Tag4', 'Tag5']
  }
};

export const MaxTagLength: Story = {
  render: renderTagInput,
  args: {
    value: [],
    maxTagLength: 10,
    placeholder: 'Tags must be 10 characters or less'
  }
};

export const AllowDuplicates: Story = {
  render: renderTagInput,
  args: {
    value: ['React'],
    allowDuplicates: true,
    placeholder: 'Duplicates allowed'
  }
};

export const CustomDelimiters: Story = {
  render: renderTagInput,
  args: {
    value: [],
    delimiters: [';', 'Tab'],
    placeholder: 'Use semicolon or Tab to add tags'
  }
};

export const WithValidation: Story = {
  render: renderTagInput,
  args: {
    value: [],
    onValidate: (tag: string) => {
      if (tag.length < 3) {
        return 'Tag must be at least 3 characters';
      }
      if (!/^[a-zA-Z0-9]+$/.test(tag)) {
        return 'Tag can only contain letters and numbers';
      }
      return true;
    },
    placeholder: 'Tags must be alphanumeric and at least 3 characters'
  }
};

export const WithNormalization: Story = {
  render: renderTagInput,
  args: {
    value: [],
    normalizeTag: (tag: string) => tag.toLowerCase().trim().replace(/\s+/g, '-'),
    placeholder: 'Tags will be normalized to lowercase with hyphens'
  }
};

export const Small: Story = {
  render: renderTagInput,
  args: {
    size: 'sm',
    value: ['Small', 'Tags']
  }
};

export const Large: Story = {
  render: renderTagInput,
  args: {
    size: 'lg',
    value: ['Large', 'Tags']
  }
};

export const Success: Story = {
  render: renderTagInput,
  args: {
    variant: 'success',
    value: ['Valid', 'Tags'],
    description: 'All tags are valid'
  }
};

// Async suggestions example
export const AsyncSuggestions: Story = {
  render: renderTagInput,
  args: {
    value: [],
    asyncSuggestions: async (query: string) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      const allSuggestions = [
        'JavaScript', 'TypeScript', 'React', 'Preact', 'Vue',
        'Angular', 'Svelte', 'Node.js', 'Python', 'Java'
      ];
      return allSuggestions.filter(s => s.toLowerCase().includes(query.toLowerCase()));
    },
    placeholder: 'Type to load suggestions asynchronously...'
  }
};

