---
title: 'Markdown Demo'
description: 'Testing automatic layout and GitHub flavored markdown'
---

# Markdown Demo

This page demonstrates the improved MDsveX configuration with automatic layout and GitHub flavored markdown support.

## No Manual Wrapping Required

Simply write markdown without any layout components - the styling is applied automatically!

## GitHub Flavored Markdown Features

### Task Lists
- [x] Automatic layout configuration ✅
- [x] Tailwind Typography integration ✅  
- [x] Design system color variables ✅
- [x] GitHub flavored markdown support ✅
- [ ] Future enhancements

### Tables

| Feature | Before | After |
|---------|--------|-------|
| Layout | Manual `<DefaultLayout>` wrapper | Automatic |
| Styling | Custom CSS | Tailwind Typography + Design System |
| Markdown | Basic | GitHub Flavored |
| Code Blocks | Hardcoded colors | Design system variables |

### Code with Syntax Highlighting

```typescript
// TypeScript example with design system integration
interface User {
  id: string;
  name: string;
  email: string;
}

const createUser = (userData: User): User => {
  return {
    ...userData,
    id: crypto.randomUUID()
  };
};
```

```bash
# Bash commands
npm install remark-gfm
npm run build
```

### Inline Elements

Regular text with **bold**, _italic_, and `inline code`. Links work too: [MDsveX Documentation](https://mdsvex.pngwn.io/).

~~Strikethrough text~~ is supported via GFM.

### Blockquotes

> This is a blockquote that uses the design system colors and spacing.
> 
> Multiple lines are properly styled.

## Headers Inherit Design System

The headers use your existing `.header-primary` and `.header-secondary` classes for consistent styling throughout your application.

### This is an H3
#### This is an H4
##### This is an H5

All styling integrates seamlessly with your existing Tailwind-based design system!