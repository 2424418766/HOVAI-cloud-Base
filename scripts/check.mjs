import { access, readFile, stat } from 'node:fs/promises';
const required = ['public/index.html','public/admin.html','public/admin.js','public/app.js','public/styles.css','public/data/site.json','cloudfunctions/api/index.js','cloudfunctions/api/package.json'];
for (const f of required) await access(f);
const data = JSON.parse(await readFile('public/data/site.json','utf8'));
if (!Array.isArray(data.categories) || data.categories.length !== 4) throw new Error('Expected four homepage categories');
const s = await stat('public/assets/still-hero.webp');
if (!s.size) throw new Error('Hero asset is empty');
console.log(`HOVAI build check OK — ${data.projects.length} projects, ${data.pastWorks.length} past-work items.`);