# Preserved shadcn CSS — F12-04 dependency repair

The application used `shadcn@4.8.1` only through `src/app/globals.css` importing
its static `dist/tailwind.css`. Source/tooling import review found no runtime
CLI, MCP, registry, schema or JavaScript package usage.

The unused CLI brought an unpatched Zod 3 dependency into the application
installation. Its static stylesheet and MIT licence were copied **without any
byte changes** before removing the CLI dependency. The CSS import alone now
points here. This is not a redesign or replacement of existing components.

- Upstream: https://github.com/shadcn-ui/ui/tree/main/packages/shadcn
- Installed source version: 4.8.1
- `tailwind.css` SHA-256: `146941ac3ff65496fdf1cb306e697255328e4dadc7c105d66e36bb031b00f6d6`
- `LICENSE.md` SHA-256: `1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f`
- Date: 24 October 2026

Retain the licence and exact CSS hash. Any future component-generator use must
be a separately reviewed development tool, not a reintroduced vulnerable
production dependency. Actual visual/mobile acceptance remains deferred.
