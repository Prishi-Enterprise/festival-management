// Fresh Mumbai installation only. Preserve historical applied files for Tokyo/local.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const migrations=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort().map(file=>({name:file.slice(0,-4),query:readFileSync(`${directory}/${file}`,'utf8')}));
const bootstrap=migrations[0];
const historical="values ('shivamastha@gmail.com', 'admin', 'infinity');";
if(!bootstrap.query.includes(historical))throw Error('Bootstrap changed; review the production seed before provisioning.');
bootstrap.query=bootstrap.query.replace(historical,"values ('sb@prishi.in', 'admin', 'infinity');");
bootstrap.name='production_admin_foundation_sb';
// The historical email migration only matches the old address, absent in this fresh install.
process.stdout.write(JSON.stringify(migrations));
