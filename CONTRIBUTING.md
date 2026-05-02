# Contributing to MindBusiness

Thanks for your interest in contributing! This document covers the basics.

## Getting started

1. Fork the repo and clone your fork.
2. Follow [README.md](README.md) for backend and frontend setup.
3. Create a feature branch off `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

## Commit message convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `security`, `test`, `chore`

Examples:
- `feat(expander): add depth-aware retry on insufficient children`
- `fix(api): prevent localhost fallback in production builds`
- `security(backend): isolate user input from system prompt`

## Pull request checklist

Before opening a PR, make sure:

- [ ] Frontend builds cleanly: `cd frontend && npm run build`
- [ ] Frontend type-checks: `cd frontend && npx tsc --noEmit`
- [ ] Frontend lints: `cd frontend && npm run lint`
- [ ] Backend imports without errors: `cd backend && python -c "import main"`
- [ ] No secrets in the diff (check `git diff` for `AIza…`, `sk-…`, etc.)
- [ ] You did **not** stage `.env`, `.env.local`, or `node_modules`
- [ ] Commit messages follow the convention above

## What to work on

- See the **Roadmap** section in [README.md](README.md) for planned features.
- Bug reports and small UX polish PRs are always welcome.
- For larger features (new frameworks, new languages), please open an issue first to discuss.

## Code style

- **TypeScript**: strict mode, no `any` smuggling, prefer narrow types over `Record<string, any>`.
- **Python**: follow Pydantic v2 idioms (`model_validate`, `Field`, `field_validator`); type hints on every function.
- **No comments that re-state what the code does.** Add a `# Why:` only when intent is non-obvious.

## License

By contributing, you agree your contributions are licensed under [GNU GPL v3](LICENSE).
