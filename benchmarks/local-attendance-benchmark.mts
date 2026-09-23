import {readFile,writeFile} from 'node:fs/promises';
import {createDatabase,bootstrap,asUser,ADMIN} from '../tests/db-harness.ts';
const dir = import.meta.dirname;
const f=JSON.parse(await readFile(dir+'/.private/fixture.json','utf8'));
const db=await createDatabase();await bootstrap(db);
await db.exec((await readFile(dir+'/.private/seed.sql','utf8')).replaceAll(f.actor,ADMIN));
await db.query("insert into society_memberships(society_id,user_id,email,display_name,role,active) values($1,$2,'prishi.ai.ventures@gmail.com','Benchmark','admin',true)",[f.society,ADMIN]);
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-society-id':f.society})]);
const results={environment:'Local PGlite; not hosted capacity or network latency',flats:224,services:30,guests:100,old:[],optimized:[]} as any;
for(const [name,count] of [['old',3],['optimized',20]] as const){
 for(let i=0;i<count;i++){
  const start=performance.now();
  const {rows}=await asUser<any>(db,ADMIN,name==='old'?'select operations_data($1) v':'select attendance_data($1,$2) v',name==='old'?[f.festival]:[f.festival,{service:f.services[2],resident_page:i%23}]);
  results[name].push({ms:Math.round((performance.now()-start)*100)/100,bytes:Buffer.byteLength(JSON.stringify(rows[0].v)),attendanceRows:rows[0].v.attendance.length});
 }
}
await writeFile(dir+'/results/attendance-local-optimized.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));await db.close();
