import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/*
  Rules that keep the interface honest.

  These used to be the half of an anti-slop checklist a machine can verify, and
  three of them were written against drop shadows, hover scaling and
  glassmorphism. Two of those three are gone, because the interface is an Apple
  interface now and elevation and material are part of that vocabulary. What
  replaced them are not permissions but channels: blur has to come from a named
  material, elevation has to come from the scale, and glass has to stay in the
  navigation layer. `docs/DESIGN.md` carries the reasoning; this file carries
  the half that holds whether or not anyone reads it.
*/
const pureBlackOrWhite = {
  // Pure white and pure black read as unfinished unless they are chosen, and
  // the theme defines surfaces for exactly this reason. The two files that
  // genuinely have to name one are exempted below rather than weakening this.
  selector: 'Literal[value=/^#(fff|ffffff|000|000000)$/i]',
  message: 'Use a surface token from globals.css, not pure white or black.',
}

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
  pureBlackOrWhite,
  {
    /*
      Growing on hover is still the reflex it always was, and Apple does not do
      it: a control under the finger gets smaller, not larger, because the
      press is what is being reported. `active:scale-[0.97]` is the shape that
      means something.
    */
    // 105, 110 and 115 only. `scale-100` is the reset a disabled control
    // needs to opt out of the press, and banning it bans the fix as well as
    // the bug.
    selector: 'Literal[value=/(^|\s|:)scale-1(05|10|15)(\s|$)/]',
    message: 'Reflex hover effect. A pressed control shrinks; it does not grow.',
  },
  {
    /*
      The blur values are the four material thicknesses and nothing else. A
      `backdrop-blur-[13px]` written by eye is somebody inventing a fifth one,
      which is how a material system turns back into a pile of numbers.
    */
    selector: "Literal[value=/(^|\\s|:)backdrop-blur(-|\\[|\\s|$)/]",
    message:
      'Use a material class (material, material-thin, material-thick, material-ultra-thin), not a raw blur.',
  },
  {
    /*
      The elevation scale is xs, sm, md, lg, xl, and each step names a kind of
      surface rather than an amount of blur. `shadow-2xl` and `shadow-inner`
      are Tailwind's, not Apple's, and neither has a surface to belong to.
    */
    selector: 'Literal[value=/(^|\\s|:)shadow-(2xl|inner)(\\s|$)/]',
    message: 'The elevation scale is xs/sm/md/lg/xl. Pick the one that names the surface.',
  },
]

/*
  Glass belongs to the navigation layer.

  A card, a row or a tile with a material on it is the anti-pattern Apple names
  outright: the eye loses the contrast between sharp content and blurred
  chrome, and a translucent surface over a flat one is an expensive way to draw
  `rgba()`. The files listed against this rule are the ones that draw chrome;
  everything else gets an opaque token.

  This is the cheap half of the guard. `e2e/glass.spec.ts` is the real one: it
  reads computed styles across every fixture and catches the cases a class name
  never mentions.
*/
const chromeOnlyGlass = {
  selector: "Literal[value=/(^|\\s|:)material(-(thin|thick|ultra-thin))?(\\s|$)/]",
  message:
    'Glass is for the navigation layer: a bar, a sheet, a floating dock or readout. Content surfaces are opaque.',
}

const chromeFiles = [
  'src/components/mobile-tabs.tsx',
  'src/components/shell-frame.tsx',
  'src/components/shell-fallback.tsx',
  'src/components/pull-to-refresh.tsx',
  'src/components/chart/drag-axis.tsx',
  'src/components/chart/readout.tsx',
]

/* The two files that have to name a colour rather than a token: a web app
   manifest is read by the installer before any stylesheet exists, and the
   browser chrome colour is a meta tag. */
const rawColourFiles = ['src/app/manifest.ts', 'src/app/layout.tsx']

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      /*
        A const referenced by a callback that runs before the const is declared
        throws at request time and compiles cleanly, because TypeScript cannot
        know when a closure is called. That shape took the dashboard down in
        production once; this is the only check that sees it.

        Functions and types are exempt: hoisted declarations and the lookup
        tables kept below the code that reads them are both deliberate here.
      */
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          variables: true,
          functions: false,
          classes: false,
          typedefs: false,
          enums: false,
          ignoreTypeReferences: true,
        },
      ],
      'no-restricted-syntax': ['error', ...generatedLookRules, chromeOnlyGlass],
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
  {
    /*
      The files that draw chrome, and the only ones allowed to reach for glass.

      Test files are on the list for a different reason: a test that asserts
      something about materials has to be able to say the word, and the rule
      matches a string literal rather than a class attribute, which is the
      price of checking this in lint at all. The sweep in `e2e/glass.spec.ts`
      reads computed style and does not have that blind spot.
    */
    files: [...chromeFiles, 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...generatedLookRules],
    },
  },
  {
    // A manifest is read before any stylesheet exists and a theme colour is a
    // meta tag, so both have to name a colour outright. Every other rule in the
    // list still applies to them.
    files: rawColourFiles,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...generatedLookRules.filter((rule) => rule !== pureBlackOrWhite),
        chromeOnlyGlass,
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'tmp/**',
    'drizzle/**',
    // axe-core, copied in on demand to audit a real build. It is third-party
    // and gitignored; linting it turns an accessibility check into 26 errors.
    'public/_axe.js',
  ]),
])

export default eslintConfig
