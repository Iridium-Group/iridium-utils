# Contributing

Thanks for helping. Please read the organization-wide guide first:
https://github.com/Iridium-Group/.github/blob/main/CONTRIBUTING.md

## This repository

Requires Node.js 22.18 or newer and npm.

```sh
npm ci                 # install and build
npm test               # run the test suite
npm run typecheck      # TypeScript, including tests and examples
npm run format         # format with Prettier
npm run format:check   # what CI runs
npm run build          # compile src/ to dist/
```

- Keep the package free of runtime dependencies.
- Keep every module browser-safe: no `node:` imports, `Buffer` or `process` in `src/`. The test
  suite checks this.
- Functions should be pure and side-effect free at import time. Prefer returning `null` (or a
  result object) for invalid user input over throwing, and document which one a function does.
- Add tests for every behavior change. Tests must not use the network.
- Changes to the private-address ranges in `src/address.ts` must be made in
  `@iridium-group/transport` as well, until it imports them from this package.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`).
