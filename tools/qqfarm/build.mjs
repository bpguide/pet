// Compiles the patched farm classes into the farm movie.
//
//   node tools/qqfarm/build.mjs <ffdec.jar>
//
// src/ and props-src/ hold the patched classes for Farm.swf and props.swf;
// each one is replaced in place in resources/pet/qqfarm, so rebuilding is
// idempotent. Needs Java and JPEXS FFDec (tested with 26.3.0).
//
// FFDec's compiler drops the `@` of an E4X filter like `items.(@seed == x)`
// when the function has a local of the same name: never name a local after an
// XML attribute.
import { execFileSync } from 'node:child_process'
import { readdirSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

const jar = process.argv[2]
if (!jar) throw new Error('usage: node tools/qqfarm/build.mjs <ffdec.jar>')

for (const [source, movie] of [['src', 'Farm.swf'], ['props-src', 'props.swf']]) {
  const src = fileURLToPath(new URL(source, import.meta.url))
  const swf = fileURLToPath(new URL(`../../resources/pet/qqfarm/${movie}`, import.meta.url))
  const tmp = `${swf}.tmp`

  const pairs = readdirSync(src, { recursive: true })
    .filter((f) => f.endsWith('.as'))
    .flatMap((f) => [f.slice(0, -3).split(sep).join('.'), join(src, f)])

  execFileSync('java', ['-jar', jar, '-replace', swf, tmp, ...pairs], { stdio: 'inherit' })
  renameSync(tmp, swf)
  console.log(`${pairs.length / 2} classes -> ${relative(process.cwd(), swf)}`)
}
