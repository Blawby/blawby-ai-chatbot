# TagInput Component

A reusable multi-select input component with freeform entry, tag display, and optional suggestions. Follows atomic design principles and matches the existing Input component styling.

## Features

- ✅ Freeform text entry with configurable delimiters
- ✅ Tag display with remove functionality
- ✅ Optional suggestions dropdown (static or async)
- ✅ Full ARIA combobox pattern support
- ✅ IME composition handling for international input
- ✅ Paste splitting by delimiters
- ✅ Validation and normalization hooks
- ✅ Duplicate prevention
- ✅ Max tags and max tag length constraints
- ✅ Matches Input component sizes and variants
- ✅ Keyboard navigation and shortcuts
- ✅ Screen reader announcements

## Usage

### Basic Example

```tsx
import { TagInput } from '@/components/ui/tag';

function MyComponent() {
  const [tags, setTags] = useState<string[]>([]);

  return (
    <TagInput
      value={tags}
      onChange={setTags}
      placeholder="Add tags..."
    />
  );
}
```

### With Suggestions

```tsx
<TagInput
  value={tags}
  onChange={setTags}
  suggestions={['React', 'TypeScript', 'Preact']}
  placeholder="Start typing..."
/>
```

### With Validation

```tsx
<TagInput
  value={tags}
  onChange={setTags}
  onValidate={(tag) => {
    if (tag.length < 3) return 'Tag must be at least 3 characters';
    if (!/^[a-zA-Z0-9]+$/.test(tag)) return 'Only alphanumeric characters allowed';
    return true;
  }}
/>
```

### With Async Suggestions

```tsx
<TagInput
  value={tags}
  onChange={setTags}
  asyncSuggestions={async (query) => {
    const response = await fetch(`/api/suggestions?q=${query}`);
    return response.json();
  }}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string[]` | **required** | Current tags array |
| `onChange` | `(tags: string[]) => void` | **required** | Callback when tags change |
| `suggestions` | `string[]` | `[]` | Static suggestions list |
| `placeholder` | `string` | `'Type and press Enter'` | Input placeholder |
| `label` | `string` | - | Label text |
| `description` | `string` | - | Help text below input |
| `error` | `string` | - | Error message |
| `disabled` | `boolean` | `false` | Disable the input |
| `maxTags` | `number` | - | Maximum number of tags |
| `maxTagLength` | `number` | - | Maximum length per tag |
| `allowDuplicates` | `boolean` | `false` | Allow duplicate tags |
| `normalizeTag` | `(tag: string) => string` | - | Normalize tag before adding |
| `delimiters` | `string[]` | `[',', 'Enter']` | Keys that trigger tag addition |
| `onValidate` | `(tag: string) => boolean \| string` | - | Validate tag before adding |
| `asyncSuggestions` | `(query: string) => Promise<string[]>` | - | Async suggestions loader |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant (matches Input) |
| `variant` | `'default' \| 'error' \| 'success'` | `'default'` | Visual variant (matches Input) |
| `className` | `string` | - | Additional CSS classes |
| `labelKey` | `string` | - | i18n key for label |
| `descriptionKey` | `string` | - | i18n key for description |
| `placeholderKey` | `string` | - | i18n key for placeholder |
| `errorKey` | `string` | - | i18n key for error |
| `namespace` | `string` | `'common'` | i18n namespace |
| `id` | `string` | - | Input ID (auto-generated if not provided) |
| `aria-label` | `string` | - | ARIA label |
| `data-testid` | `string` | - | Test ID |

## Keyboard Shortcuts

- **Enter**: Add current input as tag (or select focused suggestion)
- **Comma** (default): Add current input as tag
- **Backspace**: Remove last tag when input is empty
- **Arrow Up/Down**: Navigate suggestions dropdown
- **Escape**: Close suggestions dropdown
- **Tab**: Move focus away (closes dropdown)

## Accessibility

The component implements the [ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):

- `role="combobox"` on container
- `role="listbox"` on suggestions dropdown
- `role="option"` on suggestion items
- `aria-expanded` indicates dropdown state
- `aria-controls` links input to dropdown
- `aria-activedescendant` for keyboard navigation
- `aria-autocomplete="list"` on input
- Live region announces tag additions/removals
- Error messages use `role="alert"`

### Screen Reader Support

- Labels and descriptions are announced
- Tag removal is announced via button `aria-label`
- Suggestions are announced when navigating
- Error messages use `aria-live="assertive"`
- Tag changes are announced via live region

## Component Hierarchy

```
TagInput (Molecule)
├── Tag (Atom)
│   └── RemoveButton (Atom - reused from upload)
└── Input field (native)
```

## Styling

The component matches the Input component's styling:

- **Sizes**: `sm`, `md`, `lg` with matching padding
- **Variants**: `default`, `error`, `success` with matching borders and focus rings
- **Focus ring**: `focus:ring-2 focus:ring-accent-500` (matches Input)
- **Border radius**: `rounded-lg` (matches Input)
- **Dark mode**: Full support matching Input patterns

## IME Composition

The component properly handles IME (Input Method Editor) composition for languages like Japanese, Chinese, and Korean:

- Prevents tag addition during composition
- Uses `onCompositionStart` and `onCompositionEnd` events
- Only processes keyboard events after composition completes

## Paste Handling

When pasting text containing delimiters:

- Automatically splits by configured delimiters
- Normalizes each tag
- Validates each tag
- Adds all valid tags at once
- Announces total count to screen readers

## Examples

### Skills Input

```tsx
<TagInput
  label="Technical Skills"
  value={skills}
  onChange={setSkills}
  suggestions={['JavaScript', 'TypeScript', 'React', 'Preact']}
  maxTags={10}
  placeholder="Add your skills..."
/>
```

### Email Tags

```tsx
<TagInput
  label="Recipients"
  value={emails}
  onChange={setEmails}
  onValidate={(tag) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(tag) || 'Invalid email address';
  }}
  normalizeTag={(tag) => tag.toLowerCase().trim()}
/>
```

### Custom Delimiters

```tsx
<TagInput
  value={tags}
  onChange={setTags}
  delimiters={[';', 'Tab']}
  placeholder="Use semicolon or Tab to add tags"
/>
```

## Testing

See `TagInput.test.tsx` for comprehensive test coverage including:

- Adding/removing tags
- Delimiter handling
- Paste parsing
- Duplicate prevention
- Validation
- ARIA attributes
- IME composition safety
- Keyboard navigation

## TODOs

- [ ] Consider adding `TagInputGroup` organism for multiple related inputs
- [ ] Add support for tag icons/avatars
- [ ] Consider adding tag color variants beyond the base Tag component
- [ ] Add support for tag grouping/categories
- [ ] Consider adding drag-and-drop reordering
- [ ] Add support for tag editing (double-click to edit)

## Related Components

- `Input` - Base input component (styling reference)
- `Select` - Dropdown select (suggestions pattern reference)
- `Tag` - Tag atom component
- `RemoveButton` - Remove button atom (reused)

