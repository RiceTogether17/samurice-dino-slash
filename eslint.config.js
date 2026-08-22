'use strict';
/**
 * Flat ESLint config.
 *
 * The game ships as classic browser scripts with no build step, so most files
 * share one global scope on purpose — cross-file references are the design,
 * not an error. The rules below therefore focus on things that actually bite
 * in this codebase: unreachable or unused code, accidental globals, and the
 * sloppy-equality bugs that hide in 20k lines of gameplay logic.
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'assets/**', 'shots/**'],
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'writable', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', console: 'readonly', performance: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        fetch: 'readonly', Image: 'readonly', Audio: 'readonly',
        AudioContext: 'readonly', webkitAudioContext: 'readonly',
        speechSynthesis: 'readonly', SpeechSynthesisUtterance: 'readonly',
        CanvasRenderingContext2D: 'readonly', OffscreenCanvas: 'readonly',
        screen: 'readonly', matchMedia: 'readonly', module: 'readonly',
        globalThis: 'readonly', location: 'readonly', caches: 'readonly',
        URLSearchParams: 'readonly',
        self: 'readonly', URL: 'readonly', Blob: 'readonly',
        // Cross-file globals: every script shares one scope by design.
        PHONICS_DATA: 'readonly', ProgressTracker: 'readonly',
        AudioManager: 'readonly', RunnerEngine: 'readonly',
        SlashGame: 'readonly', CombatEngine: 'readonly',
        CombatPatterns: 'readonly', Coach: 'readonly',
        SpriteCache: 'readonly', Quality: 'readonly', ArrayOps: 'readonly', UI: 'readonly',
        haptic: 'readonly', Tutorial: 'readonly',
        ACHIEVEMENTS: 'readonly', SHOP_ITEMS: 'readonly',
        EndlessParticle: 'readonly', EndlessRunnerEngine: 'readonly',
        EndlessBattleEngine: 'readonly',
        prompt: 'readonly', alert: 'readonly', confirm: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-implicit-globals': 'off',
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'warn',
      'prefer-const': 'warn',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly',
        console: 'readonly', __dirname: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', globalThis: 'readonly',
        // Available inside page.evaluate callbacks, which run in the browser.
        window: 'readonly', document: 'readonly', performance: 'readonly',
        getComputedStyle: 'readonly',
        CanvasRenderingContext2D: 'readonly', _slashGameInstance: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-undef': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
    },
  },
];
