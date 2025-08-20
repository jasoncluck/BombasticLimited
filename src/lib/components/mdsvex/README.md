# MDsveX Layout Component

The `DefaultLayout.svelte` component provides a clean, styled layout for
markdown content processed through MDsveX.

## Usage

### For Styled Markdown Pages

To ensure your markdown content has proper styling (headers, typography, code
blocks, etc.), wrap your markdown content with the `DefaultLayout` component:

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

## Features

- Properly styled headers
- Typography and spacing
- Code syntax highlighting
- Blockquotes and lists

</DefaultLayout>
```

### Without DefaultLayout

If you don't use the `DefaultLayout` component, your markdown will be converted
to HTML but will appear unstyled (plain text without proper header sizing,
spacing, etc.).

## Features

- Responsive typography with prose styling
- Dark mode support
- Proper spacing for all markdown elements
- Code block styling with syntax highlighting
- Blockquote styling
- Clean, minimal design

## Customization

You can customize the layout by:

1. Creating your own layout component
2. Extending the existing component
3. Overriding styles in individual markdown files

## Troubleshooting

**Problem**: Markdown headers (`#`, `##`, etc.) appear as plain text without
styling. **Solution**: Make sure to wrap your markdown content with
`<DefaultLayout>` as shown above.
