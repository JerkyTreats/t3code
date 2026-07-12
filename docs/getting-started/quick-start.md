# Quick start

```bash
# Development (with hot reload)
pnpm dev

# Desktop development
pnpm dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz pnpm dev:desktop

# Production
pnpm build
pnpm start

# Build a shareable macOS .dmg (arm64 by default)
pnpm dist:desktop:dmg

# Or from any project directory after publishing:
npx t3
```
