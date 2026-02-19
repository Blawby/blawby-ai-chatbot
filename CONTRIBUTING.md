# Contributing to Preact ChatGPT Clone

Thank you for considering contributing to the Preact ChatGPT Clone! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) to understand what is expected of all community members.

## How Can I Contribute?

### Reporting Bugs

Bug reports help us improve! When reporting a bug, please include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Any relevant logs, screenshots, or code snippets
- Your environment (browser, OS, etc.)

Please submit bug reports as GitHub issues.

### Suggesting Enhancements

Feature suggestions are welcome! When suggesting a feature:

- Provide a clear description of the feature
- Explain why it would be beneficial
- Outline potential implementation approaches if possible

### Pull Requests

We actively welcome pull requests:

1. Fork the repository
2. Create a branch from `main`
3. Make your changes
4. Ensure your code follows our style guidelines
5. Ensure the tests pass
6. Submit a pull request

#### Pull Request Guidelines

- Keep changes focused and related to a single issue
- Add tests for new features and bug fixes
- Update documentation if necessary
- Follow the existing coding style
- Squash related commits before submitting
- Provide a clear title and description

## Development Setup

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/preact-chat-gpt-interface.git
cd preact-chat-gpt-interface

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Code Style

This project uses:
- TypeScript for type checking
- ESLint for code linting
- Prettier for code formatting

### Design System Rules

Use shared visual tokens and component classes first. Do not introduce ad-hoc color utilities when an existing token exists.

- Surfaces:
  - `glass-card` for prominent containers
  - `glass-panel` for sections
  - `glass-input` for input-like surfaces
- Buttons:
  - Use `<Button>` variants (`primary`, `secondary`, `ghost`, `danger`, `warning`, `danger-ghost`, `accent-ghost`, `menu-item`, `tab`, `icon`, `link`)
  - Do not hardcode brand colors like `bg-blue-*`; use accent tokens/variants
- Navigation:
  - Use shared nav state classes: `nav-item-active`, `nav-item-inactive`
  - `WorkspaceNav` is primary app chrome; `SidebarNavigation` is secondary configurable nav
- Form actions:
  - Use `FormActions` for cancel/submit rows instead of custom button pairs
- Style reference:
  - In development, use `/debug/styles` to inspect available style primitives before creating new ones

Before submitting a PR, please run:

```bash
npm run lint
npm run format
```

## Project Structure

- `src/components/` - Reusable UI components
- `src/utils/` - Utility functions and helpers
- `src/index.tsx` - Main application entry point
- `src/style.css` - Global styling
- `integrations/` - Integration examples for various frameworks

## Testing

```bash
# Run tests
npm test
```

## Building

```bash
# Build for production
npm run build
```

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

## Questions?

Feel free to open an issue or reach out to the maintainers if you have any questions about contributing.

Thank you for helping make this project better! 
