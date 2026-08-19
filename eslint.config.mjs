import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/*
  Rules that keep the interface from reading as machine-generated.

  These are the half of the anti-slop checklist a machine can verify. The other
  half needs judgement and lives in the `anti-slop` skill. Putting the literal
  ones here means they hold whether or not anyone remembers to read anything.
*/
const generatedLookRules = [
  {
    // The most reliable signal that copy was written by a language model.
    selector: 'JSXText[value=/\\u2014/]',
    message: 'No em dash in UI copy. Use a comma, a colon, or a full stop.',
  },
  {
    selector: 'JSXText[value=/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u]',
    message: 'Emoji are not UI elements. Use an icon from the project set.',
  },
  {
    // Pure white and pure black read as unfinished; the theme defines tinted
    // surfaces for exactly this reason.
    selector: 'Literal[value=/^#(fff|ffffff|000|000000)$/i]',
    message: 'Use a surface token from globals.css, not pure white or black.',
  },
  {
    // A variant prefix such as `hover:` may sit immediately before the class,
    // so a whitespace-only boundary would miss the most common form of all.
    selector: 'Literal[value=/(^|\\s|:)(scale-1[01][05]|shadow-lg)(\\s|$)/]',
    message: 'Reflex hover effect. Decide what the hover should communicate.',
  },
  {
    // Separation in this app comes from 1px borders, which stay legible in
    // dense tables and survive dark mode without retuning.
    selector: 'Literal[value=/(^|\\s)(shadow-(md|lg|xl|2xl))(\\s|$)/]',
    message: 'Prefer a 1px border over a drop shadow for separation.',
  },
  {
    selector: 'Literal[value=/(^|\\s)backdrop-blur/]',
    message: 'No glassmorphism. Use an opaque surface token.',
  },
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...generatedLookRules],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'lucide is the default icon set of generated interfaces. This project uses Phosphor.',
            },
          ],
        },
      ],
    },
  },
  {
    // Fonts are chosen in the root layout for a stated reason; nothing else
    // should reach for one directly.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/app/layout.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/font/google',
              message: 'Fonts are declared once in src/app/layout.tsx.',
            },
            {
              name: 'lucide-react',
              message:
                'lucide is the default icon set of generated interfaces. This project uses Phosphor.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'tmp/**', 'drizzle/**']),
])

export default eslintConfig
