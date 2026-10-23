# Contributing to @wtree/payload-ecommerce-cod

Thank you for your interest in contributing! We welcome contributions from the community.

## Development Setup

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/payload-ecommerce-cod.git
   cd payload-ecommerce-cod
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Building

```bash
# Build the package
npm run build

# Watch mode for development
npm run dev
```

## Code Style

- We use ESLint and Prettier for code quality and formatting
- Run `npm run lint:fix` and `npm run format` before committing
- Follow existing code patterns and conventions
- Write meaningful commit messages

## Testing Guidelines

- Write unit tests for all new features
- Ensure all tests pass before submitting PR
- Maintain or improve code coverage (minimum 80%)
- Test both success and error scenarios

## Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation if needed
3. Add tests for new functionality
4. Ensure all tests pass
5. Update CHANGELOG.md with your changes
6. Submit a pull request with a clear description

## Commit Message Format

We follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `chore:` Maintenance tasks
- `refactor:` Code refactoring

Example:

```
feat: add support for dynamic service charges

Added configuration option to calculate service charges
based on order total.
```

## Questions?

Feel free to open an issue for questions or discussions.
