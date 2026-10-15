module.exports = [
    {
        ignores: [
            'data/**',
            'node_modules/**',
            'public/**',
            'coverage/**'
        ]
    },
    {
        files: ['server.js', 'server/**/*.js', 'scripts/**/*.{js,cjs,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                fetch: 'readonly',
                Intl: 'readonly',
                Map: 'readonly',
                Set: 'readonly',
                Promise: 'readonly',
                Symbol: 'readonly',
                Date: 'readonly',
                Math: 'readonly',
                JSON: 'readonly',
                RegExp: 'readonly',
                Error: 'readonly',
                TypeError: 'readonly',
                RangeError: 'readonly',
                SyntaxError: 'readonly',
                ReferenceError: 'readonly',
                Object: 'readonly',
                Array: 'readonly',
                String: 'readonly',
                Number: 'readonly',
                Boolean: 'readonly',
                parseInt: 'readonly',
                parseFloat: 'readonly',
                isNaN: 'readonly',
                isFinite: 'readonly',
                encodeURIComponent: 'readonly',
                decodeURIComponent: 'readonly',
                encodeURI: 'readonly',
                decodeURI: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-const-assign': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-redeclare': 'error'
        }
    },
    {
        files: ['scripts/**/*.{js,cjs,mjs}'],
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                getComputedStyle: 'readonly',
                HTMLInputElement: 'readonly',
                Event: 'readonly'
            }
        }
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module'
        }
    }
];
