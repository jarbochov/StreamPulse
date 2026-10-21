import { build } from 'esbuild';

await build({
    entryPoints: ['public/js/promo-encoders.js'],
    bundle: true,
    format: 'esm',
    target: ['es2021'],
    minify: true,
    legalComments: 'inline',
    outfile: 'public/js/promo-encoder-bundle.js'
});
