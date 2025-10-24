# Contributing to Blawby AI Legal Intake Chatbot

Thank you for considering contributing to the Blawby AI Legal Intake Chatbot! This document provides guidelines and instructions for contributing to this project.

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
git clone https://github.com/yourusername/blawby-ai-chatbot.git
cd blawby-ai-chatbot

# Install dependencies
npm install

# Set up environment variables
cp dev.vars.example .dev.vars
# Edit .dev.vars with your API keys

# Start the development server
npm run dev:full
```

### Code Style

This project uses:
- TypeScript for type checking
- ESLint for code linting
- Prettier for code formatting
- Blawby Backend API for user authentication and organization management

Before submitting a PR, please run:

```bash
npm run lint
npm run format
npm test
```

## Project Structure

- `src/components/` - Reusable UI components
- `src/contexts/` - React contexts for state management
- `src/hooks/` - Custom React hooks
- `src/lib/` - API clients and utilities
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions and helpers
- `src/index.tsx` - Main application entry point
- `worker/` - Cloudflare Workers backend
- `tests/` - Test files (unit, integration, e2e)

## Testing

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit      # Unit tests
npm run test:worker    # Worker integration tests
npm run test:component # Component tests
npm run test:e2e       # End-to-end tests

# Run tests with coverage
npm run test:coverage
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