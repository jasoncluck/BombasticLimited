/** @type {import('prettier').Config} */
const config = {
  plugins: [
    'prettier-plugin-svelte',
    'prettier-plugin-tailwindcss',
    'prettier-plugin-embed',
  ],
  printWidth: 80,
  proseWrap: 'always',
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
      },
    },
    { files: '*.svx', options: { parser: 'markdown' } },
    {
      files: '*.sql',
      excludeFiles: ['supabase/seed.sql'],
      options: {
        plugins: ['prettier-plugin-sql'],
        parser: 'sql',
        language: 'postgresql',
        keywordCase: 'upper',
      },
    },
  ],
};

export default config;
