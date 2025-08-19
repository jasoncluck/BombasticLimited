---
title: 'Getting Started'
description: 'Learn how to get started with our platform'
---

<script>
  import DefaultLayout from '$lib/components/mdsvex/DefaultLayout.svelte';
  let count = 0;
</script>

<DefaultLayout>

# Getting Started

Welcome to our **Getting Started** guide! This page demonstrates that markdown
is working correctly.

## Features

This page shows:

- **Headers** working properly (like this H2)
- **Bold** and _italic_ text
- Code blocks and inline `code`
- Interactive Svelte components

### Interactive Component Test

<button onclick={() => count++}> Clicked {count} times </button>

## Code Example

```javascript
// This should be properly syntax highlighted
function greet(name) {
  console.log(`Hello, ${name}!`);
}
```

> **Note:** This is a blockquote to test styling.

The chart is rendered inside our MDsveX document.

</DefaultLayout>
