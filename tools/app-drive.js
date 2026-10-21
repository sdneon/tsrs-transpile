// node app-drive.js <outZodDir> <outTalgoDir>  -> prints a deterministic report; run once per engine and diff
const path = require('path'), fs = require('fs');
const [zodDir, talgoDir] = process.argv.slice(2).map(p => require('path').resolve(p));
const log = [];
const L = (...a) => log.push(a.join(' '));
// --- zod
const { z } = require(path.resolve(zodDir, 'index.js'));
const User = z.object({ id: z.number().int().positive(), name: z.string().min(2), email: z.string().email().optional(),
  tags: z.array(z.string()).max(3), role: z.enum(['admin', 'user']).default('user'), address: z.object({ zip: z.string().regex(/^\d{5}$/) }).nullable() });
L('zod ok', JSON.stringify(User.safeParse({ id: 1, name: 'Ann', tags: ['a'], address: { zip: '12345' } })));
const bad = User.safeParse({ id: -1, name: 'A', email: 'nope', tags: [1, 2, 3, 4], role: 'x', address: { zip: 'abc' } });
L('zod bad', bad.error.issues.map(i => i.path.join('.') + ':' + i.code + ':' + i.message).join(' | '));
L('zod transform', z.union([z.string(), z.number()]).transform(v => String(v).toUpperCase()).parse('abc'));
L('zod record', JSON.stringify(z.record(z.string(), z.number().refine(n => n % 2 === 0, 'even')).safeParse({ a: 2, b: 3 }).error.issues));
L('zod du', JSON.stringify(z.discriminatedUnion('t', [z.object({ t: z.literal('a'), x: z.number() }), z.object({ t: z.literal('b'), y: z.string() })]).parse({ t: 'b', y: 'q' })));
L('zod lazy/recursive', JSON.stringify((() => { const C = z.lazy(() => z.object({ n: z.number(), kids: z.array(C) })); return C.parse({ n: 1, kids: [{ n: 2, kids: [] }] }); })()));
L('zod date/coerce/pipeline', z.coerce.number().pipe(z.number().min(3)).safeParse('2').success, z.coerce.date().parse('2020-01-02').toISOString());
// --- TheAlgorithms: load every module, summarise exports; call a few
let loaded = 0, failed = [];
const summary = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    const rel = path.relative(talgoDir, p).split(path.sep).join('/');
    try { const m = require(p); loaded++; summary.push(rel + ':' + Object.keys(m).sort().map(k => k + '=' + typeof m[k]).join(',')); }
    catch (err) { failed.push(rel + ': ' + err.message.split('\n')[0]); }
  }
})(talgoDir);
summary.sort();
L('talgo loaded', loaded, 'failed', failed.length, failed.slice(0, 5).join(' || '));
L('talgo export-summary-hash', require('crypto').createHash('sha1').update(summary.join('\n')).digest('hex'));
const T = (rel) => require(path.resolve(talgoDir, rel));
try { L('bubble', JSON.stringify(T('sorts/bubble_sort.js').bubbleSort([5, 3, 9, 1, 4]))); } catch (e) { L('bubble ERR', e.message); }
try { L('factorial', T('maths/factorial.js').factorial(10)); } catch (e) { L('factorial ERR', e.message); }
try { L('gcd', T('maths/gcd.js').GreatestCommonFactor([12, 18, 24])); } catch (e) { L('gcd ERR', e.message); }
try { const { LinkedList } = T('data_structures/list/linked_list.js'); L('linkedlist ok', Object.keys(T('data_structures/list/linked_list.js')).join(',')); } catch (e) { L('ll ERR', e.message); }
console.log(log.join('\n'));
