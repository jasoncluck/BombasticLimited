# MDsveX Layout Component

The `DefaultLayout.svelte` component provides a clean, styled layout for markdown content processed through MDsveX.

## Usage

### Option 1: Manual Import (Recommended)

For full control over layout, import and use the layout component explicitly in your markdown files:

```markdown
---
title: 'Your Page Title'
description: 'Page description'
---

<script>
  import DefaultLayout from '$lib/components/mdsvex/DefaultLayout.svelte';
</script>

<DefaultLayout>

# Your Content

Your markdown content goes here...

</DefaultLayout>
```

### Option 2: Global Layout Configuration

You can also configure a global layout in `svelte.config.js` (not currently enabled to avoid build issues):

```javascript
mdsvex({
  extensions: ['.md', '.svx'],
  layout: {
    _: 'src/lib/components/mdsvex/DefaultLayout.svelte',
  },
})
```

## Features

- Responsive typography with prose styling
- Dark mode support
- Proper spacing for all markdown elements
- Code block styling
- Blockquote styling
- Clean, minimal design

## Customization

You can customize the layout by:
1. Creating your own layout component
2. Extending the existing component
3. Overriding styles in individual markdown files