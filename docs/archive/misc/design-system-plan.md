# Blawby AI Form & Input Components Plan

## Overview
This document outlines a focused plan for building reusable form and input components in our Preact application, inspired by shadcn/ui patterns but tailored for our specific needs and existing architecture.

## Current State Audit

### Existing Input Patterns
Based on the codebase audit, we currently have:

1. **CSS Classes**: 
   - `.input-base` - Standard input styling with dark mode support
   - `.input-with-icon` - Input with left padding for icons
   - `.error` - Error state styling

2. **Current Input Types**:
   - Text inputs (name, email, password, birthday)
   - Textarea (message composer, additional info)
   - Select dropdowns (settings, jurisdiction selection)
   - Checkboxes (terms agreement, settings toggles)
   - File inputs (message composer, file uploads)

3. **Validation Patterns**:
   - Manual field validation with error state management
   - Form-level error handling with submission states
   - Real-time error clearing on input change
   - Custom validation rules (email, phone, date formats)

4. **Styling Approach**:
   - Tailwind CSS with custom CSS classes
   - Dark mode support via CSS variables
   - Consistent focus states and transitions
   - Icon integration with Heroicons

### Existing Reusable Components (Settings)
We have several well-built components in settings that can be extracted and renamed:

1. **SettingsToggle.tsx** → **Switch.tsx**
   - Full toggle switch with accessibility
   - Boolean value handling, disabled states
   - Dark mode support, focus management
   - Ready to move to `src/components/ui/input/Switch.tsx`

2. **SettingsDropdown.tsx** → **Select.tsx**
   - Complete dropdown/select component
   - Keyboard navigation, accessibility (ARIA)
   - Mobile/desktop responsive layouts
   - Ready to move to `src/components/ui/input/Select.tsx`

3. **SettingsItem.tsx** → **FormItem.tsx** (partial)
   - Multi-purpose form item with input types
   - Built-in: text, password, email, select, textarea
   - Toggle functionality, icon support, loading states
   - Can extract input logic for form components

4. **SettingsDropdownWithToggles.tsx** → **MultiSelect.tsx** (partial)
   - Dropdown with multiple toggle options
   - Keyboard navigation, accessibility
   - Can extract toggle functionality for MultiSelect

## Form & Input Architecture

### Directory Structure
```
src/components/ui/
├── form/
│   ├── Form.tsx                 # Root form provider
│   ├── FormField.tsx           # Field wrapper with validation
│   ├── FormItem.tsx            # Field container
│   ├── FormLabel.tsx           # Accessible label
│   ├── FormControl.tsx         # Input wrapper
│   ├── FormMessage.tsx         # Error/success messages
│   ├── FormDescription.tsx     # Helper text
│   └── index.ts                # Form exports
├── input/
│   ├── Input.tsx               # Base text input
│   ├── Textarea.tsx            # Multi-line text input
│   ├── Select.tsx              # Dropdown selection
│   ├── Checkbox.tsx            # Checkbox input
│   ├── RadioGroup.tsx          # Radio button group
│   ├── Switch.tsx              # Toggle switch
│   ├── FileInput.tsx           # File upload input
│   ├── DatePicker.tsx          # Date selection
│   ├── SearchInput.tsx         # Search with autocomplete
│   ├── PasswordInput.tsx       # Password with visibility toggle
│   ├── NumberInput.tsx         # Numeric input with controls
│   ├── PhoneInput.tsx          # Phone number with formatting
│   ├── EmailInput.tsx          # Email with validation
│   ├── URLInput.tsx            # URL with validation
│   ├── Combobox.tsx            # Searchable dropdown
│   ├── MultiSelect.tsx         # Multiple selection
│   └── index.ts                # Input exports
└── index.ts                    # Form & input exports
```


## ✅ COMPLETED: Core Design System Implementation

**Status**: All core design system components have been successfully implemented and are in production use.

**What's Working**:
- ✅ Complete atomic component library (Input, Textarea, Select, Checkbox, Switch, DatePicker, etc.)
- ✅ Full form system with validation (Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription)
- ✅ Zod validation system with `useFormValidation` hook
- ✅ Complete i18n integration (English/Spanish with translation keys)
- ✅ Accessibility system with ARIA labels and keyboard navigation
- ✅ Default values system (features ON by default, dynamic display text)
- ✅ All settings pages migrated to atomic components
- ✅ All forms migrated (auth, onboarding, pricing)
- ✅ All legacy components removed
- ✅ Dropdown system with dynamic display text updates

## 🚧 REMAINING TASKS

### Phase 5: Advanced Input Components (Pending)
1. **SearchInput.tsx** - Search with autocomplete
2. **Combobox.tsx** - Searchable dropdown
3. **MultiSelect.tsx** - Multiple selection input
4. **ColorInput.tsx** - Color picker input
5. **NumberInput.tsx** - Numeric input with controls
6. **URLInput.tsx** - URL input with validation
7. **Slider.tsx** - Range slider input
8. **TagsInput.tsx** - Tag input with autocomplete
9. **RichTextEditor.tsx** - WYSIWYG text editor
10. **CodeEditor.tsx** - Code input with syntax highlighting

### Phase 6: Advanced Features (Pending)
1. **Auto-resize Textarea** - Dynamic height adjustment
2. **Character Count** - Input length indicators
3. **File Preview** - File upload previews
4. **Password Strength** - Password strength indicator
5. **Phone Formatting** - International phone formatting
6. **Date Range Selection** - Date range picker
7. **PII Protection** - Legal compliance features
8. **Data Sanitization** - Input sanitization
9. **Audit Trail** - Form submission tracking

### Phase 7: Developer Experience (Pending)
1. **Component Documentation** - Storybook integration
2. **TypeScript Improvements** - Enhanced type safety
3. **Testing** - Unit and integration tests
4. **Performance Optimization** - Bundle size optimization
5. **Code Splitting** - Lazy loading for complex components

