# Contributing to OpenGovern

Thank you for your interest in contributing to OpenGovern! We welcome contributions from the community and are grateful for your help in making this platform better.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Documentation](#documentation)

## 🤝 Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors. By participating, you agree to:

- Be respectful and inclusive
- Focus on constructive feedback
- Accept responsibility for mistakes
- Show empathy towards other contributors
- Help create a positive community

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.0 or later ([Download](https://nodejs.org/))
- **Docker** and Docker Compose ([Download](https://www.docker.com/))
- **Git** for version control ([Download](https://git-scm.com/))
- **PostgreSQL** (optional, can use Docker)

### Quick Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/EDG.git
   cd EDG/OpenEDG
   ```
3. **Install dependencies**:
   ```bash
   npm run install:all
   ```
4. **Start development environment**:
   ```bash
   npm run dev
   ```
5. **Open your browser** to `http://localhost:3000`

## 🛠️ Development Setup

### Environment Configuration

Create environment files for each service:

```bash
# .env (root directory)
NODE_ENV=development
COMPOSE_PROJECT_NAME=OpenEDG

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000

# backend/metadata-service/.env
OPENMETADATA_URL=http://localhost:8585/api/v1
DATABASE_URL=postgresql://user:password@localhost:5432/solix_edg
PORT=3001

# And so on for other services...
```

### Starting External Dependencies

```bash
# Start all services with Docker
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Or start individual services
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15
docker run -d -p 6379:6379 redis:7-alpine
```

### Running the Application

```bash
# Start all services
npm run dev

# Start frontend only
cd frontend && npm run dev

# Start specific backend service
cd backend/metadata-service && npm run dev
```

## 📁 Project Structure

```
OpenEDG/
├── frontend/                    # Next.js web application
│   ├── src/
│   │   ├── app/                # App router pages
│   │   ├── components/         # Reusable UI components
│   │   └── lib/                # Utility functions
│   ├── public/                 # Static assets
│   └── package.json
├── backend/                     # Microservices
│   ├── metadata-service/       # Asset management
│   ├── policy-service/         # Governance policies
│   ├── workflow-service/       # Approval workflows
│   ├── alerts-service/         # Notifications
│   ├── integration-service/    # Data connectors
│   ├── ai-service/             # Semantic search
│   └── reverse-metadata-sync-service/
├── infrastructure/             # Deployment configs
│   ├── docker/                 # Docker Compose
│   ├── kubernetes/             # K8s manifests
│   └── ci-cd/                  # GitHub Actions
├── docs/                       # Documentation
├── scripts/                    # Development scripts
└── README.md
```

## 🔄 Development Workflow

### 1. Choose an Issue

- Check the [Issues](https://github.com/mdskmohan/EDG/issues) page
- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue to indicate you're working on it

### 2. Create a Branch

```bash
# Create and switch to a new branch
git checkout -b feature/amazing-feature

# Or for bug fixes
git checkout -b fix/bug-description
```

### 3. Make Changes

- Write clear, focused commits
- Test your changes thoroughly
- Update documentation if needed
- Follow the coding standards below

### 4. Test Your Changes

```bash
# Run all tests
npm run test

# Run linting
npm run lint

# Type checking
npm run type-check
```

### 5. Submit a Pull Request

- Push your branch to GitHub
- Create a pull request with a clear description
- Reference the issue number (e.g., "Fixes #123")
- Wait for review and address feedback

## 💻 Coding Standards

### TypeScript/JavaScript

- **TypeScript**: Strict mode enabled - all code must be typed
- **ESLint**: Airbnb config with TypeScript support
- **Prettier**: Consistent code formatting
- **Imports**: Group imports (React, third-party, local)
- **Naming**: camelCase for variables/functions, PascalCase for components/classes

```typescript
// Good: Clear imports, proper typing
import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

interface User {
  id: string;
  name: string;
  email: string;
}

const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const [user, setUser] = useState<User | null>(null);

  // Good: Early return pattern
  if (!user) return <div>Loading...</div>;

  return <div>{user.name}</div>;
};
```

### React Components

- **Functional components** with hooks (not class components)
- **Custom hooks** for shared logic
- **Props interface** for all component props
- **Default props** using default parameters
- **Error boundaries** for error handling

```typescript
// Good: Functional component with proper typing
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  onClick
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

### API Design

- **RESTful endpoints** with consistent naming
- **OpenAPI 3.0** specification for all APIs
- **Error responses** with consistent format
- **Input validation** using middleware
- **Rate limiting** and authentication

```typescript
// Good: Consistent API response format
router.get('/assets', async (req, res) => {
  try {
    const assets = await getAssets();
    res.json({
      success: true,
      data: assets,
      meta: {
        total: assets.length,
        page: 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assets',
      code: 'ASSETS_FETCH_ERROR'
    });
  }
});
```

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

Examples:
```
feat(catalog): add advanced filtering options

fix(lineage): resolve null pointer in graph rendering

docs(readme): update installation instructions

refactor(auth): simplify JWT token validation
```

## 🧪 Testing

### Testing Strategy

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and service interactions
- **E2E Tests**: Test complete user workflows
- **Coverage**: Minimum 80% code coverage required

### Running Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- src/components/Button.test.tsx

# Run E2E tests
npm run test:e2e
```

### Writing Tests

```typescript
// Component test example
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button onClick={() => {}}>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

## 📝 Submitting Changes

### Pull Request Process

1. **Ensure your branch is up to date**:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run the full test suite**:
   ```bash
   npm run test
   npm run lint
   npm run type-check
   ```

3. **Create a pull request**:
   - Use a clear, descriptive title
   - Reference the issue number (e.g., "Fixes #123")
   - Provide a detailed description of changes
   - Include screenshots for UI changes

4. **Pull Request Template**:
   ```markdown
   ## Description
   Brief description of the changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] E2E tests pass
   - [ ] Manual testing completed

   ## Screenshots (if applicable)
   Add screenshots of UI changes

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Documentation updated
   - [ ] Tests added/updated
   - [ ] Breaking changes documented
   ```

### Code Review Process

- All PRs require review from at least one maintainer
- Address review comments promptly
- Make requested changes or explain why changes aren't needed
- Once approved, a maintainer will merge your PR

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs actual behavior
- **Environment details** (OS, browser, Node version)
- **Screenshots** or error messages
- **Code snippets** if applicable

### Feature Requests

For new features, please include:

- **Clear description** of the proposed feature
- **Use case** and why it's needed
- **Mockups or examples** if applicable
- **Implementation ideas** if you have them

## 📚 Documentation

### Documentation Standards

- **README files** for all major components
- **JSDoc comments** for all public APIs
- **Inline comments** for complex logic
- **API documentation** using OpenAPI 3.0
- **User guides** for end-user features

### Updating Documentation

When making changes that affect users or developers:

1. Update relevant README files
2. Update API documentation
3. Add migration guides for breaking changes
4. Update user guides and tutorials

## 🎉 Recognition

Contributors will be recognized in:
- GitHub repository contributors list
- Release notes and changelogs
- Project documentation
- Community events and announcements

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check the docs folder for guides
- **Community**: Join our community channels

Thank you for contributing to OpenGovern! 🚀