/** @type {import('prettier').Config} */
const prettierConfig = {
  plugins: [
    'prettier-plugin-svelte',
    'prettier-plugin-tailwindcss',
    'prettier-plugin-embed',
    'prettier-plugin-sql',
  ],
  printWidth: 80,
  proseWrap: 'always',
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
};

/** @type {import('prettier-plugin-embed').PrettierPluginEmbedOptions} */
const prettierPluginEmbedConfig = {
  embeddedSqlTags: ['sql'],
};

/** @type {import('prettier-plugin-sql').SqlBaseOptions} */
const prettierPluginSqlConfig = {
  language: 'postgresql',
  keywordCase: 'upper',
};

const config = {
  ...prettierConfig,
  ...prettierPluginEmbedConfig,
  ...prettierPluginSqlConfig,
  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
      },
    },
    {
      files: '*.sql',
      options: {
        parser: 'sql',
        language: 'postgresql',
        keywordCase: 'upper',
      },
    },
  ],
};

export default config;
