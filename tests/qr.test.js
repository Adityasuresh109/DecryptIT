import test from 'node:test';import assert from 'node:assert/strict';import {qrSVG,qrMatrix} from '../frontend/qr.js';
test('offline QR encoder generates deterministic version 5-L square with SVG markup',()=>{
 const url='https://adityasuresh109.github.io/DecryptIT/#join=ABCDEF';
 assert.equal(qrMatrix(url).length,37);assert.equal(qrMatrix(url)[0].length,37);
 assert.match(qrSVG(url),/viewBox="0 0 45 45"/);assert.equal(qrSVG(url),qrSVG(url));
 assert.throws(()=>qrMatrix('a'.repeat(107)),/too long/);
});
