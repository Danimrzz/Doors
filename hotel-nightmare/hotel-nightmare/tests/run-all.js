import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => /^test-.*\.js$/.test(f)).sort();
let fail = 0;
for (const f of files) {
  console.log('▶', f);
  const r = spawnSync(process.execPath, [new URL(f, import.meta.url).pathname], { stdio: 'inherit' });
  if (r.status !== 0) { fail++; console.log('✗ FALLÓ', f); }
}
console.log(fail ? `\n${fail} archivo(s) de pruebas fallaron` : '\nTodas las pruebas pasan');
process.exit(fail ? 1 : 0);
