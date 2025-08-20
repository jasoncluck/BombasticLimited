---
title: 'Getting Started'
description: 'Learn how to get started with our platform'
---

<script>
  let count = 0;
</script>

# Getting Started

Welcome to our **Getting Started** guide! This page demonstrates that markdown
is working correctly with automatic layout.

## Features

This page shows:

- **Headers** working properly (like this H2) using existing design system styles
- **Bold** and _italic_ text with proper typography
- Code blocks and inline `code` with design system integration
- Interactive Svelte components
- GitHub flavored markdown support

### Interactive Component Test

<button onclick={() => count++}> Clicked {count} times </button>

## Code Example

```javascript
// This should be properly syntax highlighted with design system colors
function greet(name) {
  console.log(`Hello, ${name}!`);
}
```

### GitHub Flavored Markdown Features

Now we support:

- [x] Task lists (this one is completed)
- [ ] This task is not completed
- Tables with proper styling

| Feature | Status | Notes |
|---------|--------|--------|
| Auto Layout | ✅ | No manual wrapping needed |
| Tailwind Typography | ✅ | Uses `.prose` classes |
| Design System Integration | ✅ | Inherits existing header styles |
| GitHub Flavored Markdown | ✅ | Tables, task lists, etc. |

> **Note:** This blockquote demonstrates the improved styling integration.

~~Strikethrough text~~ is now supported through GitHub flavored markdown.

The layout is automatically applied - no more `<DefaultLayout>` wrapper needed!
