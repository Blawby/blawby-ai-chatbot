/**
 * TagInput Stories
 * 
 * Storybook stories for TagInput component demonstrating various use cases.
 */

import type { Meta, StoryObj } from '@storybook/preact';
import { TagInput } from './TagInput';
import { useState } from 'preact/hooks';

const meta: Meta<typeof TagInput> = {
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
};

export default meta;
type Story = StoryObj<typeof TagInput>;

// Interactive wrapper component
const InteractiveTagInput = (args: any) => {
  const [tags, setTags] = useState<string[]>(args.value || []);
  return (
    <TagInput
      {...args}
      value={tags}
      onChange={setTags}
    />
  );
};

export const Default: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    placeholder: 'Type and press Enter',
    value: []
  }
};

export const WithTags: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: ['React', 'Preact', 'TypeScript'],
    placeholder: 'Add more tags...'
  }
};

export const WithSuggestions: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
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
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    label: 'Skills',
    description: 'Add your technical skills',
    value: []
  }
};

export const Error: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    label: 'Tags',
    error: 'Please add at least one tag',
    variant: 'error',
    value: []
  }
};

export const Disabled: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: ['React', 'TypeScript'],
    disabled: true
  }
};

export const MaxTags: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: ['Tag1', 'Tag2'],
    maxTags: 3,
    placeholder: 'Maximum 3 tags allowed',
    suggestions: ['Tag3', 'Tag4', 'Tag5']
  }
};

export const MaxTagLength: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: [],
    maxTagLength: 10,
    placeholder: 'Tags must be 10 characters or less'
  }
};

export const AllowDuplicates: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: ['React'],
    allowDuplicates: true,
    placeholder: 'Duplicates allowed'
  }
};

export const CustomDelimiters: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: [],
    delimiters: [';', 'Tab'],
    placeholder: 'Use semicolon or Tab to add tags'
  }
};

export const WithValidation: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
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
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    value: [],
    normalizeTag: (tag: string) => tag.toLowerCase().trim().replace(/\s+/g, '-'),
    placeholder: 'Tags will be normalized to lowercase with hyphens'
  }
};

export const Small: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    size: 'sm',
    value: ['Small', 'Tags']
  }
};

export const Large: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    size: 'lg',
    value: ['Large', 'Tags']
  }
};

export const Success: Story = {
  render: (args) => <InteractiveTagInput {...args} />,
  args: {
    variant: 'success',
    value: ['Valid', 'Tags'],
    description: 'All tags are valid'
  }
};

// Async suggestions example
export const AsyncSuggestions: Story = {
  render: (args) => {
    const [tags, setTags] = useState<string[]>([]);
    return (
      <TagInput
        {...args}
        value={tags}
        onChange={setTags}
        asyncSuggestions={async (query: string) => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 500));
          const allSuggestions = [
            'JavaScript', 'TypeScript', 'React', 'Preact', 'Vue',
            'Angular', 'Svelte', 'Node.js', 'Python', 'Java'
          ];
          return allSuggestions.filter(s => 
            s.toLowerCase().includes(query.toLowerCase())
          );
        }}
      />
    );
  },
  args: {
    value: [],
    placeholder: 'Type to load suggestions asynchronously...'
  }
};

