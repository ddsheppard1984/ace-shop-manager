const KEY="ace_shop_prototype_v01";
const initial={
 customers:[
  {id:1,name:"Acme Paper Company",contact:"John Smith",phone:"207-555-0141",email:"john@acmepaper.example"},
  {id:2,name:"Maine Industrial Services",contact:"Sarah Jones",phone:"207-555-0188",email:"sarah@maineindustrial.example"}
 ],
 jobs:[
  {id:"J-1001",customer:"Acme Paper Company",type:"AC 3 Phase",hp:"250",voltage:"460",serial:"MTR-88421",stage:"Inspection",priority:"Normal",notes:"Customer reports high vibration."},
  {id:"J-1002",customer:"Maine Industrial Services",type:"DC Motor",hp:"100",voltage:"240",serial:"DC-22108",stage:"Waiting on Parts",priority:"High",notes:"Bearing replacement required."},
  {id:"J-1003",customer:"Acme Paper Company",type:"Breaker",hp:"",voltage:"4160",serial:"BRK-00912",stage:"Ready for Pickup",priority:"Normal",notes:"Final test passed."}
 ],
 inventory:[
  {part:"6205-2RS",desc:"Bearing",qty:4,min:10,cost:18.50},
  {part:"6312-C3",desc:"Bearing",qty:16,min:8,cost:62.00},
  {part:"NBR-25",desc:"Shaft seal",qty:6,min:5,cost:14.75},
  {part:"VARN-1G",desc:"Varnish",qty:3,min:4,cost:39.00}
 ],
 quotes:[
  {id:"Q-2001",customer:"Acme Paper Company",job:"J-1001",amount:4850,status:"Awaiting Approval"},
  {id:"Q-2002",customer:"Maine Industrial Services",job:"J-1002",amount:2200,status:"Approved"}
 ],
 deliveries:[
  {id:"D-3001",type:"Pickup",customer:"Acme Paper Company",date:"2026-08-08",driver:"Unassigned",status:"Scheduled"},
  {id:"D-3002",type:"Delivery",customer:"Maine Industrial Services",date:"2026-08-08",driver:"Driver 1",status:"Scheduled"}
 ]
};
let db=JSON.parse(localStorage.getItem(KEY)||"null")||initial;
const SUPA_KEY="ace_supabase_config_v1";
let supabaseClient=null;
let supabaseUser=null;
function getSupabaseConfig(){return JSON.parse(localStorage.getItem(SUPA_KEY)||"null")}
function saveSupabaseConfig(c){localStorage.setItem(SUPA_KEY,JSON.stringify(c))}
function initSupabase(){
 const c=getSupabaseConfig();
 if(!c||!window.supabase)return false;
 try{supabaseClient=window.supabase.createClient(c.url,c.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return true}catch(e){console.error(e);return false}
}
function save(){localStorage.setItem(KEY,JSON.stringify(db)); if(supabaseClient) queueSupabaseSync()}
let supaSyncTimer=null;
function queueSupabaseSync(){clearTimeout(supaSyncTimer);supaSyncTimer=setTimeout(()=>syncCoreToSupabase().catch(e=>console.warn("Supabase sync:",e)),700)}
async function syncCoreToSupabase(){
 if(!supabaseClient)return; const {data:{session}}=await supabaseClient.auth.getSession(); if(!session)return;
 // Only sync the core prototype collections for now; the remaining modules are migrated in later passes.
 const cust=(db.customers||[]).filter(x=>x.name).map(x=>({customer_number:String(x.customerNumber||x.id||"").startsWith("C-")?String(x.customerNumber||x.id):null,company_name:x.name,contact_name:x.contact||null,phone:x.phone||null,email:x.email||null,notes:x.notes||null}));
 for(const c of cust){if(c.customer_number){await supabaseClient.from("customers").upsert(c,{onConflict:"customer_number"})}}
 const {data:remoteCustomers}=await supabaseClient.from("customers").select("id,customer_number,company_name");
 const byName=new Map((remoteCustomers||[]).map(x=>[x.company_name,x.id]));
 const jobs=(db.jobs||[]).filter(x=>x.id).map(x=>({job_number:String(x.id),customer_id:byName.get(x.customer)||null,equipment_type:x.type||"Motor",job_type:"Repair",description:x.notes||x.type||"",status:x.stage||"Jobbed In",priority:x.priority||"Normal",notes:x.notes||null}));
 for(const j of jobs){await supabaseClient.from("jobs").upsert(j,{onConflict:"job_number"})}
 const inv=(db.inventory||[]).filter(x=>x.part).map(x=>({part_number:String(x.part),description:x.desc||x.description||x.part,quantity:Number(x.qty||0),minimum_quantity:Number(x.min||0),unit_cost:Number(x.cost||0)}));
 for(const i of inv){await supabaseClient.from("inventory_items").upsert(i,{onConflict:"part_number"})}
}
async function loadCoreFromSupabase(){
 if(!supabaseClient)throw new Error("Connect to Supabase first.");
 const {data:{session}}=await supabaseClient.auth.getSession(); if(!session)throw new Error("Sign in first.");
 const [c,j,i,q,inv]=await Promise.all([
  supabaseClient.from("customers").select("id,customer_number,company_name,contact_name,phone,email,notes").order("company_name"),
  supabaseClient.from("jobs").select("job_number,customer_id,equipment_type,description,status,priority,notes,customers(company_name)").order("job_number"),
  supabaseClient.from("inventory_items").select("part_number,description,quantity,minimum_quantity,unit_cost").order("part_number"),
  supabaseClient.from("quotes").select("quote_number,total,status,job_id,engineering_job_id,customers(company_name)").order("quote_number"),
  supabaseClient.from("invoices").select("invoice_number,total,balance_due,status,invoice_date,due_date,customers(company_name)").order("invoice_number")
 ]);
 for(const r of [c,j,i,q,inv])if(r.error)throw r.error;
 db.customers=(c.data||[]).map(x=>({id:x.id,customerNumber:x.customer_number||"",name:x.company_name,contact:x.contact_name||"",phone:x.phone||"",email:x.email||"",notes:x.notes||""}));
 db.jobs=(j.data||[]).map(x=>({id:x.job_number,customer:x.customers?.company_name||"",type:x.equipment_type||"",hp:"",voltage:"",serial:"",stage:x.status||"Jobbed In",priority:x.priority||"Normal",notes:x.notes||x.description||""}));
 db.inventory=(i.data||[]).map(x=>({part:x.part_number,desc:x.description,qty:Number(x.quantity||0),min:Number(x.minimum_quantity||0),cost:Number(x.unit_cost||0)}));
 db.quotes=(q.data||[]).map(x=>({id:x.quote_number,customer:x.customers?.company_name||"",job:"",amount:Number(x.total||0),status:x.status||"Draft"}));
 db.invoices=(inv.data||[]).map(x=>({id:x.invoice_number,customer:x.customers?.company_name||"",total:Number(x.total||0),balance:Number(x.balance_due||0),status:x.status||"Open",invoiceDate:x.invoice_date,dueDate:x.due_date}));
 localStorage.setItem(KEY,JSON.stringify(db)); render();
}
async function signInSupabase(){
 if(!supabaseClient)throw new Error("Save a Supabase URL and anon key first.");
 const email=document.getElementById("supa_email")?.value.trim(),password=document.getElementById("supa_password")?.value;
 if(!email||!password)throw new Error("Enter the test login email and password.");
 const {data,error}=await supabaseClient.auth.signInWithPassword({email,password}); if(error)throw error; supabaseUser=data.user; await renderDatabasePanel();
}
async function signOutSupabase(){if(supabaseClient)await supabaseClient.auth.signOut();supabaseUser=null;await renderDatabasePanel()}
async function saveSupabaseSettings(){
 const url=document.getElementById("supa_url").value.trim().replace(/\/$/,""),anonKey=document.getElementById("supa_anon").value.trim();
 if(!url||!anonKey){alert("Enter both the local Supabase API URL and anon/publishable key.");return}
 saveSupabaseConfig({url,anonKey}); initSupabase(); await renderDatabasePanel();
}


/* === EQUIPMENT DATABASE TEST MODULE (isolated from core v5.3) === */
async function loadEquipmentFromSupabase(){
  if(!supabaseClient)return;
  const {data:sessionData}=await supabaseClient.auth.getSession();
  if(!sessionData?.session)throw new Error("Sign in to Supabase first.");
  const {data,error}=await supabaseClient.from("equipment").select("*").order("equipment_number");
  if(error)throw error;
  db.equipmentTest=(data||[]).map(x=>({
    id:x.id,
    number:x.equipment_number||"",
    type:x.equipment_type||"",
    customerId:x.customer_id||null,
    jobId:x.job_id||null,
    customer:x.company_name||"",
    job:x.job_number||"",
    manufacturer:x.manufacturer||"",
    model:x.model||"",
    serial:x.serial_number||"",
    hp:x.horsepower??"",
    voltage:x.voltage||"",
    amperage:x.amperage||"",
    phase:x.phase||"",
    frequency:x.frequency||"",
    rpm:x.rpm??"",
    frame:x.frame||"",
    acdc:x.ac_dc||"",
    description:x.description||""
  }));
  save();
}
async function equipmentCustomerId(name){
  const local=(db.customers||[]).find(c=>c.name===name);
  if(local?.id && String(local.id).length>20)return local.id;
  const {data,error}=await supabaseClient.from("customers").select("id").eq("company_name",name).maybeSingle();
  if(error)throw error;
  return data?.id||null;
}
async function equipmentJobId(jobNumber){
  if(!jobNumber)return null;
  const local=(db.jobs||[]).find(j=>String(j.id)===String(jobNumber));
  const {data,error}=await supabaseClient.from("jobs").select("id").eq("job_number",jobNumber).maybeSingle();
  if(error)throw error;
  return data?.id||local?.id||null;
}
async function nextEquipmentDbNumber(){
  const {data,error}=await supabaseClient.from("equipment").select("equipment_number").like("equipment_number","M-%").order("equipment_number",{ascending:false}).limit(200);
  if(error)throw error;
  let max=100000;
  for(const row of (data||[])){
    const m=String(row.equipment_number||"").match(/^M-(\d+)$/);
    if(m)max=Math.max(max,Number(m[1]));
  }
  return `M-${String(max+1).padStart(6,"0")}`;
}
async function saveEquipmentTestToDb(f){
  const customerName=f.get("customer"),jobNumber=f.get("job");
  const customerId=customerName?await equipmentCustomerId(customerName):null;
  const jobId=jobNumber?await equipmentJobId(jobNumber):null;
  const number=(f.get("number")||"").trim()||await nextEquipmentDbNumber();
  const payload={
    equipment_number:number,customer_id:customerId,job_id:jobId,equipment_type:f.get("type"),
    manufacturer:f.get("manufacturer")||null,model:f.get("model")||null,serial_number:f.get("serial")||null,
    horsepower:f.get("hp")?Number(f.get("hp")):null,voltage:f.get("voltage")||null,
    amperage:f.get("amperage")||null,phase:f.get("phase")||null,frequency:f.get("frequency")||null,
    rpm:f.get("rpm")?Number(f.get("rpm")):null,frame:f.get("frame")||null,
    ac_dc:f.get("acdc")||null,description:f.get("description")||null
  };
  const {data,error}=await supabaseClient.from("equipment").insert(payload).select("*").single();
  if(error)throw error;
  return data;
}
async function updateEquipmentTestDb(id,f){
  const customerName=f.get("customer"),jobNumber=f.get("job");
  const payload={
    customer_id:customerName?await equipmentCustomerId(customerName):null,
    job_id:jobNumber?await equipmentJobId(jobNumber):null,equipment_type:f.get("type"),
    manufacturer:f.get("manufacturer")||null,model:f.get("model")||null,serial_number:f.get("serial")||null,
    horsepower:f.get("hp")?Number(f.get("hp")):null,voltage:f.get("voltage")||null,
    amperage:f.get("amperage")||null,phase:f.get("phase")||null,frequency:f.get("frequency")||null,
    rpm:f.get("rpm")?Number(f.get("rpm")):null,frame:f.get("frame")||null,
    ac_dc:f.get("acdc")||null,description:f.get("description")||null
  };
  const {data,error}=await supabaseClient.from("equipment").update(payload).eq("id",id).select("*").single();
  if(error)throw error;
  return data;
}
function equipmentDbRow(x){
  return {id:x.id,number:x.equipment_number||"",type:x.equipment_type||"",customerId:x.customer_id||null,
    jobId:x.job_id||null,customer:x.company_name||"",job:x.job_number||"",manufacturer:x.manufacturer||"",
    model:x.model||"",serial:x.serial_number||"",hp:x.horsepower??"",voltage:x.voltage||"",
    amperage:x.amperage||"",phase:x.phase||"",frequency:x.frequency||"",rpm:x.rpm??"",
    frame:x.frame||"",acdc:x.ac_dc||"",description:x.description||""};
}
async function renderEquipmentTestPanel(){
  const root=document.getElementById("equipmentTestPanel");if(!root)return;
  try{await loadEquipmentFromSupabase()}catch(e){
    root.innerHTML=`<div class="card"><h2>⚙️ Equipment — TEST</h2><div class="action-alert">${esc(e.message||e)}</div><button class="primary" onclick="renderEquipmentTestPanel()">Retry Database</button></div>`;
    return;
  }
  const list=db.equipmentTest||[],m=equipmentTestModule(),q=(window.equipmentTestSearch||"").toLowerCase(),type=window.equipmentTestType||"";
  const rows=list.filter(e=>(!type||e.type===type)&&(!q||JSON.stringify(e).toLowerCase().includes(q)));
  root.innerHTML=`<div class="card">
    <div class="page-head"><div><h2>⚙️ Equipment — DATABASE TEST</h2><p class="muted">This module now reads and writes the real Supabase equipment table.</p></div>
    <button class="primary" onclick="openEquipmentTestForm()">+ Add Equipment</button></div>
    <div class="toolbar"><input class="search-input" placeholder="Search equipment, serial, customer or job..." value="${esc(q)}" oninput="window.equipmentTestSearch=this.value;renderEquipmentTestPanel()">
    <select onchange="window.equipmentTestType=this.value;renderEquipmentTestPanel()"><option value="">All types</option>${m.types.map(t=>`<option value="${esc(t)}" ${type===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Equipment #</th><th>Type</th><th>Customer</th><th>Job</th><th>Manufacturer</th><th>Model</th><th>Serial #</th><th></th></tr></thead><tbody>
    ${rows.length?rows.map(e=>`<tr><td>${esc(e.number)}</td><td>${esc(e.type)}</td><td>${esc(e.customer||"")}</td><td>${esc(e.job||"")}</td><td>${esc(e.manufacturer||"")}</td><td>${esc(e.model||"")}</td><td>${esc(e.serial||"")}</td><td><button class="secondary small" onclick="viewEquipmentTest('${esc(e.id)}')">View</button> <button class="secondary small" onclick="editEquipmentTest('${esc(e.id)}')">Edit</button></td></tr>`).join(""):`<tr><td colspan="8"><div class="empty-state">No equipment records found.</div></td></tr>`}
    </tbody></table></div></div>`;
}
function equipmentFormHtml(e){
  e=e||{};
  const customers=(db.customers||[]).map(c=>`<option value="${esc(c.name)}" ${c.name===e.customer?"selected":""}>${esc(c.name)}</option>`).join("");
  const jobs=(db.jobs||[]).map(j=>`<option value="${esc(j.id)}" ${String(j.id)===String(e.job)?"selected":""}>${esc(j.id)} — ${esc(j.customer||"")}</option>`).join("");
  const types=equipmentTestModule().types.map(t=>`<option value="${esc(t)}" ${t===e.type?"selected":""}>${esc(t)}</option>`).join("");
  return `<div class="form-grid">
    <div class="field"><label>Equipment #</label><input name="number" value="${esc(e.number||"")}" ${e.id?"readonly":""} placeholder="Auto-generated"></div>
    <div class="field"><label>Type</label><select name="type">${types}</select></div>
    <div class="field"><label>Customer</label><select name="customer"><option value="">— Select —</option>${customers}</select></div>
    <div class="field"><label>Job</label><select name="job"><option value="">— Select —</option>${jobs}</select></div>
    <div class="field"><label>Manufacturer</label><input name="manufacturer" value="${esc(e.manufacturer||"")}"></div>
    <div class="field"><label>Model</label><input name="model" value="${esc(e.model||"")}"></div>
    <div class="field"><label>Serial #</label><input name="serial" value="${esc(e.serial||"")}"></div>
    <div class="field"><label>Horsepower</label><input name="hp" type="number" value="${esc(e.hp??"")}"></div>
    <div class="field"><label>Voltage</label><input name="voltage" value="${esc(e.voltage||"")}"></div>
    <div class="field"><label>Amperage</label><input name="amperage" value="${esc(e.amperage||"")}"></div>
    <div class="field"><label>Phase</label><input name="phase" value="${esc(e.phase||"")}"></div>
    <div class="field"><label>Frequency</label><input name="frequency" value="${esc(e.frequency||"")}"></div>
    <div class="field"><label>RPM</label><input name="rpm" value="${esc(e.rpm??"")}"></div>
    <div class="field"><label>Frame</label><input name="frame" value="${esc(e.frame||"")}"></div>
    <div class="field"><label>AC / DC</label><select name="acdc"><option ${e.acdc==="AC"?"selected":""}>AC</option><option ${e.acdc==="DC"?"selected":""}>DC</option></select></div>
    <div class="field full"><label>Description</label><textarea name="description" rows="3">${esc(e.description||"")}</textarea></div>
  </div>`;
}
function openEquipmentTestForm(){
  openModal("Add Equipment — Database Test",equipmentFormHtml(),async f=>{
    try{await saveEquipmentTestToDb(f);closeModal();await renderEquipmentTestPanel()}
    catch(e){alert("Equipment was not saved to Supabase: "+(e.message||e))}
  });
}
async function editEquipmentTest(id){
  const e=(db.equipmentTest||[]).find(x=>String(x.id)===String(id));if(!e)return;
  openModal(`Edit ${esc(e.number)}`,equipmentFormHtml(e),async f=>{
    try{await updateEquipmentTestDb(id,f);closeModal();await renderEquipmentTestPanel()}
    catch(err){alert("Equipment was not updated in Supabase: "+(err.message||err))}
  });
}
function viewEquipmentTest(id){
  const e=(db.equipmentTest||[]).find(x=>String(x.id)===String(id));if(!e)return;
  openModal(`Equipment ${esc(e.number)}`,`<div class="detail-grid">
    <div><strong>Type</strong><span>${esc(e.type)}</span></div><div><strong>Customer</strong><span>${esc(e.customer||"—")}</span></div>
    <div><strong>Job</strong><span>${esc(e.job||"—")}</span></div><div><strong>Manufacturer</strong><span>${esc(e.manufacturer||"—")}</span></div>
    <div><strong>Model</strong><span>${esc(e.model||"—")}</span></div><div><strong>Serial</strong><span>${esc(e.serial||"—")}</span></div>
    <div><strong>HP</strong><span>${esc(e.hp||"—")}</span></div><div><strong>Voltage</strong><span>${esc(e.voltage||"—")}</span></div>
    <div><strong>Amperage</strong><span>${esc(e.amperage||"—")}</span></div><div><strong>RPM</strong><span>${esc(e.rpm||"—")}</span></div>
  </div><div class="section-title">Description</div><div class="notes-box">${esc(e.description||"—")}</div>
  <div class="form-actions"><button class="primary" onclick="closeModal()">Close</button></div>`);
}

async function renderDatabasePanel(){
 const el=document.getElementById("databasePanel");if(!el)return; const c=getSupabaseConfig()||{url:"http://127.0.0.1:54321",anonKey:""}; if(!supabaseClient)initSupabase();
 let session=null; if(supabaseClient){try{session=(await supabaseClient.auth.getSession()).data.session}catch(e){}}
 el.innerHTML=`<div class="db-connection-grid"><div><h4>Local Supabase</h4><p class="muted">Use the API URL and anon/publishable key from <code>npx.cmd supabase status</code> on your laptop.</p><div class="form-grid"><div class="field"><label>API URL</label><input id="supa_url" value="${esc(c.url)}"></div><div class="field"><label>Anon / Publishable Key</label><input id="supa_anon" type="password" value="${esc(c.anonKey)}"></div></div><button class="primary" id="saveSupa">Save Connection</button></div><div><h4>Authentication</h4><p class="muted">Local test accounts only.</p><div class="form-grid"><div class="field"><label>Email</label><input id="supa_email" value="${session?.user?.email||"admin@test.local"}"></div><div class="field"><label>Password</label><input id="supa_password" type="password" placeholder="Local test password"></div></div><div class="button-row"><button class="primary" id="supaLogin">Sign In</button><button class="secondary" id="supaLogout">Sign Out</button></div><div class="notice">Status: <b>${session?"Connected as "+esc(session.user.email):"Not signed in"}</b></div></div></div><div class="db-actions"><button class="primary" id="supaLoad" ${session?"":"disabled"}>⬇ Load Database Data</button><button class="secondary" id="supaPush" ${session?"":"disabled"}>⬆ Push Core Prototype Data</button></div><div class="notice"><b>Current scope:</b> Customers → Jobs → Quotes → Invoices / A/R are database-backed. Inventory is connected for read/sync. Engineering, motors, time, IFTA, deliveries, documents and full accounting are next.</div><div id="dbMessage"></div>`;
 document.getElementById("saveSupa").onclick=saveSupabaseSettings; document.getElementById("supaLogin").onclick=async()=>{try{await signInSupabase()}catch(e){document.getElementById("dbMessage").innerHTML='<div class="action-alert danger">'+esc(e.message||e)+'</div>'}}; document.getElementById("supaLogout").onclick=signOutSupabase;
 document.getElementById("supaLoad").onclick=async()=>{try{await loadCoreFromSupabase();alert("Database data loaded into the application.")}catch(e){document.getElementById("dbMessage").innerHTML='<div class="action-alert danger">'+esc(e.message||e)+'</div>'}};
 document.getElementById("supaPush").onclick=async()=>{try{await syncCoreToSupabase();document.getElementById("dbMessage").innerHTML='<div class="notice">Core prototype data pushed to PostgreSQL.</div>'}catch(e){document.getElementById("dbMessage").innerHTML='<div class="action-alert danger">'+esc(e.message||e)+'</div>'}};
}

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function money(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function nav(view){
 document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id===view));
 document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
 const names={dashboard:["Dashboard","AC Electric Corp. shop overview"],customers:["Customers","Customer accounts and contacts"],jobs:["Jobs / Motors","Work orders and repair workflow"],"motor-records":["Motor Master Records","Permanent equipment history and chain of custody"],inventory:["Inventory","Parts, bearings and shop supplies"],quotes:["Quotes","Repair estimates and approvals"],deliveries:["Pickups / Deliveries","Schedule and track transportation"]};
 document.getElementById("pageTitle").textContent=names[view][0]; document.getElementById("pageSub").textContent=names[view][1];
 db.audit=db.audit||[];
db.users=db.users||[
 {id:"U-1",name:"Prototype Admin",username:"admin",role:"Admin",active:true},
 {id:"U-2",name:"Prototype Supervisor",username:"supervisor",role:"Supervisor",active:true},
 {id:"U-3",name:"Prototype Technician",username:"tech1",role:"Technician",active:true}
];
initSupabase();
render();
const motorParam=new URLSearchParams(location.search).get('motor'); if(motorParam && db.jobs.some(j=>j.id===motorParam)){setTimeout(()=>editJob(motorParam),100);}
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>nav(b.dataset.view));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>nav(b.dataset.go));

function ensureV4Data(){
 db.schedules=db.schedules||[];
 const defaultProcedures=[
  {id:"SOP-001",name:"Motor Job-In",department:"Motor Repair",version:"1.0",status:"Active",steps:["Verify customer/job","Photograph nameplate","Record condition","Create motor master record"]},
  {id:"SOP-002",name:"Motor Inspection",department:"Motor Repair",version:"1.0",status:"Active",steps:["Electrical inspection","Mechanical inspection","Document findings","Supervisor review"]},
  {id:"SOP-003",name:"Breaker Certification",department:"Engineering",version:"1.0",status:"Draft",steps:["Visual inspection","Electrical tests","Mechanical tests","Record results","Engineer approval"]}
 ];
 if(!Array.isArray(db.procedures)){
  if(db.procedures && typeof db.procedures === "object"){
   const converted=[];
   Object.entries(db.procedures).forEach(([department,items])=>{
    if(Array.isArray(items)) converted.push({id:`SOP-${department}`,name:`${department} Procedure`,department,version:"1.0",status:"Active",steps:items.map(String)});
   });
   db.procedures=converted;
  } else db.procedures=JSON.parse(JSON.stringify(defaultProcedures));
 }
 if(!db.procedures.length) db.procedures=JSON.parse(JSON.stringify(defaultProcedures));
 db.maintenance=db.maintenance||[];
 db.employeeCerts=db.employeeCerts||[];
 db.attachments=db.attachments||[];
 db.alerts=db.alerts||[];
 db.integrationProfiles=db.integrationProfiles||[
  {name:"QuickBooks Online",format:"CSV / API mapping",status:"Planned"},
  {name:"Xero",format:"CSV / API mapping",status:"Planned"},
  {name:"Sage",format:"CSV mapping",status:"Planned"},
  {name:"Generic Accounting CSV",format:"CSV",status:"Ready"},
  {name:"Universal JSON",format:"JSON",status:"Ready"}
 ];
}
function allLaborHours(){
 return ((db.timeSlips||[]).reduce((a,x)=>a+Number(x.minutes||0),0)+(db.laborSessions||[]).reduce((a,x)=>a+Number(x.minutes||0),0))/60;
}
function allBillableHours(){
 return (db.timeSlips||[]).filter(x=>x.billable).reduce((a,x)=>a+Number(x.minutes||0),0)/60;
}
function makeAlerts(){
 ensureV4Data();
 const a=[];
 const low=(db.inventory||[]).filter(x=>Number(x.qty)<=Number(x.min)).length;
 if(low)a.push({level:"warning",text:`${low} inventory item${low===1?"":"s"} below minimum.`});
 const overdue=(db.invoices||[]).filter(x=>typeof invoiceStatus==="function"&&invoiceStatus(x)==="Overdue");
 if(overdue.length)a.push({level:"danger",text:`${overdue.length} invoice${overdue.length===1?"":"s"} are overdue.`});
 const today=new Date(); today.setHours(0,0,0,0);
 (db.employeeCerts||[]).forEach(c=>{const d=new Date(c.expires+"T00:00:00"),days=Math.ceil((d-today)/86400000);if(days<=30)a.push({level:days<0?"danger":"warning",text:`${c.employee}'s ${c.certification} ${days<0?"expired":`expires in ${days} days`}.`})});
 (db.jobs||[]).filter(j=>j.stage==="Waiting on Parts").forEach(j=>a.push({level:"info",text:`${j.id} is waiting on parts.`}));
 return a;
}
function renderCommandCenter(){
 ensureV4Data();
 const alerts=makeAlerts(),active=(db.jobs||[]).filter(j=>j.stage!=="Completed").length;
 const eng=(db.engineeringJobs||[]).filter(j=>j.status!=="Completed").length;
 const ar=(db.invoices||[]).filter(i=>typeof invoiceBalance==="function"&&invoiceBalance(i)>0.009).reduce((a,i)=>a+invoiceBalance(i),0);
 document.getElementById("dashboardCommand").innerHTML=`<div class="command-grid">
  <div><b>${active}</b><span>Active Shop Jobs</span></div><div><b>${eng}</b><span>Engineering Jobs</span></div><div><b>${allLaborHours().toFixed(1)}</b><span>Tracked Hours</span></div><div><b>${allBillableHours().toFixed(1)}</b><span>Billable Hours</span></div><div><b>${money(ar)}</b><span>Open A/R</span></div><div><b>${alerts.length}</b><span>Action Items</span></div>
 </div>`;
}
function renderSchedule(){
 ensureV4Data();const el=document.getElementById("scheduleBoard");if(!el)return;
 const days=[0,1,2,3,4,5,6].map(n=>{const d=new Date();d.setDate(d.getDate()-d.getDay()+n);return d.toISOString().slice(0,10)});
 el.innerHTML=`<div class="schedule-grid">${days.map(d=>`<div class="schedule-day"><b>${new Date(d+"T00:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</b>${db.schedules.filter(x=>x.date===d).map(x=>`<div class="schedule-item"><strong>${esc(x.job)}</strong><span>${esc(x.employee||"Unassigned")}</span><small>${esc(x.type||"Work")} ${x.start?`· ${esc(x.start)}`:""}</small></div>`).join("")||'<div class="muted">No work scheduled</div>'}</div>`).join("")}</div>`;
}
function openScheduleBuilder(){
 ensureV4Data();
 const today=new Date().toISOString().slice(0,10);
 openModal("Schedule Work",`<div class="form-grid">
 <div class="field"><label>Job / E-Job</label><select id="sch_job">${(db.jobs||[]).map(j=>`<option>${esc(j.id)}</option>`).join("")}</select></div>
 <div class="field"><label>Employee / Crew</label><input id="sch_employee"></div>
 <div class="field"><label>Date</label><input id="sch_date" type="date" value="${today}"></div>
 <div class="field"><label>Start</label><input id="sch_start" type="time"></div>
 <div class="field"><label>Type</label><select id="sch_type"><option>Shop Work</option><option>Engineering Field Service</option><option>Pickup</option><option>Delivery</option><option>Inspection</option><option>Testing</option></select></div>
 <div class="field"><label>Notes</label><input id="sch_notes"></div></div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveSchedule()">Schedule</button></div>`,()=>{});
}
function saveSchedule(){
 ensureV4Data();const job=document.getElementById("sch_job").value,employee=document.getElementById("sch_employee").value.trim(),date=document.getElementById("sch_date").value,start=document.getElementById("sch_start").value,type=document.getElementById("sch_type").value,notes=document.getElementById("sch_notes").value.trim();
 if(!job||!date){alert("Job and date are required.");return} db.schedules.push({id:"SCH-"+(db.schedules.length+1),job,employee,date,start,type,notes});save();closeModal();render();
}
function renderProcedures(){
 ensureV4Data();const el=document.getElementById("procedureTable");if(!el)return;
 el.innerHTML=`<div class="row head proc-grid"><div>Procedure</div><div>Department</div><div>Version</div><div>Status</div><div>Steps</div></div>`+db.procedures.map(p=>`<div class="row proc-grid"><div><b>${esc(p.name)}</b></div><div>${esc(p.department)}</div><div>${esc(p.version)}</div><div>${esc(p.status)}</div><div>${p.steps.length} required steps</div></div>`).join("");
}
function openProcedureBuilder(){
 ensureV4Data();openModal("New Procedure / SOP",`<div class="form-grid">
 <div class="field"><label>Name</label><input id="p_name"></div><div class="field"><label>Department</label><input id="p_dept"></div>
 <div class="field"><label>Version</label><input id="p_ver" value="1.0"></div><div class="field"><label>Steps</label><input id="p_steps" placeholder="Separate steps with commas"></div></div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveProcedure()">Save</button></div>`,()=>{});
}
function saveProcedure(){
 ensureV4Data();const name=document.getElementById("p_name").value.trim(),department=document.getElementById("p_dept").value.trim(),version=document.getElementById("p_ver").value.trim(),steps=document.getElementById("p_steps").value.split(",").map(x=>x.trim()).filter(Boolean);if(!name||!steps.length){alert("Name and at least one step are required.");return}db.procedures.push({id:"SOP-"+(db.procedures.length+1),name,department,version,status:"Active",steps});save();closeModal();render();
}
function renderMaintenance(){
 ensureV4Data();const el=document.getElementById("maintenanceTable");if(!el)return;
 el.innerHTML=`<div class="row head maint-grid"><div>Equipment</div><div>Customer</div><div>Service</div><div>Next Due</div><div>Status</div></div>`+db.maintenance.map(m=>{const days=Math.ceil((new Date(m.due+"T00:00:00")-new Date())/86400000);return `<div class="row maint-grid"><div><b>${esc(m.equipment)}</b></div><div>${esc(m.customer)}</div><div>${esc(m.service)}</div><div>${esc(m.due)}</div><div>${days<0?"OVERDUE":days<=30?"Due Soon":"Scheduled"}</div></div>`}).join("")||empty("No preventive maintenance schedules.");
}
function openMaintenanceBuilder(){
 ensureV4Data();openModal("Preventive Maintenance",`<div class="form-grid"><div class="field"><label>Equipment</label><input id="pm_equipment"></div><div class="field"><label>Customer</label><select id="pm_customer">${customerOptions()}</select></div><div class="field"><label>Service</label><input id="pm_service" placeholder="Annual inspection"></div><div class="field"><label>Next Due</label><input id="pm_due" type="date"></div></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveMaintenance()">Save</button></div>`,()=>{});
}
function saveMaintenance(){ensureV4Data();const equipment=document.getElementById("pm_equipment").value.trim(),customer=document.getElementById("pm_customer").value,service=document.getElementById("pm_service").value.trim(),due=document.getElementById("pm_due").value;if(!equipment||!due){alert("Equipment and due date required.");return}db.maintenance.push({id:"PM-"+(db.maintenance.length+1),equipment,customer,service,due});save();closeModal();render();}
function renderCertifications(){
 ensureV4Data();const el=document.getElementById("certTable");if(!el)return;
 el.innerHTML=`<div class="row head cert-grid"><div>Employee</div><div>Certification</div><div>Department</div><div>Issued</div><div>Expires</div><div>Status</div></div>`+db.employeeCerts.map(c=>{const days=Math.ceil((new Date(c.expires+"T00:00:00")-new Date())/86400000);return `<div class="row cert-grid"><div>${esc(c.employee)}</div><div><b>${esc(c.certification)}</b></div><div>${esc(c.department)}</div><div>${esc(c.issued)}</div><div>${esc(c.expires)}</div><div>${days<0?"Expired":days<=30?"Expiring Soon":"Current"}</div></div>`}).join("")||empty("No employee certifications yet.");
}
function openCertificationBuilder(){
 ensureV4Data();openModal("Employee Certification",`<div class="form-grid"><div class="field"><label>Employee</label><input id="ec_employee"></div><div class="field"><label>Department</label><input id="ec_dept"></div><div class="field"><label>Certification</label><input id="ec_cert" placeholder="Breaker certification, OSHA, etc."></div><div class="field"><label>Issued</label><input id="ec_issued" type="date"></div><div class="field"><label>Expires</label><input id="ec_expires" type="date"></div></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveCertification()">Save</button></div>`,()=>{});
}
function saveCertification(){ensureV4Data();const employee=document.getElementById("ec_employee").value.trim(),department=document.getElementById("ec_dept").value.trim(),certification=document.getElementById("ec_cert").value.trim(),issued=document.getElementById("ec_issued").value,expires=document.getElementById("ec_expires").value;if(!employee||!certification||!expires){alert("Employee, certification and expiration are required.");return}db.employeeCerts.push({id:"CERT-"+(db.employeeCerts.length+1),employee,department,certification,issued,expires});save();closeModal();render();}
function renderManagementReport(){
 ensureV4Data();const el=document.getElementById("managementReport");if(!el)return;
 const jobs=db.jobs||[], completed=jobs.filter(j=>j.stage==="Completed").length,active=jobs.length-completed;
 const quotes=db.quotes||[],approved=quotes.filter(q=>q.status==="Approved"),sales=approved.reduce((a,q)=>a+Number(q.amount||0),0);
 const ar=(db.invoices||[]).reduce((a,i)=>a+(typeof invoiceBalance==="function"?invoiceBalance(i):0),0);
 const inv=(db.inventory||[]).reduce((a,i)=>a+Number(i.qty||0)*Number(i.cost||0),0);
 const engHours=(db.timeSlips||[]).filter(x=>x.department==="Engineering").reduce((a,x)=>a+Number(x.minutes||0),0)/60;
 const billHours=allBillableHours();
 const overdue=(db.invoices||[]).filter(x=>typeof invoiceStatus==="function"&&invoiceStatus(x)==="Overdue").length;
 el.innerHTML=`<div class="report-grid"><div><b>${active}</b><span>Active Jobs</span></div><div><b>${completed}</b><span>Completed Jobs</span></div><div><b>${money(sales)}</b><span>Approved Quote Value</span></div><div><b>${money(ar)}</b><span>Outstanding A/R</span></div><div><b>${money(inv)}</b><span>Inventory Value</span></div><div><b>${engHours.toFixed(1)}</b><span>Engineering Hours</span></div><div><b>${billHours.toFixed(1)}</b><span>Billable Hours</span></div><div><b>${overdue}</b><span>Overdue Invoices</span></div></div>
 <div class="panel-inner"><h3>Profitability Snapshot</h3><p>Prototype estimate: revenue is based on approved quotes. Production version should calculate actual job margin from labor, parts, outside services and accounting costs.</p>
 <div class="bar-report"><div><span>Approved Quote Revenue</span><b>${money(sales)}</b></div><div><span>Open A/R</span><b>${money(ar)}</b></div><div><span>Inventory</span><b>${money(inv)}</b></div></div></div>`;
}
function renderIntegrations(){
 ensureV4Data();const el=document.getElementById("integrationPanel");if(!el)return;
 el.innerHTML=`<div class="notice">The system stores normalized business data first. Production connectors can map that data to each accounting platform instead of forcing AC Electric into one file format.</div><div class="row head integ-grid"><div>Platform</div><div>Format</div><div>Status</div></div>`+db.integrationProfiles.map(p=>`<div class="row integ-grid"><div><b>${esc(p.name)}</b></div><div>${esc(p.format)}</div><div>${esc(p.status)}</div></div>`).join("");
}
function universalExport(){
 ensureV4Data();
 const data={exportVersion:"4.0",generatedAt:new Date().toISOString(),company:"AC Electric Corp.",customers:db.customers||[],jobs:db.jobs||[],engineeringJobs:db.engineeringJobs||[],motorRecords:db.motorRecords||[],quotes:db.quotes||[],invoices:db.invoices||[],payments:db.payments||[],inventory:db.inventory||[],newMotors:db.newMotors||[],timeSlips:db.timeSlips||[],laborSessions:db.laborSessions||[],employees:db.employees||[],employeeCerts:db.employeeCerts||[],journalEntries:db.journalEntries||[],maintenance:db.maintenance||[],testRecords:db.testRecords||[]};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="AC-Electric-universal-export.json";a.click();URL.revokeObjectURL(a.href);
}
function renderAlerts(){
 const el=document.getElementById("alertPanel");if(!el)return;const a=makeAlerts();
 el.innerHTML=a.map(x=>`<div class="action-alert ${x.level}"><b>${x.level==="danger"?"🔴":x.level==="warning"?"🟠":"🔵"}</b><span>${esc(x.text)}</span></div>`).join("")||`<div class="notice">✓ No action items detected.</div>`;
}
function assistantAnswer(q){
 const x=q.toLowerCase();ensureV4Data();
 if(x.includes("parts")||x.includes("waiting")){const j=(db.jobs||[]).filter(j=>j.stage==="Waiting on Parts");return `${j.length} job(s) are waiting on parts: ${j.map(j=>j.id+" ("+j.customer+")").join(", ")||"none"}.`;}
 if(x.includes("overdue")||x.includes("invoice")){const a=(db.invoices||[]).filter(i=>typeof invoiceStatus==="function"&&invoiceStatus(i)==="Overdue");return `${a.length} invoice(s) are overdue. Total overdue balance: ${money(a.reduce((t,i)=>t+invoiceBalance(i),0))}.`;}
 if(x.includes("engineering")||x.includes("billable")){return `Engineering has ${allBillableHours().toFixed(2)} total billable tracked hours across the current time-slip data.`;}
 if(x.includes("inventory")||x.includes("stock")){const low=(db.inventory||[]).filter(i=>i.qty<=i.min);return `${low.length} inventory item(s) are at or below minimum: ${low.map(i=>i.part).join(", ")||"none"}.`;}
 if(x.includes("job")){return `There are ${(db.jobs||[]).filter(j=>j.stage!=="Completed").length} active shop jobs and ${(db.engineeringJobs||[]).filter(j=>j.status!=="Completed").length} active engineering jobs.`;}
 return "I can answer prototype questions about jobs, parts, invoices, engineering, billable time and inventory. Try asking: “Which jobs are waiting on parts?”";
}

function render(){
 const open=db.jobs.filter(j=>j.stage!=="Completed").length;
 document.getElementById("statJobs").textContent=open;
 document.getElementById("statParts").textContent=db.jobs.filter(j=>j.stage==="Waiting on Parts").length;
 document.getElementById("statReady").textContent=db.jobs.filter(j=>j.stage==="Ready for Pickup").length;
 document.getElementById("statSales").textContent=money(db.quotes.filter(q=>q.status==="Approved").reduce((a,q)=>a+Number(q.amount),0));
 document.getElementById("dashboardJobs").innerHTML=db.jobs.slice(0,6).map(j=>`<div class="job-card"><strong>${esc(j.id)} — ${esc(j.customer)}</strong><div class="meta"><span class="muted">${esc(j.type)} ${j.hp?j.hp+" HP":""}</span>${badge(j.stage)}</div></div>`).join("")||empty();
 const low=db.inventory.filter(i=>i.qty<=i.min);
 document.getElementById("dashboardInventory").innerHTML=low.map(i=>`<div class="job-card"><strong>${esc(i.part)}</strong><div class="meta"><span class="muted">${esc(i.desc)}</span><span class="danger">${i.qty} on hand</span></div></div>`).join("")||empty("No low-stock items");
 renderCustomers();renderJobs();renderInventory();renderNewMotors();
 renderSales();
 renderBilling();
 renderTimeSlips();
 renderAccounting();
 renderEngineering();
 renderCommandCenter();renderSchedule();renderProcedures();renderMaintenance();renderCertifications();renderManagementReport();renderIntegrations();renderAlerts();
 renderMileage();renderQuotes();renderDeliveries();
}
function badge(s){let c=s==="Ready for Pickup"?"green":s==="Waiting on Parts"?"yellow":s==="Completed"?"blue":s==="Failed"?"red":"";return `<span class="badge ${c}">${esc(s)}</span>`}
function empty(t="No records yet"){return `<div class="empty">${t}</div>`}

function motorRecordForJob(j){
 j.motor=j.motor||{};
 return j.motor;
}
function renderMotorRecords(){
 const q=(document.getElementById("motorRecordSearch")?.value||"").toLowerCase();
 const a=db.jobs.filter(j=>JSON.stringify(j).toLowerCase().includes(q));
 document.getElementById("motorRecordTable").innerHTML=
 `<div class="row head"><div>Job / Customer</div><div>Equipment</div><div>Serial</div><div>Progress</div></div>`+
 a.map(j=>`<div class="row clickable" onclick="openMotorRecord('${j.id}')">
 <div><strong>${esc(j.id)}</strong><div class="muted">${esc(j.customer)}</div></div>
 <div>${esc(j.type)}<div class="muted">${j.motor?.manufacturer?esc(j.motor.manufacturer):"Manufacturer not entered"} ${j.hp?j.hp+" HP":""}</div><span class="master-status">Master Record: Active</span></div>
 <div>${esc(j.serial||"—")}</div>
 <div>${jobPct(j)}%</div></div>`).join("")||empty("No motor records yet.");
}
function motorField(label,name,value="",type="text"){
 return `<div class="field"><label>${label}</label><input name="${name}" value="${esc(value??"")}" type="${type}"></div>`;
}
function motorText(label,name,value="",rows=3){
 return `<div class="field full"><label>${label}</label><textarea name="${name}" rows="${rows}">${esc(value??"")}</textarea></div>`;
}
function openMotorRecord(id){
 const j=db.jobs.find(x=>x.id===id); if(!j)return;
 const m=motorRecordForJob(j);
 const photos=(j.photos||[]).map((p,n)=>`<div class="photo"><img src="${p.data}"><small>${esc(p.stage||"Job")} · ${esc(p.name||"photo")}</small></div>`).join("")||empty("No photos attached.");
 const overrides=(j.overrides||[]).map(o=>`<li>${esc(o.from||"Step")} → override · ${esc(o.at||"")}</li>`).join("")||"<li>None</li>";
 openModal("Motor Master Record — "+j.id,`
  <div class="record-banner">
   <div><b>${esc(j.customer)}</b><div class="muted">${esc(j.type)} · ${esc(j.serial||"No serial")}</div></div>
   ${badge(j.stage)}
  </div>
  <div class="tabs">
   <button type="button" class="tab active" data-tab="ident">Identification</button>
   <button type="button" class="tab" data-tab="mech">Mechanical</button>
   <button type="button" class="tab" data-tab="elec">Electrical</button>
   <button type="button" class="tab" data-tab="history">History / Chain</button>
  </div>
  <div class="record-tab active" id="tab-ident">
   <div class="form-grid">
    ${motorField("Manufacturer","manufacturer",m.manufacturer)}
    ${motorField("Model","model",m.model)}
    ${motorField("Serial Number","serial",j.serial)}
    ${motorField("AC / DC","acdc",m.acdc)}
    ${motorField("Phase","phase",m.phase)}
    ${motorField("HP / kW","power",m.power||j.hp)}
    ${motorField("Voltage","voltage",m.voltage||j.voltage)}
    ${motorField("Amps","amps",m.amps)}
    ${motorField("RPM","rpm",m.rpm)}
    ${motorField("Frame","frame",m.frame)}
    ${motorField("Frequency","frequency",m.frequency)}
    ${motorField("Service Factor","serviceFactor",m.serviceFactor)}
    ${motorField("Enclosure","enclosure",m.enclosure)}
    ${motorField("Insulation Class","insulationClass",m.insulationClass)}
    ${motorText("Nameplate / Identification Notes","identNotes",m.identNotes)}
   </div>
   <div class="photo-actions"><button type="button" class="secondary" onclick="addJobPhoto('${j.id}','Nameplate')">📷 Add Nameplate Photo</button></div>
  </div>
  <div class="record-tab" id="tab-mech">
   <div class="form-grid">
    ${motorField("DE Bearing","bearingDE",m.bearingDE)}
    ${motorField("ODE Bearing","bearingODE",m.bearingODE)}
    ${motorField("Bearing Manufacturer","bearingManufacturer",m.bearingManufacturer)}
    ${motorField("DE Seal","sealDE",m.sealDE)}
    ${motorField("ODE Seal","sealODE",m.sealODE)}
    ${motorField("Shaft Diameter","shaftDiameter",m.shaftDiameter)}
    ${motorField("Shaft Length","shaftLength",m.shaftLength)}
    ${motorField("Shaft / Fit Notes","shaftFits",m.shaftFits)}
    ${motorField("Endplay","endplay",m.endplay)}
    ${motorField("Air Gap","airGap",m.airGap)}
    ${motorField("Balance","balance",m.balance)}
    ${motorText("Rotor / Mechanical Condition","rotorCondition",m.rotorCondition)}
   </div>
  </div>
  <div class="record-tab" id="tab-elec">
   <div class="form-grid">
    ${motorField("Winding Resistance","windingResistance",m.windingResistance)}
    ${motorField("Insulation Resistance","insulationResistance",m.insulationResistance)}
    ${motorField("PI","pi",m.pi)}
    ${motorField("Surge Test","surgeTest",m.surgeTest)}
    ${motorField("Phase Balance","phaseBalance",m.phaseBalance)}
    ${motorField("Grounding","grounding",m.grounding)}
    ${motorText("Initial Test Results","initialTests",m.initialTests)}
    ${motorText("Final Test Results","finalTests",m.finalTests)}
   </div>
  </div>
  <div class="record-tab" id="tab-history">
   <div class="history-grid">
    <div><h3>Workflow</h3><div class="mini-history">${WORKFLOW.map((w,i)=>`<div class="${(j.completed||{})[w[0]]?'history-done':''}"><span>${i+1}</span>${esc(w[1])}</div>`).join("")}</div></div>
    <div><h3>Supervisor Overrides</h3><ul>${overrides}</ul></div>
   </div>
   <h3>Chain of Custody</h3>
   <div class="chain">
    <div>🚚 Pickup / Delivery<br><small>${(j.pickupDelivery||"Not linked")}</small></div>
    <div>🏭 Receiving<br><small>${(j.receivedAt||"Not recorded")}</small></div>
    <div>🔧 Repair<br><small>Tracked by workflow</small></div>
    <div>🚚 Return Delivery<br><small>Tracked in deliveries</small></div>
   </div>
  </div>
  <h3>All Job Photos</h3><div class="photos">${photos}</div>
  <div class="form-actions"><button type="button" class="primary" onclick="saveMotorRecord('${j.id}')">Save Motor Record</button></div>
 `,()=>{});
 document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{
   document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
   document.querySelectorAll(".record-tab").forEach(x=>x.classList.remove("active"));
   t.classList.add("active");document.getElementById("tab-"+t.dataset.tab).classList.add("active");
 });
}
function saveMotorRecord(id){
 const j=db.jobs.find(x=>x.id===id);j.motor=j.motor||{};
 document.querySelectorAll("#modalForm input[name],#modalForm textarea[name]").forEach(el=>{
   if(el.name==="serial") j.serial=el.value; else j.motor[el.name]=el.value;
 });
 save();closeModal();render();
}
function openNewMotorRecord(){
 openNewJob();
}


function openJobFromDashboard(id){
  editJob(id);
}


const USER_ROLES={
 "Technician":["View assigned jobs","Update repair workflow","Add photos","Enter test results"],
 "Receiving":["Job motors in","Enter nameplate data","Create QR labels","Manage receiving"],
 "Driver":["View assigned pickups/deliveries","Record pickup condition","Add delivery photos","Capture delivery signature"],
 "Manager":["View all jobs","Quotes","Approvals","Reports","User management"],
 "Supervisor":["All manager functions","Workflow overrides","QC approvals","User management"],
 "Office":["Customers","Jobs","Quotes","Invoices","Scheduling"],
 "Admin":["All system functions","Users/access","System settings"]
};
function renderUsers(){
 const el=document.getElementById("userTable"); if(!el)return;
 const users=db.users||[];
 el.innerHTML=`<div class="row head"><div>Name</div><div>Role</div><div>Status</div><div>Access</div></div>`+
 users.map(u=>`<div class="row"><div><strong>${esc(u.name)}</strong><div class="muted">${esc(u.username)}</div></div><div>${esc(u.role)}</div><div>${u.active!==false?"Active":"Disabled"}</div><div><button class="secondary" onclick="editUser('${u.id}')">Edit</button></div></div>`).join("")||empty("No users created.");
}
function openUserBuilder(existing=null){
 const u=existing||{name:"",username:"",role:"Technician",active:true};
 openModal(existing?"Edit User":"Add User",`
  <div class="form-grid">
   <div class="field"><label>Employee Name</label><input id="uname" value="${esc(u.name)}"></div>
   <div class="field"><label>Username</label><input id="uusername" value="${esc(u.username)}"></div>
   <div class="field"><label>Role</label><select id="urole">${Object.keys(USER_ROLES).map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}</select></div>
   <div class="field"><label>Status</label><select id="uactive"><option value="1" ${u.active!==false?"selected":""}>Active</option><option value="0" ${u.active===false?"selected":""}>Disabled</option></select></div>
  </div>
  <div id="roleAccess" class="role-access"></div>
  <div class="notice"><b>Prototype:</b> This demonstrates roles and permissions. Real authentication/passwords/2FA will be handled by the secure production database and identity system.</div>
  <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveUser('${existing?existing.id:""}')">Save User</button></div>
 `,()=>{});
 updateRoleAccess();
 document.getElementById("urole").onchange=updateRoleAccess;
}
function updateRoleAccess(){
 const r=document.getElementById("urole")?.value, a=document.getElementById("roleAccess");
 if(a)a.innerHTML=`<b>Typical access for ${esc(r)}</b><ul>${(USER_ROLES[r]||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
}
function editUser(id){openUserBuilder((db.users||[]).find(u=>u.id===id))}
function saveUser(id){
 db.users=db.users||[];
 const u=id?db.users.find(x=>x.id===id):{id:"U-"+(db.users.length+1)};
 if(!id)db.users.push(u);
 u.name=document.getElementById("uname").value.trim();u.username=document.getElementById("uusername").value.trim();u.role=document.getElementById("urole").value;u.active=document.getElementById("uactive").value==="1";
 if(!u.name||!u.username){alert("Enter a name and username.");return}
 save();closeModal();render();
}


const DEFAULT_PROCEDURES={
 Receiving:["Verify customer and job","Photograph nameplate","Enter nameplate data","Record incoming condition","Create/attach QR label"],
 Inspection:["Visual inspection","Initial electrical tests","Mechanical checks","Document findings","Determine repair scope"],
 Disassembly:["Record as-found condition","Mark/identify components","Disassemble safely","Record parts removed","Photograph critical findings"],
 Cleaning:["Wash/clean components","Dry components","Inspect after cleaning","Document condition"],
 Repair:["Record repair operations","Record parts used","Record bearing/seal information","Record measurements","Technician sign-off"],
 Assembly:["Verify parts","Install bearings/seals","Assemble motor","Verify mechanical clearances","Technician sign-off"],
 Testing:["Perform required electrical tests","Perform required mechanical tests","Record results","Compare with acceptance criteria","Test technician sign-off"],
 FinalQC:["Final inspection","Verify documentation","Verify photos","Supervisor/QC approval","Release for pickup/delivery"]
};
const ADMIN_DEFAULTS={company:{name:"AC Electric Corp.",phone:"",email:"",address:"",timezone:"America/New_York"},rates:{laborRate:0,taxRate:0,markup:0,quoteValidDays:30},delivery:{defaultDrivers:"",requireDeliverySignature:true,requireDamagePhoto:true},system:{retentionDays:3650,maintenanceMode:false}};
function adminData(){db.admin=db.admin||JSON.parse(JSON.stringify(ADMIN_DEFAULTS));ensureV4Data();return db.admin}
function renderAdmin(){
 const el=document.getElementById("adminPanel");if(!el)return;
 adminData();
 el.innerHTML=`<div class="muted">Choose a category above to edit settings.</div>`;
 document.querySelectorAll(".admin-card").forEach(b=>b.onclick=()=>openAdminTab(b.dataset.adminTab));
}
function openAdminTab(tab){
 if(tab==="employees"){
   ensureEmployeeData();
   const e=document.getElementById("adminPanel");
   if(e){
     e.innerHTML='<h3>👷 Employee Tracking & Productivity</h3><div class="notice">Track employee hours, jobs, labor codes and productivity. Use the date/filter controls in the production version for weekly, monthly and quarterly reporting.</div><div id="employeeAdminPanel"></div>';
     renderEmployeeAdmin();
   }
   return;
 }


 adminData();const a=db.admin;const el=document.getElementById("adminPanel");let html="";
 if(tab==="database")html=`<h3>🗄️ Local Supabase Database</h3><div id="databasePanel"></div>`;
 if(tab==="company")html=`<h3>Company / Shop Information</h3><div class="form-grid">${motorField("Company Name","a_company",a.company.name)}${motorField("Phone","a_phone",a.company.phone)}${motorField("Email","a_email",a.company.email)}${motorField("Time Zone","a_timezone",a.company.timezone)}${motorText("Address","a_address",a.company.address,2)}</div><button class="primary" onclick="saveAdminTab('company')">Save Company Settings</button>`;
 if(tab==="roles")html=`<h3>Roles & Permissions</h3><div class="role-admin-list">${Object.entries(USER_ROLES).map(([r,p])=>`<div class="role-admin"><b>${esc(r)}</b><ul>${p.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div><div class="notice">Role permissions will become enforced by the production authentication system. The prototype displays the planned access model.</div>`;
 if(tab==="rates")html=`<h3>Labor & Quote Rates</h3><div class="form-grid">${motorField("Default Labor Rate","a_laborRate",a.rates.laborRate,"number")}${motorField("Tax Rate %","a_taxRate",a.rates.taxRate,"number")}${motorField("Default Parts Markup %","a_markup",a.rates.markup,"number")}${motorField("Quote Valid Days","a_quoteValidDays",a.rates.quoteValidDays,"number")}</div><button class="primary" onclick="saveAdminTab('rates')">Save Rate Settings</button>`;
  if(tab==="procedures")html=`<h3>Shop Procedures</h3><div class="procedure-admin">${db.procedures.map((p,i)=>`<div class="procedure-card"><b>${esc(p.name)}</b><div class="muted">${esc(p.department)} · v${esc(p.version)} · ${esc(p.status)}</div><ol>${(p.steps||[]).map((x,j)=>`<li><input value="${esc(x)}" data-proc-index="${i}" data-step-index="${j}"></li>`).join("")}</ol><button class="secondary" onclick="addProcedureStep(${i})">+ Add Step</button></div>`).join("")}</div><button class="primary" onclick="saveProcedures()">Save Procedures</button>`;
 if(tab==="imports")html=`<h3>Import / Export</h3>
  <div class="import-grid">
   <div class="import-card"><b>👥 Customers</b><p>Import an existing customer list from a CSV spreadsheet.</p><button class="primary" onclick="importCsv('customers')">📥 Import Customers</button><button class="secondary" onclick="exportCustomersCsv()">📤 Export Customers</button><div class="muted">Expected columns: Name, Contact, Phone, Email, Address, Notes</div></div>
   <div class="import-card"><b>📦 Inventory / Parts</b><p>Import parts, bearings and general inventory from a CSV spreadsheet.</p><button class="primary" onclick="importCsv('inventory')">📥 Import Inventory</button><button class="secondary" onclick="exportInventoryCsv()">📤 Export Inventory</button><div class="muted">Expected columns: Part Number, Description, Category, Manufacturer, Quantity, Unit Cost, Location, Reorder Level</div></div>
   <div class="import-card"><b>⚙️ New Motors</b><p>Import your stock of new motors from a CSV spreadsheet.</p><button class="primary" onclick="importNewMotorsCsv()">📥 Import New Motors</button><button class="secondary" onclick="exportNewMotorsCsv()">📤 Export New Motors</button><div class="muted">Includes stock #, manufacturer, model, HP, AC/DC, phase, voltage, RPM, quantity, cost, sale price and location.</div></div>
   <div class="import-card"><b>💾 Prototype Backup</b><p>Export the current prototype data as a JSON backup file.</p><button class="secondary" onclick="exportPrototypeBackup()">📤 Export Backup</button><div class="muted">Production will use scheduled encrypted cloud backups.</div></div>
  </div>`; 
 if(tab==="parts")html=`<h3>Parts / Bearings Catalog</h3><div class="notice">Prototype placeholder for the AC Electric parts catalog. Production version will support bearing numbers, manufacturers, seals, prices, suppliers, stock levels and approved substitutes.</div><button class="primary" onclick="alert('Parts catalog framework ready for the next build.')">Configure Catalog</button>`;
 if(tab==="ifta")html=`<h3>Fleet / IFTA — Quarterly Running Log</h3>
  <div id="iftaAdminLog"></div>`; 
 if(tab==="delivery")html=`<h3>Delivery Settings</h3><div class="form-grid">${motorText("Default Drivers","a_drivers",a.delivery.defaultDrivers,2)}<div class="field"><label>Require customer signature on delivery</label><select id="a_deliverySig"><option value="1" ${a.delivery.requireDeliverySignature?"selected":""}>Yes</option><option value="0" ${!a.delivery.requireDeliverySignature?"selected":""}>No</option></select></div><div class="field"><label>Require damage photo when damaged</label><select id="a_damagePhoto"><option value="1" ${a.delivery.requireDamagePhoto?"selected":""}>Yes</option><option value="0" ${!a.delivery.requireDamagePhoto?"selected":""}>No</option></select></div></div><button class="primary" onclick="saveAdminTab('delivery')">Save Delivery Settings</button>`;
 if(tab==="audit")html=`<h3>Audit Log</h3><div class="audit-list">${(db.audit||[]).slice().reverse().map(x=>`<div><b>${esc(x.action)}</b> · ${esc(x.user||"System")}<span>${esc(x.at||"")}</span></div>`).join("")||empty("No activity recorded yet.")}</div>`;
 if(tab==="system")html=`<h3>System / Production Readiness</h3><div class="notice"><b>Current prototype:</b> GitHub Pages + browser-local demo data. Do not use real customer, employee, signature or production job data here.</div><div class="system-checks"><div>🔐 Authentication: <b>Production required</b></div><div>🗄️ Managed database: <b>Production required</b></div><div>📷 Private photo storage: <b>Production required</b></div><div>💾 Automated backups: <b>Production required</b></div><div>📝 Audit logging: <b>Prototype framework</b></div><div>📱 iPhone/iPad/Windows: <b>Supported by web app</b></div></div>`;
 el.innerHTML=html;
 if(tab==='ifta')renderIFTAAdmin(); if(tab==='database')renderDatabasePanel();
}
function saveAdminTab(tab){
 adminData();
 if(tab==="company")Object.assign(db.admin.company,{name:val("a_company"),phone:val("a_phone"),email:val("a_email"),timezone:val("a_timezone"),address:val("a_address")});
 if(tab==="rates")Object.assign(db.admin.rates,{laborRate:Number(val("a_laborRate")||0),taxRate:Number(val("a_taxRate")||0),markup:Number(val("a_markup")||0),quoteValidDays:Number(val("a_quoteValidDays")||30)});
 if(tab==="delivery")Object.assign(db.admin.delivery,{defaultDrivers:val("a_drivers"),requireDeliverySignature:val("a_deliverySig")==="1",requireDamagePhoto:val("a_damagePhoto")==="1"});
 logAudit("Updated administration settings");
 save();openAdminTab(tab);
}
function saveProcedures(){
 document.querySelectorAll("[data-proc]").forEach(i=>{db.procedures[i.dataset.proc][Number(i.dataset.index)]=i.value});
 logAudit("Updated shop procedures");save();openAdminTab("procedures");
}
function addProcedure(k){db.procedures[k].push("New procedure step");save();openAdminTab("procedures")}
function logAudit(action,user="Prototype Admin"){db.audit=db.audit||[];db.audit.push({action,user,at:new Date().toLocaleString()});if(db.audit.length>500)db.audit.shift()}
function val(id){return document.getElementById(id)?.value||""}


function downloadTextFile(filename,text,type="text/csv"){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}
function csvEscape(v){v=String(v??"");return `"${v.replace(/"/g,'""')}"`}
function exportCustomersCsv(){
 const rows=[["Name","Contact","Phone","Email","Address","Notes"]];
 (db.customers||[]).forEach(c=>rows.push([c.name,c.contact,c.phone,c.email,c.address,c.notes]));
 downloadTextFile("AC-Electric-Customers.csv",rows.map(r=>r.map(csvEscape).join(",")).join("\n"));
}
function exportInventoryCsv(){
 const rows=[["Part Number","Description","Category","Manufacturer","Quantity","Unit Cost","Location","Reorder Level"]];
 (db.inventory||[]).forEach(i=>rows.push([i.part||i.sku,i.description||i.name,i.category,i.manufacturer,i.qty||i.quantity,i.cost||i.unitCost,i.location,i.reorderLevel]));
 downloadTextFile("AC-Electric-Inventory.csv",rows.map(r=>r.map(csvEscape).join(",")).join("\n"));
}
function importCsv(kind){
 const input=document.createElement("input");input.type="file";input.accept=".csv,text/csv";
 input.onchange=async()=>{
  const f=input.files?.[0];if(!f)return;
  const text=await f.text();const rows=parseCSV(text);
  if(rows.length<2){alert("The CSV needs a header row and at least one data row.");return}
  const headers=rows[0].map(h=>h.trim().toLowerCase());
  if(kind==="customers"){
   db.customers=db.customers||[];
   rows.slice(1).filter(r=>r.some(Boolean)).forEach(r=>{const o=Object.fromEntries(headers.map((h,i)=>[h,r[i]||""]));if(o.name)db.customers.push({id:"C-"+(db.customers.length+1),name:o.name,contact:o.contact||"",phone:o.phone||"",email:o.email||"",address:o.address||"",notes:o.notes||""})});
  }else{
   db.inventory=db.inventory||[];
   rows.slice(1).filter(r=>r.some(Boolean)).forEach(r=>{const o=Object.fromEntries(headers.map((h,i)=>[h,r[i]||""]));if(o["part number"]||o.part||o.sku)db.inventory.push({id:"P-"+(db.inventory.length+1),part:o["part number"]||o.part||o.sku,description:o.description||o.name||"",category:o.category||"",manufacturer:o.manufacturer||"",qty:Number(o.quantity||o.qty||0),cost:Number(o["unit cost"]||o.cost||0),location:o.location||"",reorderLevel:Number(o["reorder level"]||o.reorderlevel||0)})});
  }
  logAudit("Imported "+kind+" CSV");
  save();render();openAdminTab("imports");
  alert("Import complete.");
 };
 input.click();
}
function parseCSV(text){
 const out=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i],nx=text[i+1];
  if(ch==='"'&&quoted&&nx==='"'){cell+='"';i++;continue}
  if(ch==='"'){quoted=!quoted;continue}
  if(ch===','&&!quoted){row.push(cell);cell="";continue}
  if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&nx==="\n")i++;row.push(cell);cell="";if(row.some(x=>x!==""))out.push(row);row=[];continue}
  cell+=ch;
 }
 if(cell||row.length){row.push(cell);if(row.some(x=>x!==""))out.push(row)}
 return out;
}
function exportPrototypeBackup(){
 const copy=JSON.parse(JSON.stringify(db));delete copy.users?.forEach?.(()=>{});
 downloadTextFile("ACE-Shop-Manager-backup.json",JSON.stringify(copy,null,2),"application/json");
 logAudit("Exported prototype backup");
}


function renderNewMotors(){
 const el=document.getElementById("newMotorTable");if(!el)return;
 db.newMotors=db.newMotors||[];
 const q=(document.getElementById("newMotorSearch")?.value||"").toLowerCase();
 const rows=db.newMotors.filter(m=>JSON.stringify(m).toLowerCase().includes(q));
 el.innerHTML=`<div class="row head"><div>Motor</div><div>Nameplate</div><div>Stock</div><div>Location</div><div>Status</div></div>`+
 rows.map(m=>`<div class="row"><div><strong>${esc(m.manufacturer)} ${esc(m.model)}</strong><div class="muted">Stock #: ${esc(m.stockNo||"—")}</div></div><div>${esc(m.hp||"—")} HP · ${esc(m.acdc||"—")} · ${esc(m.phase||"—")} phase · ${esc(m.voltage||"—")} V<div class="muted">${esc(m.rpm||"")} RPM · Frame ${esc(m.frame||"")}</div></div><div><b>${m.qty||0}</b><div class="muted">Reorder ${m.reorderLevel||0}</div></div><div>${esc(m.location||"—")}</div><div>${m.active===false?"Inactive":"Available"}</div></div>`).join("")||empty("No new motors in stock.");
}
function openNewMotorBuilder(existing=null){
 const m=existing||{manufacturer:"",model:"",stockNo:"",serial:"",hp:"",acdc:"AC",phase:"3",voltage:"",amps:"",rpm:"",frame:"",frequency:"60",enclosure:"",qty:1,location:"",cost:0,salePrice:0,reorderLevel:0,notes:""};
 openModal(existing?"Edit New Motor":"Add New Motor",`
  <div class="form-grid">
   ${motorField("Manufacturer","nm_manufacturer",m.manufacturer)}
   ${motorField("Model / Type","nm_model",m.model)}
   ${motorField("Stock / SKU","nm_stockNo",m.stockNo)}
   ${motorField("Serial Number","nm_serial",m.serial)}
   ${motorField("HP / kW","nm_hp",m.hp)}
   ${motorField("AC / DC","nm_acdc",m.acdc)}
   ${motorField("Phase","nm_phase",m.phase)}
   ${motorField("Voltage","nm_voltage",m.voltage)}
   ${motorField("Amps","nm_amps",m.amps)}
   ${motorField("RPM","nm_rpm",m.rpm)}
   ${motorField("Frame","nm_frame",m.frame)}
   ${motorField("Frequency","nm_frequency",m.frequency)}
   ${motorField("Enclosure","nm_enclosure",m.enclosure)}
   ${motorField("Quantity","nm_qty",m.qty,"number")}
   ${motorField("Location","nm_location",m.location)}
   ${motorField("Unit Cost","nm_cost",m.cost,"number")}
   ${motorField("Sale Price","nm_salePrice",m.salePrice,"number")}
   ${motorField("Reorder Level","nm_reorderLevel",m.reorderLevel,"number")}
   ${motorText("Notes","nm_notes",m.notes,2)}
  </div>
  <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveNewMotor('${existing?existing.id:""}')">Save New Motor</button></div>
 `,()=>{});
}
function saveNewMotor(id){
 db.newMotors=db.newMotors||[];let m=id?db.newMotors.find(x=>x.id===id):{id:"NM-"+(db.newMotors.length+1)};
 if(!id)db.newMotors.push(m);
 const fields={manufacturer:"nm_manufacturer",model:"nm_model",stockNo:"nm_stockNo",serial:"nm_serial",hp:"nm_hp",acdc:"nm_acdc",phase:"nm_phase",voltage:"nm_voltage",amps:"nm_amps",rpm:"nm_rpm",frame:"nm_frame",frequency:"nm_frequency",enclosure:"nm_enclosure",qty:"nm_qty",location:"nm_location",cost:"nm_cost",salePrice:"nm_salePrice",reorderLevel:"nm_reorderLevel",notes:"nm_notes"};
 Object.entries(fields).forEach(([k,id2])=>{m[k]=document.getElementById(id2)?.value||""});
 ["qty","cost","salePrice","reorderLevel"].forEach(k=>m[k]=Number(m[k]||0));
 m.active=true;save();closeModal();render();
}
function exportNewMotorsCsv(){
 db.newMotors=db.newMotors||[];
 const rows=[["Stock Number","Manufacturer","Model","Serial","HP","AC/DC","Phase","Voltage","Amps","RPM","Frame","Frequency","Enclosure","Quantity","Location","Unit Cost","Sale Price","Reorder Level","Notes"]];
 db.newMotors.forEach(m=>rows.push([m.stockNo,m.manufacturer,m.model,m.serial,m.hp,m.acdc,m.phase,m.voltage,m.amps,m.rpm,m.frame,m.frequency,m.enclosure,m.qty,m.location,m.cost,m.salePrice,m.reorderLevel,m.notes]));
 downloadTextFile("AC-Electric-New-Motors.csv",rows.map(r=>r.map(csvEscape).join(",")).join("\n"));
}
function importNewMotorsCsv(){
 const input=document.createElement("input");input.type="file";input.accept=".csv,text/csv";input.onchange=async()=>{const f=input.files?.[0];if(!f)return;const rows=parseCSV(await f.text());if(rows.length<2){alert("CSV needs headers and at least one motor.");return}
 const h=rows[0].map(x=>x.trim().toLowerCase());db.newMotors=db.newMotors||[];
 rows.slice(1).forEach(r=>{const o=Object.fromEntries(h.map((x,i)=>[x,r[i]||""]));if(!o["stock number"]&& !o["model"])return;db.newMotors.push({id:"NM-"+(db.newMotors.length+1),stockNo:o["stock number"]||"",manufacturer:o.manufacturer||"",model:o.model||"",serial:o.serial||"",hp:o.hp||"",acdc:o["ac/dc"]||o.acdc||"",phase:o.phase||"",voltage:o.voltage||"",amps:o.amps||"",rpm:o.rpm||"",frame:o.frame||"",frequency:o.frequency||"",enclosure:o.enclosure||"",qty:Number(o.quantity||0),location:o.location||"",cost:Number(o["unit cost"]||0),salePrice:Number(o["sale price"]||0),reorderLevel:Number(o["reorder level"]||0),notes:o.notes||"",active:true})});
 logAudit("Imported new motor inventory");save();render();openAdminTab("imports");alert("New motor inventory imported.");
 };input.click();
}


const IFTA_STATES=["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
function renderMileage(){
 const el=document.getElementById("mileageTable");if(!el)return;
 db.mileage=db.mileage||[];
 el.innerHTML=`<div class="row head"><div>Date</div><div>Driver</div><div>Truck</div><div>Odometer</div><div>Total Miles</div><div>State Miles / Gallons</div></div>`+
 db.mileage.slice().reverse().map(m=>`<div class="row"><div>${esc(m.date)}</div><div>${esc(m.driver)}</div><div>${esc(m.truck)}</div><div>${Number(m.startOdo||0).toLocaleString()} → ${Number(m.endOdo||0).toLocaleString()}</div><div><b>${Number(m.totalMiles||0).toLocaleString()}</b></div><div>${Object.entries(m.states||{}).map(([st,x])=>`${esc(st)}: ${Number(x.miles||0).toLocaleString()} mi / ${Number(x.gallons||0).toFixed(1)} gal`).join("<br>")}</div></div>`).join("")||empty("No mileage entries yet.");
 const sum=document.getElementById("mileageSummary");if(sum){
  const totals={miles:0,gallons:0};db.mileage.forEach(m=>{totals.miles+=Number(m.totalMiles||0);Object.values(m.states||{}).forEach(x=>totals.gallons+=Number(x.gallons||0))});
  sum.innerHTML=`<div class="fleet-cards"><div><b>${totals.miles.toLocaleString()}</b><span>Total miles</span></div><div><b>${totals.gallons.toFixed(1)}</b><span>Total gallons</span></div><div><b>${db.mileage.length}</b><span>Entries</span></div></div>`;
 }
}
function openMileageBuilder(){
 db.mileage=db.mileage||[];
 const m={date:new Date().toISOString().slice(0,10),driver:"",truck:"B1",startOdo:"",endOdo:"",states:{}};
 openModal("IFTA Mileage Entry",`
  <div class="form-grid">
   <div class="field"><label>Driver <span class="req">*</span></label><input id="m_driver"></div>
   <div class="field"><label>Date <span class="req">*</span></label><input id="m_date" type="date" value="${m.date}"></div>
   <div class="field"><label>Truck Number <span class="req">*</span></label><input id="m_truck" placeholder="B1 or 25"></div>
   <div class="field"><label>Starting Odometer <span class="req">*</span></label><input id="m_start" type="number" min="0" step="1"></div>
   <div class="field"><label>Ending Odometer <span class="req">*</span></label><input id="m_end" type="number" min="0" step="1"></div>
   <div class="field"><label>Total Miles</label><input id="m_total" readonly></div>
  </div>
  <div class="state-mileage-box">
   <div class="nameplate-head"><div><b>Miles & Gallons by State</b><div class="muted">Enter only states used during this entry.</div></div><button type="button" class="secondary" onclick="addMileageState()">+ Add State</button></div>
   <div class="state-head"><div>State</div><div>Miles</div><div>Gallons</div><div></div></div>
   <div id="stateRows"></div>
   <div class="state-totals"><b>State Miles: <span id="stateMilesTotal">0</span></b><b>State Gallons: <span id="stateGallonsTotal">0.0</span></b></div>
  </div>
  <div id="mileageValidation" class="notice">Enter the odometer readings and state mileage.</div>
  <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveMileage()">Save Mileage Entry</button></div>
 `,()=>{});
 document.getElementById("m_start").oninput=updateMileageTotals;document.getElementById("m_end").oninput=updateMileageTotals;
 addMileageState("ME");updateMileageTotals();
}
function addMileageState(state=""){
 const box=document.getElementById("stateRows");if(!box)return;
 const r=document.createElement("div");r.className="state-row";
 r.innerHTML=`<select class="state-code">${IFTA_STATES.map(x=>`<option ${x===state?"selected":""}>${x}</option>`).join("")}</select><input class="state-miles" type="number" min="0" step="0.1" value="0"><input class="state-gallons" type="number" min="0" step="0.1" value="0"><button type="button" class="danger-btn" onclick="this.parentElement.remove();updateMileageTotals()">×</button>`;
 box.appendChild(r);r.querySelectorAll("input,select").forEach(x=>x.addEventListener("input",updateMileageTotals));
}
function updateMileageTotals(){
 const start=Number(document.getElementById("m_start")?.value||0),end=Number(document.getElementById("m_end")?.value||0),total=Math.max(0,end-start);
 const t=document.getElementById("m_total");if(t)t.value=total;
 let sm=0,sg=0;document.querySelectorAll(".state-row").forEach(r=>{sm+=Number(r.querySelector(".state-miles")?.value||0);sg+=Number(r.querySelector(".state-gallons")?.value||0)});
 document.getElementById("stateMilesTotal").textContent=sm.toFixed(1);document.getElementById("stateGallonsTotal").textContent=sg.toFixed(1);
 const v=document.getElementById("mileageValidation");
 if(total!==sm)v.innerHTML=`<b>⚠️ State mileage does not match the odometer total.</b> Odometer: ${total.toFixed(1)} miles · State total: ${sm.toFixed(1)} miles.`;
 else v.innerHTML=`<b>✓ Mileage balances.</b> ${total.toFixed(1)} total miles accounted for by state.`;
}
function saveMileage(){
 const driver=document.getElementById("m_driver").value.trim(),date=document.getElementById("m_date").value,truck=document.getElementById("m_truck").value.trim(),start=Number(document.getElementById("m_start").value||0),end=Number(document.getElementById("m_end").value||0),total=end-start; const q0=getQuarterInfo(date),qkey=`${q0.year}-Q${q0.quarter}`; db.iftaFinalized=db.iftaFinalized||{}; if(db.iftaFinalized[qkey]){alert("That IFTA quarter has been finalized and is locked. An authorized supervisor/admin must reopen it before adding or correcting mileage.");return}
 if(!driver||!date||!truck||start<0||end<start){alert("Enter driver, date, truck number and valid odometer readings.");return}
 const states={};document.querySelectorAll(".state-row").forEach(r=>{const st=r.querySelector(".state-code").value,mi=Number(r.querySelector(".state-miles").value||0),ga=Number(r.querySelector(".state-gallons").value||0);if(mi||ga)states[st]=(states[st]||{miles:0,gallons:0}),states[st].miles+=mi,states[st].gallons+=ga});
 const sm=Object.values(states).reduce((a,x)=>a+x.miles,0);
 if(Math.abs(sm-total)>0.01){alert("State mileage must equal total odometer miles before the entry can be saved.");return}
 db.mileage=db.mileage||[];db.mileage.push({id:"M-"+(db.mileage.length+1),driver,date,truck,startOdo:start,endOdo:end,totalMiles:total,states,createdAt:new Date().toISOString()});
 logAudit("Added fleet mileage entry");save();closeModal();render();
}


function getQuarterInfo(dateStr){
 const d=new Date((dateStr||new Date().toISOString().slice(0,10))+"T00:00:00");
 const q=Math.floor(d.getMonth()/3)+1;
 return {year:d.getFullYear(),quarter:q,label:`Q${q} ${d.getFullYear()}`};
}
function renderIFTAAdmin(){
 const el=document.getElementById("iftaAdminLog");if(!el)return;
 db.mileage=db.mileage||[];db.iftaFinalized=db.iftaFinalized||{};
 const now=getQuarterInfo(new Date().toISOString().slice(0,10));
 const selected=window.iftaAdminQuarter||`${now.year}-Q${now.quarter}`;
 const [yr,qq]=selected.split("-Q").map(Number);
 const entries=db.mileage.filter(m=>{const q=getQuarterInfo(m.date);return q.year===yr&&q.quarter===qq});
 const states={};
 entries.forEach(m=>Object.entries(m.states||{}).forEach(([st,x])=>{
   states[st]=states[st]||{miles:0,gallons:0};
   states[st].miles+=Number(x.miles||0);states[st].gallons+=Number(x.gallons||0);
 }));
 const totalMiles=entries.reduce((a,m)=>a+Number(m.totalMiles||0),0);
 const totalGallons=Object.values(states).reduce((a,x)=>a+x.gallons,0);
 const finalized=!!db.iftaFinalized[selected];
 const lockButton=finalized
   ? `<span class="ifta-lock">🔒 Finalized</span><button class="secondary" onclick="reopenIFTAQuarter('${selected}')">Reopen</button>`
   : `<button class="primary" onclick="finalizeIFTAQuarter('${selected}')">🔒 Finalize Quarter</button>`;
 el.innerHTML=`<div class="ifta-admin-hero">
   <div><h3 style="margin:0">🚛 Fleet / IFTA — ${selected}</h3><div class="muted">Running tally from driver mileage entries</div></div>
   <div class="ifta-actions"><select id="iftaQuarterSelect">${[...Array(8)].map((_,i)=>{
     const d=new Date();d.setMonth(d.getMonth()-i*3);const q=getQuarterInfo(d.toISOString().slice(0,10));const v=`${q.year}-Q${q.quarter}`;
     return `<option value="${v}" ${v===selected?"selected":""}>${q.label}</option>`;
   }).join("")}</select>${lockButton}</div>
 </div>
 <div class="fleet-cards"><div><b>${totalMiles.toLocaleString()}</b><span>Total Miles</span></div><div><b>${totalGallons.toFixed(1)}</b><span>Total Gallons</span></div><div><b>${entries.length}</b><span>Mileage Entries</span></div><div><b>${totalGallons?(totalMiles/totalGallons).toFixed(2):"—"}</b><span>Overall MPG</span></div></div>
 <div class="ifta-state-table">
  <div class="row head"><div>State</div><div>Miles</div><div>Gallons</div><div>MPG</div></div>
  ${Object.entries(states).sort((a,b)=>a[0].localeCompare(b[0])).map(([st,x])=>`<div class="row"><div><b>${esc(st)}</b></div><div>${x.miles.toLocaleString()}</div><div>${x.gallons.toFixed(1)}</div><div>${x.gallons?(x.miles/x.gallons).toFixed(2):"—"}</div></div>`).join("")||empty("No mileage recorded for this quarter.")}
  ${Object.keys(states).length?`<div class="row ifta-total"><div><b>TOTAL</b></div><div><b>${totalMiles.toLocaleString()}</b></div><div><b>${totalGallons.toFixed(1)}</b></div><div>${totalGallons?(totalMiles/totalGallons).toFixed(2):"—"}</div></div>`:""}
 </div>
 <div class="ifta-entry-log"><h4>Quarter Entries</h4>${entries.slice().reverse().map(m=>`<div class="ifta-entry"><span>${esc(m.date)} · ${esc(m.driver)} · Truck ${esc(m.truck)}</span><b>${Number(m.totalMiles||0).toLocaleString()} mi</b></div>`).join("")||`<div class="muted">No entries yet.</div>`}</div>
 <div class="notice">${finalized?`<b>🔒 This quarter is finalized.</b> Normal mileage entry should no longer modify it. Finalized: ${esc(db.iftaFinalized[selected].at)} by ${esc(db.iftaFinalized[selected].user)}.`:`<b>Running tally.</b> Review the state totals before finalizing the quarter.`}</div>`;
 document.getElementById("iftaQuarterSelect")?.addEventListener("change",e=>{window.iftaAdminQuarter=e.target.value;renderIFTAAdmin()});
}
function reopenIFTAQuarter(key){
 if(!db.iftaFinalized?.[key])return;
 if(!confirm(`Reopen ${key} for corrections? This should only be done by an authorized supervisor/admin.`))return;
 delete db.iftaFinalized[key];logAudit("Reopened IFTA quarter "+key);save();renderIFTAAdmin();
}
function finalizeIFTAQuarter(key){
 db.iftaFinalized=db.iftaFinalized||{};
 if(db.iftaFinalized[key]){alert("This quarter is already finalized.");return}
 const [yr,qq]=key.split("-Q").map(Number);
 const entries=(db.mileage||[]).filter(m=>{const q=getQuarterInfo(m.date);return q.year===yr&&q.quarter===qq});
 const states={};entries.forEach(m=>Object.entries(m.states||{}).forEach(([st,x])=>{states[st]=states[st]||{miles:0,gallons:0};states[st].miles+=Number(x.miles||0);states[st].gallons+=Number(x.gallons||0)}));
 const totalMiles=entries.reduce((a,m)=>a+Number(m.totalMiles||0),0),totalGallons=Object.values(states).reduce((a,x)=>a+x.gallons,0);
 if(!confirm(`Finalize ${key}?\n\nMiles: ${totalMiles.toLocaleString()}\nGallons: ${totalGallons.toFixed(1)}\n\nThis will mark the quarter as finalized.`))return;
 db.iftaFinalized[key]={year:yr,quarter:Number(qq),totalMiles,totalGallons,states,entryCount:entries.length,at:new Date().toLocaleString(),user:"Prototype Admin"};
 logAudit("Finalized IFTA quarter "+key);
 save();renderIFTAAdmin();
}


const LABOR_STAGES=["Inspection","Disassembly","Cleaning","Repair","Assembly","Testing","Final QC","Other"];
function ensureLaborData(){db.laborSessions=db.laborSessions||[];db.activeTimers=db.activeTimers||{}}
function renderLabor(){
 ensureLaborData();
 const active=document.getElementById("activeTimerPanel"),summary=document.getElementById("laborSummary"),table=document.getElementById("laborTable");if(!active)return;
 const timers=Object.values(db.activeTimers);
 active.innerHTML=timers.length?timers.map(t=>`<div class="timer-card"><div><b>🔴 ${esc(t.technician)}</b><span>Motor/Job ${esc(t.jobId)} · ${esc(t.stage)}</span></div><div class="timer-live" data-start="${t.startedAt}">00:00:00</div><button class="danger-btn" onclick="stopLaborTimer('${t.jobId}','${t.technician.replace(/'/g,"\\'")}')">⏹ Stop Work</button></div>`).join(""):`<div class="notice">No technician timers are currently running.</div>`;
 const totalMin=db.laborSessions.reduce((a,x)=>a+Number(x.minutes||0),0);
 const byTech={};db.laborSessions.forEach(x=>byTech[x.technician]=(byTech[x.technician]||0)+Number(x.minutes||0));
 summary.innerHTML=`<div class="fleet-cards"><div><b>${(totalMin/60).toFixed(2)}</b><span>Total Labor Hours</span></div><div><b>${Object.keys(byTech).length}</b><span>Technicians</span></div><div><b>${db.laborSessions.length}</b><span>Work Sessions</span></div></div>`;
 table.innerHTML=`<div class="row head"><div>Date</div><div>Technician</div><div>Job / Motor</div><div>Procedure</div><div>Time</div></div>`+
 db.laborSessions.slice().reverse().map(x=>`<div class="row"><div>${esc(x.date)}</div><div>${esc(x.technician)}</div><div>${esc(x.jobId)}</div><div>${esc(x.stage)}</div><div><b>${formatMinutes(x.minutes)}</b></div></div>`).join("")||empty("No completed labor sessions yet.");
 updateLiveTimers();setTimeout(()=>{if(document.getElementById("labor"))updateLiveTimers()},1000);
}
function formatMinutes(m){m=Number(m||0);return `${Math.floor(m/60)}h ${String(Math.round(m%60)).padStart(2,"0")}m`}
function updateLiveTimers(){document.querySelectorAll(".timer-live").forEach(el=>{const ms=Date.now()-new Date(el.dataset.start).getTime();const sec=Math.max(0,Math.floor(ms/1000));el.textContent=`${String(Math.floor(sec/3600)).padStart(2,"0")}:${String(Math.floor(sec%3600/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`})}
function startLaborTimer(jobId,technician,stage){
 ensureLaborData();
 const existing=db.activeTimers[jobId];
 if(existing){alert(`This motor already has ${existing.technician}'s timer running.`);return}
 const other=Object.values(db.activeTimers).find(t=>t.technician===technician);
 if(other){if(!confirm(`${technician} is currently working on ${other.jobId}. Stop that timer and start this motor?`))return;stopLaborTimer(other.jobId,technician,true)}
 db.activeTimers[jobId]={jobId,technician,stage,startedAt:new Date().toISOString()};
 logAudit(`Started labor timer for ${jobId}`);save();renderLabor();
}
function stopLaborTimer(jobId,technician,silent=false){
 ensureLaborData();const t=db.activeTimers[jobId];if(!t)return;
 const end=new Date(),minutes=(end-new Date(t.startedAt))/60000;
 db.laborSessions.push({id:"L-"+(db.laborSessions.length+1),jobId,technician:t.technician,stage:t.stage,start:t.startedAt,end:end.toISOString(),minutes,date:end.toISOString().slice(0,10)});
 delete db.activeTimers[jobId];logAudit(`Stopped labor timer for ${jobId}`);save();if(!silent)renderLabor();
}
function openLaborTimer(jobId){
 ensureLaborData();const existing=db.activeTimers[jobId];if(existing){stopLaborTimer(jobId,existing.technician);return}
 const tech=prompt("Technician name:");if(!tech)return;
 const stage=prompt("Procedure / work stage (Inspection, Disassembly, Cleaning, Repair, Assembly, Testing, Final QC, Other):","Repair")||"Other";
 startLaborTimer(jobId,tech,stage);
}
function jobLaborSummary(jobId){
 ensureLaborData();const rows=db.laborSessions.filter(x=>x.jobId===jobId),active=db.activeTimers[jobId];
 const mins=rows.reduce((a,x)=>a+Number(x.minutes||0),0)+(active?(Date.now()-new Date(active.startedAt))/60000:0);
 return {minutes:mins,sessions:rows};
}


function ensureSalesData(){
 db.sales=db.sales||[];
 db.invoices=db.invoices||[];
 db.payments=db.payments||[];
}
function money(n){return Number(n||0).toLocaleString(undefined,{style:"currency",currency:"USD"})}
function nextNumber(prefix,list){return `${prefix}-${new Date().getFullYear()}-${String((list?.length||0)+1).padStart(5,"0")}`}
function renderSales(){
 ensureSalesData();
 const summary=document.getElementById("salesSummary"),table=document.getElementById("salesTable");if(!summary)return;
 const salesTotal=db.sales.reduce((a,x)=>a+Number(x.total||0),0);
 const invoiceTotal=db.invoices.reduce((a,x)=>a+Number(x.total||0),0);
 const paid=db.invoices.reduce((a,x)=>a+Number(x.paid||0),0);
 const outstanding=invoiceTotal-paid;
 summary.innerHTML=`<div class="fleet-cards"><div><b>${money(salesTotal)}</b><span>POS Sales</span></div><div><b>${money(invoiceTotal)}</b><span>Invoices</span></div><div><b>${money(paid)}</b><span>Payments</span></div><div><b>${money(outstanding)}</b><span>Outstanding</span></div></div>`;
 const rows=[
  ...db.sales.map(x=>({kind:"POS Sale",number:x.number,date:x.date,customer:x.customer,total:x.total,status:"Paid",method:x.paymentMethod||"—"})),
  ...db.invoices.map(x=>({kind:"Invoice",number:x.number,date:x.date,customer:x.customer,total:x.total,status:Number(x.paid||0)>=Number(x.total||0)?"Paid":Number(x.paid||0)>0?"Partial":"Open",method:x.paymentMethod||"—"}))
 ].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 table.innerHTML=`<div class="row head"><div>Type / Number</div><div>Date</div><div>Customer</div><div>Total</div><div>Status</div><div>Payment</div></div>`+
 rows.map(x=>`<div class="row"><div><b>${esc(x.kind)}</b><div class="muted">${esc(x.number)}</div></div><div>${esc(x.date)}</div><div>${esc(x.customer||"Walk-in")}</div><div><b>${money(x.total)}</b></div><div>${esc(x.status)}</div><div>${esc(x.method)}</div></div>`).join("")||empty("No sales or invoices yet.");
}
function customerOptions(){
 ensureSalesData();const cs=db.customers||[];
 return `<option value="">Select customer...</option>`+cs.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
}
function openSaleBuilder(){
 ensureSalesData();
 openModal("New POS Sale",`
  <div class="form-grid">
   <div class="field"><label>Customer</label><select id="sale_customer">${customerOptions()}</select></div>
   <div class="field"><label>Sale Date</label><input id="sale_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   <div class="field"><label>Item / Description</label><input id="sale_desc" placeholder="New motor, bearing, repair, etc."></div>
   <div class="field"><label>Quantity</label><input id="sale_qty" type="number" min="1" value="1"></div>
   <div class="field"><label>Unit Price</label><input id="sale_price" type="number" min="0" step="0.01" value="0"></div>
   <div class="field"><label>Tax %</label><input id="sale_tax" type="number" min="0" step="0.01" value="${db.admin?.rates?.taxRate||0}"></div>
   <div class="field"><label>Payment Method</label><select id="sale_method"><option>Card</option><option>Cash</option><option>Check</option><option>Other</option></select></div>
  </div>
  <div id="sale_total_preview" class="notice">Total: $0.00</div>
  <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveSale()">Complete Sale</button></div>
 `,()=>{});
 ["sale_qty","sale_price","sale_tax"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateSaleTotal));
 updateSaleTotal();
}
function updateSaleTotal(){
 const q=Number(document.getElementById("sale_qty")?.value||0),p=Number(document.getElementById("sale_price")?.value||0),t=Number(document.getElementById("sale_tax")?.value||0);
 const subtotal=q*p,total=subtotal+(subtotal*t/100);
 const el=document.getElementById("sale_total_preview");if(el)el.innerHTML=`Subtotal: ${money(subtotal)} · Tax: ${money(subtotal*t/100)} · <b>Total: ${money(total)}</b>`;
}
function saveSale(){
 const customer=document.getElementById("sale_customer").value,desc=document.getElementById("sale_desc").value.trim(),date=document.getElementById("sale_date").value,qty=Number(document.getElementById("sale_qty").value||0),price=Number(document.getElementById("sale_price").value||0),tax=Number(document.getElementById("sale_tax").value||0),method=document.getElementById("sale_method").value;
 if(!desc||qty<=0||price<0){alert("Enter an item/description, quantity and valid price.");return}
 const subtotal=qty*price,total=subtotal+(subtotal*tax/100);
 db.sales.push({id:"S-"+(db.sales.length+1),number:nextNumber("POS",db.sales),customer,date,items:[{description:desc,qty,unitPrice:price}],subtotal,tax,total,paid:total,paymentMethod:method,createdAt:new Date().toISOString()});
 logAudit("Completed POS sale");save();closeModal();render();
}
function openInvoiceBuilder(){
 ensureSalesData();
 openModal("New Invoice",`
  <div class="form-grid">
   <div class="field"><label>Customer <span class="req">*</span></label><select id="inv_customer">${customerOptions()}</select></div>
   <div class="field"><label>Invoice Date</label><input id="inv_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
   <div class="field"><label>Due Date</label><input id="inv_due" type="date"></div>
   <div class="field"><label>Job / Motor # <span class="req">*</span></label>
    <select id="inv_job_select" onchange="invoiceJobChanged()">
      <option value="">Select current job...</option>
      ${(db.jobs||[]).filter(j=>j.stage!=="Completed").map(j=>`<option value="${esc(j.id)}">${esc(j.id)} — ${esc(j.customer||"No customer")} — ${esc(j.type||"Motor/Job")} ${j.stage?`(${esc(j.stage)})`:""}</option>`).join("")}
      <option value="__NEW__">＋ Add New Job Number</option>
    </select>
    <div id="newJobNumberBox" style="display:none;margin-top:7px"><input id="inv_new_job" placeholder="Example: J-1045"></div>
   </div>
   <div class="field"><label>Description</label><input id="inv_desc" placeholder="Motor repair, parts, service, etc."></div>
   <div class="field"><label>Quantity</label><input id="inv_qty" type="number" min="1" value="1"></div>
   <div class="field"><label>Unit Price</label><input id="inv_price" type="number" min="0" step="0.01" value="0"></div>
   <div class="field"><label>Tax %</label><input id="inv_tax" type="number" min="0" step="0.01" value="${db.admin?.rates?.taxRate||0}"></div>
  </div>
  <div id="invoice_total_preview" class="notice">Total: $0.00</div>
  <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveInvoice()">Create Invoice</button></div>
 `,()=>{});
 ["inv_qty","inv_price","inv_tax"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateInvoiceTotal));
 updateInvoiceTotal();
}
function updateInvoiceTotal(){
 const q=Number(document.getElementById("inv_qty")?.value||0),p=Number(document.getElementById("inv_price")?.value||0),t=Number(document.getElementById("inv_tax")?.value||0);
 const subtotal=q*p,total=subtotal+(subtotal*t/100),el=document.getElementById("invoice_total_preview");
 if(el)el.innerHTML=`Subtotal: ${money(subtotal)} · Tax: ${money(subtotal*t/100)} · <b>Total: ${money(total)}</b>`;
}
function invoiceJobChanged(){
 const sel=document.getElementById("inv_job_select"),box=document.getElementById("newJobNumberBox");
 if(!sel)return;
 if(box)box.style.display=sel.value==="__NEW__"?"block":"none";
}
function getInvoiceJobNumber(){
 const sel=document.getElementById("inv_job_select");if(!sel)return "";
 if(sel.value!=="__NEW__")return sel.value;
 return (document.getElementById("inv_new_job")?.value||"").trim();
}
function addNewJobForInvoice(jobId,customer){
 db.jobs=db.jobs||[];
 if(db.jobs.some(j=>String(j.id).toLowerCase()===String(jobId).toLowerCase()))return false;
 db.jobs.push({id:jobId,customer:customer||"",type:"",hp:"",voltage:"",serial:"",stage:"Jobbed In",priority:"Normal",notes:"",createdAt:new Date().toISOString()});
 return true;
}
async function saveInvoice(){
 const customer=document.getElementById("inv_customer").value,date=document.getElementById("inv_date").value,due=document.getElementById("inv_due").value,job=getInvoiceJobNumber(),desc=document.getElementById("inv_desc").value.trim(),qty=Number(document.getElementById("inv_qty").value||0),price=Number(document.getElementById("inv_price").value||0),tax=Number(document.getElementById("inv_tax").value||0);
 if(!customer||!job||!desc||qty<=0||price<0){alert("Select a customer, select an existing job or add a new job number, and enter a description and valid price.");return}
 if(document.getElementById("inv_job_select").value==="__NEW__" && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,30}$/.test(job)){alert("Enter a valid new job number (letters, numbers, hyphen, dot or underscore).");return}
 const subtotal=qty*price,total=subtotal+(subtotal*tax/100),session=await getCurrentSupabaseSession();
 try{
   if(session){
     const customerId=await dbCustomerIdByName(customer); if(!customerId)throw new Error("Could not find the selected customer.");
     let jobRow=await supabaseClient.from("jobs").select("id,job_number,customers(company_name)").eq("job_number",job).maybeSingle();
     if(jobRow.error)throw jobRow.error;
     if(!jobRow.data && document.getElementById("inv_job_select").value==="__NEW__"){
       const {data:j,error:je}=await supabaseClient.from("jobs").insert({
         job_number:job,customer_id:customerId,equipment_type:"",job_type:"Repair",description:desc,status:"Jobbed In",priority:"Normal",notes:"Created from invoice"
       }).select("id,job_number,status,priority,notes,customers(company_name)").single();
       if(je)throw je;
       jobRow={data:j};
       db.jobs.push({id:j.job_number,customer:j.customers?.company_name||customer,type:"",hp:"",voltage:"",serial:"",
         stage:j.status,priority:j.priority,notes:j.notes});
     }
     if(!jobRow.data)throw new Error("The selected job number was not found.");
     const invoiceNumber=await nextRemoteNumber("invoices","invoice_number","INV",1001);
     const dueDate=due||new Date(new Date(date+"T00:00:00").getTime()+30*86400000).toISOString().slice(0,10);
     const {data:inv,error}=await supabaseClient.from("invoices").insert({
       invoice_number:invoiceNumber,customer_id:customerId,job_id:jobRow.data.id,invoice_date:date,due_date:dueDate,
       status:"Open",subtotal,tax,total,balance_due:total
     }).select("id,invoice_number,total,balance_due,status,invoice_date,due_date,job_id,customers(company_name)").single();
     if(error)throw error;
     db.invoices.push({id:inv.id,number:inv.invoice_number,customer:inv.customers?.company_name||customer,
       date:inv.invoice_date,dueDate:inv.due_date,jobId:job,jobNumber:job,items:[{description:desc,qty,unitPrice:price}],
       subtotal,tax,total:Number(inv.total||total),paid:0,balance:Number(inv.balance_due||total),status:inv.status,createdAt:new Date().toISOString()});
     logAudit(`Created invoice ${invoiceNumber} in database`);
   }else{
     if(document.getElementById("inv_job_select").value==="__NEW__" && !addNewJobForInvoice(job,customer)){alert("That job number already exists. Please select it from the list.");return}
     db.invoices.push({id:"I-"+(db.invoices.length+1),number:nextNumber("INV",db.invoices),customer,date,
       dueDate:due||new Date(new Date(date+"T00:00:00").getTime()+30*86400000).toISOString().slice(0,10),
       jobId:job,jobNumber:job,items:[{description:desc,qty,unitPrice:price}],subtotal,tax,total,paid:0,status:"Open",createdAt:new Date().toISOString()});
   }
   save();closeModal();render();
 }catch(e){alert("Invoice was not saved to the database: "+(e.message||e))}
}


function ensureBillingData(){db.invoices=db.invoices||[];db.billingSettings=db.billingSettings||{termsDays:30}}
function invoiceDueDate(inv){
 const d=inv.dueDate?new Date(inv.dueDate+"T23:59:59"):new Date(new Date(inv.date+"T00:00:00").getTime()+30*86400000);
 return d;
}
function invoiceBalance(inv){return Math.max(0,Number(inv.total||0)-Number(inv.paid||0))}
function invoiceStatus(inv){
 const bal=invoiceBalance(inv);if(bal<=0.009)return "Paid";
 const due=invoiceDueDate(inv),now=new Date();
 if(now>due)return "Overdue";
 return "Open";
}
function daysPastDue(inv){
 const bal=invoiceBalance(inv);if(bal<=0.009)return 0;
 return Math.max(0,Math.floor((new Date()-invoiceDueDate(inv))/86400000));
}
function renderBilling(){
 ensureBillingData();
 const sum=document.getElementById("billingSummary"),alerts=document.getElementById("billingAlerts"),table=document.getElementById("billingTable");if(!sum)return;
 const open=db.invoices.filter(i=>invoiceBalance(i)>0.009),overdue=open.filter(i=>invoiceStatus(i)==="Overdue");
 const openBal=open.reduce((a,i)=>a+invoiceBalance(i),0),overdueBal=overdue.reduce((a,i)=>a+invoiceBalance(i),0);
 sum.innerHTML=`<div class="fleet-cards"><div><b>${money(openBal)}</b><span>Outstanding A/R</span></div><div><b>${money(overdueBal)}</b><span>Overdue</span></div><div><b>${open.length}</b><span>Open Invoices</span></div><div><b>${overdue.length}</b><span>Over 30 Days</span></div></div>`;
 alerts.innerHTML=overdue.length?`<div class="billing-alert">⚠️ <b>${overdue.length} invoice${overdue.length===1?" is":"s are"} over the 30-day Net 30 mark</b> totaling ${money(overdueBal)}.</div>`:`<div class="notice">✓ No outstanding invoices are currently over the Net 30 mark.</div>`;
 const rows=db.invoices.slice().sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||""))).map(i=>{
   const bal=invoiceBalance(i),st=invoiceStatus(i),past=daysPastDue(i);
   return `<div class="row ${st==="Overdue"?"billing-overdue":""}"><div><b>${esc(i.number)}</b><div class="muted">${esc(i.jobNumber||i.jobId||"")}</div></div><div>${esc(i.customer||"")}</div><div>${esc(i.date||"")}</div><div>${esc(invoiceDueDate(i).toLocaleDateString())}</div><div>${money(i.total)}</div><div>${money(i.paid)}</div><div><b>${money(bal)}</b></div><div>${st}${past?` · ${past}d late`:""}</div><div><button class="secondary small-btn" onclick="recordInvoicePayment('${i.id}')">Payment</button></div></div>`;
 }).join("");
 table.innerHTML=`<div class="row head billing-grid"><div>Invoice</div><div>Customer</div><div>Invoice Date</div><div>Due</div><div>Total</div><div>Paid</div><div>Balance</div><div>Status</div><div></div></div>${rows||empty("No invoices yet.")}`;
}
async function recordInvoicePayment(id){
 ensureBillingData();const inv=db.invoices.find(x=>x.id===id);if(!inv)return;
 const bal=invoiceBalance(inv);if(bal<=0.009){alert("This invoice is already paid.");return}
 const raw=prompt(`Invoice ${inv.number}
Outstanding balance: ${money(bal)}

Enter payment amount:`,bal.toFixed(2));if(raw===null)return;
 const amt=Number(raw);if(!Number.isFinite(amt)||amt<=0||amt>bal){alert("Enter a payment amount greater than zero and no more than the outstanding balance.");return}
 const session=await getCurrentSupabaseSession();
 try{
   if(session){
     const {data:remote,error:fe}=await supabaseClient.from("invoices").select("id,total,balance_due").eq("invoice_number",inv.number).maybeSingle();
     if(fe)throw fe;
     if(!remote)throw new Error("Invoice was not found in the database.");
     const newBalance=Math.max(0,Number(remote.balance_due||0)-amt),newStatus=newBalance<=0.009?"Paid":"Open";
     const {error:ue}=await supabaseClient.from("invoices").update({balance_due:newBalance,status:newStatus}).eq("id",remote.id);
     if(ue)throw ue;
     const {data:pay,error:pe}=await supabaseClient.from("payments").insert({
       invoice_id:remote.id,payment_date:new Date().toISOString().slice(0,10),amount:amt,payment_method:"Manual"
     }).select("id").single();
     if(pe)throw pe;
     inv.paid=Number(inv.paid||0)+amt;inv.balance=newBalance;inv.lastPaymentDate=new Date().toISOString().slice(0,10);inv.status=newStatus;
     db.payments=db.payments||[];db.payments.push({id:pay.id,invoiceId:inv.id,invoiceNumber:inv.number,customer:inv.customer,amount:amt,date:inv.lastPaymentDate});
   }else{
     inv.paid=Number(inv.paid||0)+amt;inv.lastPaymentDate=new Date().toISOString().slice(0,10);inv.status=invoiceStatus(inv);
     db.payments=db.payments||[];db.payments.push({id:"PAY-"+(db.payments.length+1),invoiceId:id,invoiceNumber:inv.number,customer:inv.customer,amount:amt,date:inv.lastPaymentDate});
   }
   logAudit(`Recorded payment on ${inv.number}`);save();render();
 }catch(e){alert("Payment was not saved to the database: "+(e.message||e))}
}


const DEFAULT_TIME_CODES=[
 {code:"TRAVEL",name:"Travel",billable:false,department:"All"},
 {code:"SHOP",name:"Shop",billable:true,department:"All"},
 {code:"FIELD-TEST",name:"Field Testing",billable:true,department:"Engineering"},
 {code:"TRANSFORMER",name:"Transformer Testing / Service",billable:true,department:"Engineering"},
 {code:"SWITCHGEAR",name:"Switchgear Testing / Service",billable:true,department:"Engineering"},
 {code:"DRIVES",name:"Drive Testing / Service",billable:true,department:"Engineering"},
 {code:"RECLOSER",name:"Recloser Testing / Service",billable:true,department:"Engineering"},
 {code:"BREAKER-CERT",name:"Breaker Certification",billable:true,department:"Engineering"},
 {code:"BREAKER-CLEAN",name:"Breaker Cleaning / Rebuild",billable:true,department:"Engineering"},
 {code:"INSTALL",name:"Field Installation",billable:true,department:"Engineering"},
 {code:"COMMISSION",name:"Commissioning / Startup",billable:true,department:"Engineering"},
 {code:"FIELD-REPAIR",name:"Field Repair",billable:true,department:"Engineering"},
 {code:"FIELD-REPORT",name:"Engineering Field Report",billable:true,department:"Engineering"},
 {code:"JOB-MISC",name:"Job Misc",billable:true,department:"All"},
 {code:"CLEAN",name:"Cleaning",billable:true},
 {code:"TEARDOWN",name:"Tear Down",billable:true},
 {code:"BUILD",name:"Build / Assembly",billable:true},
 {code:"INSPECT",name:"Inspection",billable:true},
 {code:"REPAIR",name:"Repair",billable:true},
 {code:"TEST",name:"Testing",billable:true},
 {code:"QC",name:"Final QC",billable:true},
 {code:"PARTS",name:"Parts / Material",billable:true},
 {code:"ADMIN",name:"Administrative",billable:false},
 {code:"TRAIN",name:"Training",billable:false},
 {code:"OTHER",name:"Other",billable:false}
];
function ensureAccountingData(){
 db.journalEntries=db.journalEntries||[];
 db.timeSlips=db.timeSlips||[];
 db.timeCodes=db.timeCodes||DEFAULT_TIME_CODES;
 db.chartOfAccounts=db.chartOfAccounts||[
  {code:"1000",name:"Cash",type:"Asset"},{code:"1100",name:"Accounts Receivable",type:"Asset"},
  {code:"1200",name:"Inventory",type:"Asset"},{code:"2000",name:"Accounts Payable",type:"Liability"},
  {code:"3000",name:"Owner's Equity",type:"Equity"},{code:"4000",name:"Sales Revenue",type:"Income"},
  {code:"5000",name:"Cost of Goods Sold",type:"Expense"},{code:"6000",name:"Labor Expense",type:"Expense"},
  {code:"7000",name:"Operating Expense",type:"Expense"}
 ];
}
function renderTimeSlips(){
 ensureAccountingData();const sum=document.getElementById("timeSlipSummary"),table=document.getElementById("timeSlipTable");if(!sum)return;
 const mins=db.timeSlips.reduce((a,x)=>a+Number(x.minutes||0),0),bill=db.timeSlips.filter(x=>x.billable).reduce((a,x)=>a+Number(x.minutes||0),0);
 sum.innerHTML=`<div class="fleet-cards"><div><b>${(mins/60).toFixed(2)}</b><span>Total Hours</span></div><div><b>${(bill/60).toFixed(2)}</b><span>Billable Hours</span></div><div><b>${db.timeSlips.length}</b><span>Time Slips</span></div></div>`;
 table.innerHTML=`<div class="row head timeslip-grid"><div>Date</div><div>Employee</div><div>Department</div><div>Code</div><div>Equipment</div><div>Job / Motor</div><div>Hours</div><div>Billable</div><div>Notes</div></div>`+
 db.timeSlips.slice().reverse().map(x=>`<div class="row timeslip-grid"><div>${esc(x.date)}</div><div>${esc(x.employee)}</div><div>${esc(x.department||"")}</div><div><b>${esc(x.code)}</b><div class="muted">${esc(x.codeName)}</div></div><div>${esc(x.equipment||"")}</div><div>${esc(x.jobId||"—")}</div><div>${(Number(x.minutes||0)/60).toFixed(2)}</div><div>${x.billable?"Yes":"No"}</div><div>${esc(x.notes||"")}</div></div>`).join("")||empty("No time slips yet.");
}
function openTimeSlip(){
 ensureAccountingData();
 openModal("New Time Slip",`
 <div class="form-grid">
  <div class="field"><label>Employee <span class="req">*</span></label><input id="ts_employee"></div>
  <div class="field"><label>Date <span class="req">*</span></label><input id="ts_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  <div class="field"><label>Department</label><select id="ts_department"><option>Engineering</option><option>Motor Repair</option><option>Breaker Shop</option><option>Machine Shop</option><option>Drivers</option><option>Office</option><option>Other</option></select></div>
  <div class="field"><label>Time / Service Code <span class="req">*</span></label><select id="ts_code">${db.timeCodes.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(x.name)}${x.billable?" (Billable)":""}${x.department&&x.department!=="All"?` [${esc(x.department)}]`:""}</option>`).join("")}</select></div>
  <div class="field"><label>Equipment / Service Category</label><select id="ts_equipment"><option>General Field Service</option><option>Transformer</option><option>Switchgear</option><option>Drives</option><option>Recloser</option><option>Breaker</option><option>Other</option></select></div>
  <div class="field"><label>Hours <span class="req">*</span></label><input id="ts_hours" type="number" min="0" step="0.01"></div>
  <div class="field"><label>Job / Motor #</label><select id="ts_job"><option value="">Not job-specific</option>${(db.jobs||[]).map(j=>`<option value="${esc(j.id)}">${esc(j.id)} — ${esc(j.customer||"")}</option>`).join("")}</select></div>
  <div class="field"><label>Notes</label><input id="ts_notes" placeholder="Optional"></div>
 </div>
 <div class="notice">Codes can be used consistently by technicians, drivers, engineering, machine shop, breaker shop and office staff.</div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveTimeSlip()">Save Time Slip</button></div>`,()=>{});
}
function saveTimeSlip(){
 ensureAccountingData();
 const employee=document.getElementById("ts_employee").value.trim(),date=document.getElementById("ts_date").value,department=document.getElementById("ts_department").value,code=document.getElementById("ts_code").value,equipment=document.getElementById("ts_equipment").value,hours=Number(document.getElementById("ts_hours").value||0),jobId=document.getElementById("ts_job").value,notes=document.getElementById("ts_notes").value.trim(),tc=db.timeCodes.find(x=>x.code===code);
 if(!employee||!date||hours<=0||!tc){alert("Enter employee, date, time code and a valid number of hours.");return}
 db.timeSlips.push({id:"TS-"+(db.timeSlips.length+1),employee,date,department,code,codeName:tc.name,equipment,billable:!!tc.billable,minutes:hours*60,jobId,notes,createdAt:new Date().toISOString()});
 logAudit("Added time slip");save();closeModal();render();
}
function renderAccounting(){
 ensureAccountingData();const sum=document.getElementById("accountingSummary"),table=document.getElementById("accountingTable");if(!sum)return;
 const debit=db.journalEntries.reduce((a,x)=>a+Number(x.debit||0),0),credit=db.journalEntries.reduce((a,x)=>a+Number(x.credit||0),0);
 sum.innerHTML=`<div class="fleet-cards"><div><b>${money(debit)}</b><span>Total Debits</span></div><div><b>${money(credit)}</b><span>Total Credits</span></div><div><b>${db.journalEntries.length}</b><span>Journal Entries</span></div></div>
 <div class="notice">Accounting records are designed around standard double-entry structure. Use the export tools to move data into the company's accounting platform during the prototype phase.</div>`;
 table.innerHTML=`<div class="row head journal-grid"><div>Date</div><div>Account</div><div>Description</div><div>Debit</div><div>Credit</div></div>`+
 db.journalEntries.slice().reverse().map(x=>`<div class="row journal-grid"><div>${esc(x.date)}</div><div>${esc(x.accountCode)} — ${esc(x.accountName)}</div><div>${esc(x.description||"")}</div><div>${x.debit?money(x.debit):"—"}</div><div>${x.credit?money(x.credit):"—"}</div></div>`).join("")||empty("No journal entries yet.");
}
function openJournalEntry(){
 ensureAccountingData();
 openModal("New Journal Entry",`
 <div class="form-grid">
  <div class="field"><label>Date</label><input id="je_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  <div class="field"><label>Account</label><select id="je_account">${db.chartOfAccounts.map(a=>`<option value="${esc(a.code)}">${esc(a.code)} — ${esc(a.name)} (${esc(a.type)})</option>`).join("")}</select></div>
  <div class="field"><label>Description</label><input id="je_desc"></div>
  <div class="field"><label>Debit</label><input id="je_debit" type="number" min="0" step="0.01"></div>
  <div class="field"><label>Credit</label><input id="je_credit" type="number" min="0" step="0.01"></div>
 </div>
 <div class="notice">Prototype journal entry screen. Production accounting will require balanced multi-line journal transactions and locked audit history.</div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveJournalEntry()">Save</button></div>`,()=>{});
}
function saveJournalEntry(){
 ensureAccountingData();const date=document.getElementById("je_date").value,code=document.getElementById("je_account").value,desc=document.getElementById("je_desc").value.trim(),debit=Number(document.getElementById("je_debit").value||0),credit=Number(document.getElementById("je_credit").value||0),acct=db.chartOfAccounts.find(a=>a.code===code);
 if(!date||!acct||debit<0||credit<0||((debit>0)&&(credit>0))||debit===credit){alert("Enter a date and either a debit OR a credit amount.");return}
 db.journalEntries.push({id:"JE-"+(db.journalEntries.length+1),date,accountCode:acct.code,accountName:acct.name,description,debit,credit,createdAt:new Date().toISOString()});
 logAudit("Added journal entry");save();closeModal();render();
}
function exportAccountingData(){
 ensureAccountingData();
 const bundle={
  generatedAt:new Date().toISOString(),
  format:"ACE Shop Manager Accounting Export v1",
  customers:db.customers||[],
  invoices:db.invoices||[],
  payments:db.payments||[],
  sales:db.sales||[],
  journalEntries:db.journalEntries||[],
  timeSlips:db.timeSlips||[],
  chartOfAccounts:db.chartOfAccounts||[],
  inventory:db.inventory||[],
  newMotors:db.newMotors||[]
 };
 const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ace-electric-accounting-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
 alert("Accounting data exported. The production version can add dedicated import/export mappings for specific accounting platforms.");
}


function ensureEmployeeData(){
 db.employees=db.employees||[];
 db.employeeReports=db.employeeReports||{};
 db.employees.forEach(e=>{e.active=e.active!==false});
}
function employeeMinutes(emp){
 ensureEmployeeData();
 let mins=(db.timeSlips||[]).filter(x=>x.employee===emp).reduce((a,x)=>a+Number(x.minutes||0),0);
 mins+=(db.laborSessions||[]).filter(x=>x.technician===emp).reduce((a,x)=>a+Number(x.minutes||0),0);
 return mins;
}
function employeeJobs(emp){
 const ids=new Set();
 (db.laborSessions||[]).filter(x=>x.technician===emp).forEach(x=>ids.add(x.jobId));
 (db.timeSlips||[]).filter(x=>x.employee===emp&&x.jobId).forEach(x=>ids.add(x.jobId));
 return [...ids];
}
function engineeringProductivity(){
 ensureAccountingData();
 const rows=(db.timeSlips||[]).filter(x=>x.department==="Engineering");
 const buckets={};
 rows.forEach(x=>{const k=x.equipment||x.codeName||"Other";buckets[k]=(buckets[k]||0)+Number(x.minutes||0)});
 return buckets;
}
function employeeProductivity(emp){
 ensureEmployeeData();
 const buckets={};
 (db.timeSlips||[]).filter(x=>x.employee===emp).forEach(x=>{
   const key=x.codeName||x.code||"Other"; buckets[key]=(buckets[key]||0)+Number(x.minutes||0);
 });
 (db.laborSessions||[]).filter(x=>x.technician===emp).forEach(x=>{
   const key=x.stage||"Job Time"; buckets[key]=(buckets[key]||0)+Number(x.minutes||0);
 });
 return buckets;
}
function renderEmployeeProductivity(emp){
 const buckets=employeeProductivity(emp),total=Object.values(buckets).reduce((a,b)=>a+b,0);
 return `<div class="productivity-box"><div class="productivity-title"><b>Productivity Breakdown</b><span class="muted">${(total/60).toFixed(2)} total tracked hours</span></div>
 <div class="productivity-grid">${Object.entries(buckets).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="productivity-row"><div><b>${esc(k)}</b></div><div class="productivity-bar"><span style="width:${total?Math.min(100,(v/total)*100):0}%"></span></div><div>${(v/60).toFixed(2)} hrs</div><div>${total?(v/total*100).toFixed(1):0}%</div></div>`).join("")||empty("No time has been recorded yet.")}</div></div>`;
}
function renderEmployeeAdmin(){
 ensureEmployeeData();
 const el=document.getElementById("employeeAdminPanel");if(!el)return;
 const employees=db.employees;
 el.innerHTML=`<div class="employee-admin-head">
   <div><b>Employee Tracking & Productivity</b><div class="muted">Time, jobs, labor codes and productivity by employee</div></div>
   <button class="primary" onclick="openEmployeeBuilder()">+ Add Employee</button>
 </div>
 <div class="employee-cards">
 ${employees.map(e=>{const mins=employeeMinutes(e.name),jobs=employeeJobs(e.name);return `<div class="employee-card ${e.active?"":"inactive"}">
   <div><b>${esc(e.name)}</b><span>${esc(e.department||"")}${e.role?` · ${esc(e.role)}`:""}</span></div>
   <div class="employee-stat"><b>${(mins/60).toFixed(2)}</b><span>Total Hours</span></div>
   <div class="employee-stat"><b>${jobs.length}</b><span>Jobs Worked</span></div>
   <button class="secondary" onclick="openEmployeeReport('${e.id}')">View Activity & Productivity</button>
 </div>`}).join("")||empty("No employees have been added yet.")}</div>
 <div id="employeeReportPanel"></div>`;
}
function openEmployeeBuilder(){
 ensureEmployeeData();
 openModal("Add Employee",`
 <div class="form-grid">
  <div class="field"><label>Employee Name <span class="req">*</span></label><input id="emp_name"></div>
  <div class="field"><label>Department</label><select id="emp_dept"><option>Motor Repair</option><option>Breaker Shop</option><option>Machine Shop</option><option>Engineering</option><option>Drivers</option><option>Office</option><option>Management</option><option>Other</option></select></div>
  <div class="field"><label>Role</label><input id="emp_role" placeholder="Technician, Driver, Manager, etc."></div>
  <div class="field"><label>Employee Number</label><input id="emp_number"></div>
 </div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveEmployee()">Save Employee</button></div>`,()=>{});
}
function saveEmployee(){
 ensureEmployeeData();
 const name=document.getElementById("emp_name").value.trim(),department=document.getElementById("emp_dept").value,role=document.getElementById("emp_role").value.trim(),number=document.getElementById("emp_number").value.trim();
 if(!name){alert("Employee name is required.");return}
 if(db.employees.some(e=>e.name.toLowerCase()===name.toLowerCase())){alert("That employee already exists.");return}
 db.employees.push({id:"EMP-"+(db.employees.length+1),name,department,role,employeeNumber:number,active:true,createdAt:new Date().toISOString()});
 logAudit("Added employee "+name);save();closeModal();render();
}
function openEmployeeReport(id){
 ensureEmployeeData();const e=db.employees.find(x=>x.id===id);if(!e)return;
 const labor=(db.laborSessions||[]).filter(x=>x.technician===e.name),slips=(db.timeSlips||[]).filter(x=>x.employee===e.name);
 const jobs=[...new Set([...labor.map(x=>x.jobId),...slips.map(x=>x.jobId).filter(Boolean)])];
 const minsLabor=labor.reduce((a,x)=>a+Number(x.minutes||0),0),minsSlips=slips.reduce((a,x)=>a+Number(x.minutes||0),0);
 const panel=document.getElementById("employeeReportPanel");if(!panel)return;
 panel.innerHTML=`<div class="employee-report">
  <div class="employee-report-head"><div><h3>${esc(e.name)}</h3><div class="muted">${esc(e.department||"")} ${e.role?`· ${esc(e.role)}`:""}</div></div><div><b>${((minsLabor+minsSlips)/60).toFixed(2)} hrs</b><div class="muted">${jobs.length} jobs</div></div></div>
  <div class="fleet-cards"><div><b>${(minsLabor/60).toFixed(2)}</b><span>Motor Timer Hours</span></div><div><b>${(minsSlips/60).toFixed(2)}</b><span>Time Slip Hours</span></div><div><b>${jobs.length}</b><span>Jobs Worked</span></div></div>
  ${renderEmployeeProductivity(e.name)}
  <h4>Jobs / Work History</h4>
  <div class="row head employee-history-grid"><div>Date</div><div>Job / Motor</div><div>Type / Code</div><div>Procedure</div><div>Hours</div></div>
  ${[...labor.map(x=>({date:x.date,job:x.jobId,type:"Timer",code:"",stage:x.stage,mins:x.minutes})),...slips.map(x=>({date:x.date,job:x.jobId,type:"Time Slip",code:x.code,stage:x.codeName,mins:x.minutes}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<div class="row employee-history-grid"><div>${esc(x.date)}</div><div>${esc(x.job||"—")}</div><div>${esc(x.type)} ${x.code?`· ${esc(x.code)}`:""}</div><div>${esc(x.stage||"")}</div><div>${(Number(x.mins||0)/60).toFixed(2)}</div></div>`).join("")||empty("No work activity recorded.")}
 </div>`;
}


function ensureEngineeringData(){
 db.engineeringJobs=db.engineeringJobs||[];
 db.testRecords=db.testRecords||[];
}
function renderEngineering(){
 ensureEngineeringData();
 const sum=document.getElementById("engineeringSummary"),jobs=document.getElementById("engineeringJobs");if(!sum)return;
 const active=db.engineeringJobs.filter(x=>x.status!=="Completed").length;
 const billable=(db.timeSlips||[]).filter(x=>x.department==="Engineering"&&x.billable).reduce((a,x)=>a+Number(x.minutes||0),0)/60;
 const tests=db.testRecords.length,certs=db.testRecords.filter(x=>x.recordType==="Breaker Certification").length;
 sum.innerHTML=`<div class="fleet-cards"><div><b>${active}</b><span>Active Field Jobs</span></div><div><b>${billable.toFixed(2)}</b><span>Billable Engineering Hrs</span></div><div><b>${tests}</b><span>Test Records</span></div><div><b>${certs}</b><span>Breaker Certifications</span></div></div>`;
 jobs.innerHTML=`<div class="row head eng-grid"><div>Job</div><div>Customer</div><div>Equipment</div><div>Service</div><div>Status</div><div>Scheduled</div><div>Actions</div></div>`+
 db.engineeringJobs.slice().reverse().map(j=>`<div class="row eng-grid"><div><b>${esc(j.jobNumber)}</b></div><div>${esc(j.customer)}</div><div>${esc(j.equipmentCategory)}</div><div>${esc(j.serviceType)}</div><div>${esc(j.status)}</div><div>${esc(j.scheduledDate||"")}</div><div><button class="secondary small-btn" onclick="openEngineeringJob('${j.id}')">Open</button></div></div>`).join("")||empty("No engineering field jobs yet.");
}
function openEngineeringJob(id){
 ensureEngineeringData();const j=db.engineeringJobs.find(x=>x.id===id);if(!j)return;
 const records=db.testRecords.filter(x=>x.jobNumber===j.jobNumber);
 const slips=(db.timeSlips||[]).filter(x=>x.jobId===j.jobNumber&&x.department==="Engineering");
 openModal("Engineering Job "+j.jobNumber,`
 <div class="notice"><b>${esc(j.customer)}</b> · ${esc(j.equipmentCategory)} · ${esc(j.serviceType)}<br>Status: <b>${esc(j.status)}</b></div>
 <div class="form-grid">
  <div class="field"><label>Job Number</label><input value="${esc(j.jobNumber)}" disabled></div>
  <div class="field"><label>Customer</label><input value="${esc(j.customer)}" disabled></div>
  <div class="field"><label>Equipment</label><input value="${esc(j.equipmentCategory)}" disabled></div>
  <div class="field"><label>Site</label><input value="${esc(j.site||"")}" disabled></div>
 </div>
 <h4>Testing / Certification Records (${records.length})</h4>
 ${records.map(r=>`<div class="notice"><b>${esc(r.recordType)}</b> · ${esc(r.testDate)} · ${esc(r.result)}<br>${esc(r.summary||"")}</div>`).join("")||empty("No test records yet.")}
 <h4>Engineering Time (${slips.length} entries)</h4>
 ${slips.map(x=>`<div class="notice">${esc(x.date)} · ${esc(x.codeName||x.code)} · ${(Number(x.minutes||0)/60).toFixed(2)} hrs · ${esc(x.equipment||"")}</div>`).join("")||empty("No engineering time recorded.")}
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Close</button><button class="primary" onclick="closeModal();setTimeout(()=>openTestRecordBuilder('${j.jobNumber}'),50)">+ Add Test / Certification</button></div>
 `,()=>{});
}
function nextEngineeringNumber(){
 ensureEngineeringData();
 const nums=db.engineeringJobs.map(x=>String(x.jobNumber||"").match(/^E-(\d+)$/i)).filter(Boolean).map(m=>Number(m[1]));
 const next=(nums.length?Math.max(...nums):0)+1;
 return `E-${String(next).padStart(4,"0")}`;
}
function openEngineeringJobBuilder(){
 ensureEngineeringData();
 const suggested=nextEngineeringNumber();
 openModal("New Engineering Field Job",`
 <div class="form-grid">
  <div class="field"><label>Engineering Job Number</label><input id="ej_job" value="${suggested}" readonly><div class="muted">Automatically assigned E-number</div></div>
  <div class="field"><label>Customer <span class="req">*</span></label><select id="ej_customer">${customerOptions()}</select></div>
  <div class="field"><label>Equipment Category</label><select id="ej_equipment"><option>Transformer</option><option>Switchgear</option><option>Drives</option><option>Recloser</option><option>Breaker</option><option>General Field Service</option></select></div>
  <div class="field"><label>Service Type</label><select id="ej_service"><option>Field Testing</option><option>Installation</option><option>Commissioning / Startup</option><option>Breaker Certification</option><option>Breaker Cleaning / Rebuild</option><option>Field Repair</option><option>Inspection</option><option>Other</option></select></div>
  <div class="field"><label>Site / Location</label><input id="ej_site"></div>
  <div class="field"><label>Scheduled Date</label><input id="ej_date" type="date"></div>
  <div class="field"><label>Equipment ID / Serial</label><input id="ej_serial"></div>
  <div class="field"><label>Notes</label><input id="ej_notes"></div>
 </div>
 <div class="notice">Engineering jobs are automatically numbered <b>E-0001, E-0002, E-0003...</b>. The E-number becomes the primary engineering job reference for time, testing, reports and billing.</div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveEngineeringJob()">Create E-Job</button></div>`,()=>{});
}
function saveEngineeringJob(){
 ensureEngineeringData();
 const customer=document.getElementById("ej_customer").value,equipmentCategory=document.getElementById("ej_equipment").value,serviceType=document.getElementById("ej_service").value,site=document.getElementById("ej_site").value.trim(),scheduledDate=document.getElementById("ej_date").value,serial=document.getElementById("ej_serial").value.trim(),notes=document.getElementById("ej_notes").value.trim();
 if(!customer){alert("Customer is required.");return}
 const jobNumber=nextEngineeringNumber();
 db.engineeringJobs.push({id:"ENG-"+(db.engineeringJobs.length+1),jobNumber,customer,equipmentCategory,serviceType,site,scheduledDate,serial,notes,status:"Scheduled",createdAt:new Date().toISOString()});
 db.jobs=db.jobs||[]; if(!db.jobs.some(x=>x.id===jobNumber)) db.jobs.push({id:jobNumber,customer,type:"Engineering Field Service",stage:"Scheduled",notes});
 logAudit("Created engineering field job "+jobNumber);save();closeModal();render();
}
function openTestRecordBuilder(jobNumber=""){
 ensureEngineeringData();
 openModal("Test / Certification Record",`
 <div class="form-grid">
  <div class="field"><label>Job Number <span class="req">*</span></label><input id="tr_job" value="${esc(jobNumber)}"></div>
  <div class="field"><label>Record Type</label><select id="tr_type" onchange="renderTestTemplateFields()">${Object.keys(TEST_TEMPLATES).map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
  <div class="field"><label>Test Date</label><input id="tr_date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  <div class="field"><label>Technician / Engineer</label><input id="tr_person"></div>
  <div class="field"><label>Overall Result</label><select id="tr_result"><option>Pass</option><option>Pass with Notes</option><option>Fail</option><option>Needs Repair</option><option>Pending</option></select></div>
  <div class="field"><label>Test Standard / Procedure</label><input id="tr_standard" placeholder="Company standard/procedure"></div>
  <div class="field"><label>Equipment / Serial</label><input id="tr_equipment"></div>
  <div class="field"><label>Photos / Documents</label><input id="tr_attachment_note" placeholder="Attachment placeholder in prototype"></div>
 </div>
 <div id="tr_template_fields"></div>
 <div class="field"><label>Summary / Results</label><textarea id="tr_summary" rows="3" placeholder="Overall findings, deficiencies, recommendations"></textarea></div>
 <div class="notice">The production version can attach photos, test sheets, meter files, certificates and customer signatures directly to this record.</div>
 <div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveTestRecord()">Save Record</button></div>`,()=>{});
 renderTestTemplateFields();
}
function saveTestRecord(){
 ensureEngineeringData();
 const jobNumber=document.getElementById("tr_job").value.trim(),recordType=document.getElementById("tr_type").value,testDate=document.getElementById("tr_date").value,person=document.getElementById("tr_person").value.trim(),result=document.getElementById("tr_result").value,standard=document.getElementById("tr_standard").value.trim(),equipment=document.getElementById("tr_equipment").value.trim(),summary=document.getElementById("tr_summary").value.trim(),attachmentNote=document.getElementById("tr_attachment_note").value.trim(),measurements=collectTestMeasurements();
 if(!jobNumber||!testDate){alert("Job number and test date are required.");return}
 db.testRecords.push({id:"TEST-"+(db.testRecords.length+1),jobNumber,recordType,testDate,person,result,standard,equipment,summary,measurements,attachmentNote,createdAt:new Date().toISOString()});
 logAudit("Added engineering test/certification record");save();closeModal();render();
}

function renderCustomers(){
 const q=(document.getElementById("customerSearch")?.value||"").toLowerCase();
 let a=db.customers.filter(c=>JSON.stringify(c).toLowerCase().includes(q));
 document.getElementById("customerTable").innerHTML=`<div class="row head"><div>Company / Name</div><div>Contact</div><div>Phone</div><div>Email</div></div>`+
 a.map(c=>`<div class="row clickable" onclick="editCustomer(${c.id})"><div><strong>${esc(c.name)}</strong></div><div>${esc(c.contact)}</div><div>${esc(c.phone)}</div><div>${esc(c.email)}</div></div>`).join("")||empty();
}
function renderJobs(){
 const q=(document.getElementById("jobSearch")?.value||"").toLowerCase();
 let a=db.jobs.filter(j=>JSON.stringify(j).toLowerCase().includes(q));
 document.getElementById("jobTable").innerHTML=`<div class="row head"><div>Job / Customer</div><div>Motor</div><div>Stage</div><div>Serial</div></div>`+
 a.map(j=>`<div class="row clickable" onclick="editJob('${j.id}')"><div><strong>${esc(j.id)}</strong><div class="muted">${esc(j.customer)}</div></div><div>${esc(j.type)}<div class="muted">${j.hp?j.hp+" HP":""} ${j.voltage?j.voltage+" V":""}</div></div><div>${badge(j.stage)}</div><div>${esc(j.serial)}</div></div>`).join("")||empty();
}
function renderInventory(){
 const q=(document.getElementById("inventorySearch")?.value||"").toLowerCase();
 let a=db.inventory.filter(i=>JSON.stringify(i).toLowerCase().includes(q));
 document.getElementById("inventoryTable").innerHTML=`<div class="row head"><div>Part</div><div>Description</div><div>Qty</div><div>Reorder</div></div>`+
 a.map(i=>`<div class="row clickable" onclick="editInventory('${i.part}')"><div><strong>${esc(i.part)}</strong></div><div>${esc(i.desc)}</div><div class="${i.qty<=i.min?'danger':''}">${i.qty}</div><div>${i.min}</div></div>`).join("")||empty();
}
function renderQuotes(){
 document.getElementById("quoteTable").innerHTML=`<div class="row head"><div>Quote</div><div>Customer</div><div>Amount</div><div>Status</div></div>`+
 db.quotes.map(q=>`<div class="row clickable" onclick="openQuoteBuilder('${q.id}')"><div><strong>${esc(q.id)}</strong><div class="muted">${esc(q.job)}</div></div><div>${esc(q.customer)}</div><div>${money(q.amount)}</div><div>${badge(q.status)}</div></div>`).join("")||empty();
}
function renderDeliveries(){
 document.getElementById("deliveryTable").innerHTML=`<div class="row head"><div>Type / Customer</div><div>Date</div><div>Driver</div><div>Status</div></div>`+
 db.deliveries.map(d=>`<div class="row clickable" onclick="openDelivery('${d.id}')"><div><strong>${esc(d.type)}</strong><div class="muted">${esc(d.customer)} · ${esc((d.jobs||[]).join(", "))}</div></div><div>${esc(d.date)}</div><div>${esc(d.driver)}</div><div>${badge(d.status)}</div></div>`).join("")||empty();
}


function openDelivery(id){
 const d=db.deliveries.find(x=>x.id===id); if(!d)return;
 d.photos=d.photos||[]; d.jobs=d.jobs||[];
 const isPickup=d.type==="Pickup";
 const selectedJobs=db.jobs.map(j=>`<label class="job-select"><input type="checkbox" class="delivery-job" value="${esc(j.id)}" ${d.jobs.includes(j.id)?"checked":""}> <b>${esc(j.id)}</b> — ${esc(j.customer)} — ${esc(j.type)} ${j.hp?esc(j.hp)+" HP":""}</label>`).join("");
 const photos=(d.photos||[]).map(p=>`<div class="photo"><img src="${p.data}"><small>${esc(p.kind)} · ${esc(p.name||"photo")}</small></div>`).join("")||empty("No photos attached.");
 const m=d.motor||{};
 openModal((isPickup?"Pickup":"Delivery")+" "+d.id,`
  <div class="job-summary"><div><b>${esc(d.customer)}</b><div class="muted">${esc(d.type)} · ${esc(d.date)} · ${esc(d.driver)}</div></div>${badge(d.status)}</div>
  <div class="notice"><b>${isPickup?"Pickup":"Delivery"} workflow:</b> ${isPickup?"For a normal pickup, photos and customer signature are optional. If damage is reported, a damage description and photo are required.":"Customer receipt confirmation and signature are required for return delivery. Photos are optional unless damage/problem is reported."}</div>

  <div class="delivery-section"><h3>1. Job / Motor</h3><div class="job-selects">${selectedJobs}</div></div>

  <div class="delivery-section"><h3>2. Motor Description</h3>
   <div class="form-grid">
    <div class="field full"><label>Motor / Equipment Description <span class="req">*</span></label><textarea id="motorDescription" rows="2" placeholder="Example: Baldor 250 HP AC 3 Phase motor">${esc(d.motorDescription||"")}</textarea></div>
    ${motorField("Horsepower","hp",m.hp)}
    ${motorField("AC / DC","acdc",m.acdc)}
    ${motorField("Phase","phase",m.phase)}
    ${motorField("Voltage","voltage",m.voltage)}
    ${motorField("Manufacturer","manufacturer",m.manufacturer)}
    ${motorField("Model","model",m.model)}
    ${motorField("Serial Number","serial",m.serial)}
   </div>
  </div>

  <div class="delivery-section"><h3>3. Condition</h3>
    <div class="field"><label>Overall Condition</label>
      <select id="condition">
       <option ${d.condition==="Good"?"selected":""}>Good</option>
       <option ${d.condition==="Damaged — Documented"?"selected":""}>Damaged — Documented</option>
       <option ${d.condition==="Significant Damage"?"selected":""}>Significant Damage</option>
      </select>
    </div>
    <div class="condition-grid">
      ${["Motor appears undamaged","Shaft condition appears normal","Fan / guard present","Terminal / conduit box present","Nameplate present / readable","Mounting feet / flange condition","Lifting points condition","Covers / accessories present","Visible corrosion","Visible oil / grease leakage","Physical damage","Other"].map((x,i)=>`<label><input type="checkbox" class="cond" data-i="${i}" ${(d.conditionChecks||[])[i]?"checked":""}> ${x}</label>`).join("")}
    </div>
    <div class="field"><label>${isPickup?"Driver Pickup Notes":"Delivery Notes"}</label><textarea id="deliveryNotes" rows="3">${esc(d.notes||"")}</textarea></div>
    <div class="field"><label>Damage Description ${d.condition==="Good"?"(optional)":"<span class='req'>* required when damaged</span>"}</label><textarea id="damageDescription" rows="3" placeholder="Describe dents, missing parts, broken covers, etc.">${esc(d.damageDescription||"")}</textarea></div>
  </div>

  <div class="delivery-section"><h3>4. Photos — Optional Unless Damaged</h3>
    <div class="required-photos">
      <button type="button" class="secondary" onclick="addDeliveryPhoto('${d.id}','Overall Motor')">📷 Add Photo</button>
      <button type="button" class="secondary" onclick="addDeliveryPhoto('${d.id}','Nameplate')">📷 Nameplate</button>
      <button type="button" class="secondary" onclick="addDeliveryPhoto('${d.id}','Damage / Other')">📷 Damage / Other</button>
    </div>
    <div class="muted photo-rule">${isPickup?"Normal pickup: photos are optional. Damaged pickup: at least one photo required.":"Normal delivery: photos are optional. If delivery damage/problem is reported, at least one photo is required."}</div>
    <div class="photos">${photos}</div>
  </div>

  ${isPickup?`
  <div class="delivery-section"><h3>5. Customer Signature — Optional for Pickup</h3>
    <div class="muted">A customer signature is not required to complete a pickup. You may capture one if the customer wants to acknowledge release of the equipment.</div>
    <div class="field"><label>Released By (optional)</label><input id="receiverName" value="${esc(d.receiverName||"")}"></div>
    <div class="signature-wrap"><canvas id="sigCanvas" width="560" height="180"></canvas><div class="sig-actions"><button type="button" class="secondary" onclick="clearSignature()">Clear Signature</button></div></div>
  </div>`:`
  <div class="delivery-section"><h3>5. Customer Receipt</h3>
    <div class="field"><label>Received By <span class="req">*</span></label><input id="receiverName" value="${esc(d.receiverName||"")}"></div>
    <div class="signature-wrap"><canvas id="sigCanvas" width="560" height="180"></canvas><div class="sig-actions"><button type="button" class="secondary" onclick="clearSignature()">Clear Signature</button></div></div>
    <div class="muted">Customer signature is required for return delivery.</div>
  </div>`}

  <div class="form-actions">
    <button type="button" class="secondary" onclick="saveDelivery('${d.id}')">Save</button>
    <button type="button" class="primary" onclick="completeDelivery('${d.id}')">Complete ${esc(d.type)}</button>
  </div>`,()=>{});
 setupSignature(d);
 document.querySelectorAll(".delivery-job").forEach(c=>c.onchange=()=>{d.jobs=[...document.querySelectorAll(".delivery-job:checked")].map(x=>x.value);save()});
 document.querySelectorAll(".cond").forEach(c=>c.onchange=()=>{d.conditionChecks=d.conditionChecks||[];d.conditionChecks[+c.dataset.i]=c.checked;save()});
}

let sigPad=null;
function setupSignature(d){
 const c=document.getElementById("sigCanvas"); if(!c)return;
 const ctx=c.getContext("2d");ctx.lineWidth=2;ctx.lineCap="round";ctx.strokeStyle="#0f172a";ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
 if(d.signature){let im=new Image();im.onload=()=>ctx.drawImage(im,0,0);im.src=d.signature}
 let drawing=false;
 const pos=e=>{const r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};
 c.onpointerdown=e=>{drawing=true;let p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);c.setPointerCapture(e.pointerId)};
 c.onpointermove=e=>{if(!drawing)return;let p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
 c.onpointerup=()=>drawing=false;c.onpointercancel=()=>drawing=false;
 sigPad={canvas:c,ctx};
}
function clearSignature(){if(!sigPad)return;sigPad.ctx.clearRect(0,0,sigPad.canvas.width,sigPad.canvas.height)}
function addDeliveryPhoto(id,kind){
 const input=document.createElement("input");input.type="file";input.accept="image/*";input.multiple=true;input.capture="environment";
 input.onchange=async()=>{const d=db.deliveries.find(x=>x.id===id);d.photos=d.photos||[];for(const f of input.files)d.photos.push({kind,name:f.name,data:await photoData(f)});save();openDelivery(id)};input.click()
}
function saveDelivery(id){
 const d=db.deliveries.find(x=>x.id===id);
 d.jobs=[...document.querySelectorAll(".delivery-job:checked")].map(x=>x.value);
 d.motorDescription=document.getElementById("motorDescription").value;
 d.motor={hp:document.querySelector('[name="hp"]')?.value||"",acdc:document.querySelector('[name="acdc"]')?.value||"",phase:document.querySelector('[name="phase"]')?.value||"",voltage:document.querySelector('[name="voltage"]')?.value||"",manufacturer:document.querySelector('[name="manufacturer"]')?.value||"",model:document.querySelector('[name="model"]')?.value||"",serial:document.querySelector('[name="serial"]')?.value||""};
 d.condition=document.getElementById("condition").value;d.notes=document.getElementById("deliveryNotes").value;d.damageDescription=document.getElementById("damageDescription").value;d.receiverName=document.getElementById("receiverName").value;
 if(sigPad)d.signature=sigPad.canvas.toDataURL("image/png");
 save();closeModal();render();
}
function completeDelivery(id){
 const d=db.deliveries.find(x=>x.id===id), isPickup=d.type==="Pickup";
 d.jobs=[...document.querySelectorAll(".delivery-job:checked")].map(x=>x.value);
 d.motorDescription=document.getElementById("motorDescription").value.trim();
 d.motor={hp:document.querySelector('[name="hp"]')?.value||"",acdc:document.querySelector('[name="acdc"]')?.value||"",phase:document.querySelector('[name="phase"]')?.value||"",voltage:document.querySelector('[name="voltage"]')?.value||"",manufacturer:document.querySelector('[name="manufacturer"]')?.value||"",model:document.querySelector('[name="model"]')?.value||"",serial:document.querySelector('[name="serial"]')?.value||""};
 d.condition=document.getElementById("condition").value;d.notes=document.getElementById("deliveryNotes").value.trim();d.damageDescription=document.getElementById("damageDescription").value.trim();d.receiverName=document.getElementById("receiverName").value.trim();
 if(!d.jobs.length){alert("Select at least one job/motor.");return}
 if(!d.motorDescription){alert("Enter a description of the motor/equipment.");return}
 if(d.condition!=="Good"){
   if(!d.damageDescription){alert("Because the motor is marked damaged, enter a damage description.");return}
   if(!(d.photos||[]).length){alert("Because the motor is marked damaged, add at least one photo.");return}
 }
 if(!isPickup){
   if(!d.receiverName){alert("Enter the customer's receiving name.");return}
   if(!sigPad || sigPad.canvas.toDataURL("image/png").length<5000){alert("Customer signature is required for return delivery.");return}
   d.signature=sigPad.canvas.toDataURL("image/png");
 } else if(sigPad && sigPad.canvas.toDataURL("image/png").length>=5000){
   d.signature=sigPad.canvas.toDataURL("image/png");
 }
 d.status=isPickup?"Picked Up":"Delivered";d.completedAt=new Date().toISOString();
 save();closeModal();render();alert(d.status+" recorded successfully.");
}

function openQuoteFromJob(jobId){
 const j=db.jobs.find(x=>x.id===jobId); if(!j)return;
 const existing=db.quotes.find(q=>q.job===jobId);
 if(existing){
   openQuoteBuilder(existing.id);
   return;
 }
 const customer=db.customers.find(c=>c.name===j.customer);
 openQuoteBuilder(null,{
   customer:j.customer,
   job:j.id,
   contact:customer?.contact||"",
   motorDescription:`${j.type||"Motor"}${j.hp?` — ${j.hp} HP`:""}${j.voltage?` — ${j.voltage} V`:""}${j.serial?` — S/N ${j.serial}`:""}`,
   notes:j.notes||"",
   items:[]
 });
}


function motorQrUrl(j){
 const payload=location.origin+location.pathname+"?motor="+encodeURIComponent(j.id);
 return "https://quickchart.io/qr?text="+encodeURIComponent(payload)+"&size=220";
}
function showMotorQr(id){
 const j=db.jobs.find(x=>x.id===id);if(!j)return;
 openModal("QR Code — "+j.id,`
  <div class="qr-card">
   <img src="${motorQrUrl(j)}" alt="QR code for ${esc(j.id)}">
   <h3>${esc(j.id)}</h3><div>${esc(j.customer)} · ${esc(j.type)}</div>
   <div class="muted">Scan this code to identify the motor/job. Production version will use authenticated QR links.</div>
   <button type="button" class="primary" onclick="window.print()">🖨️ Print QR Label</button>
  </div>`,()=>{});
}
function quoteSend(id){
 const q=db.quotes.find(x=>x.id===id);if(!q)return;
 openModal("Send Quote "+q.id,`
  <div class="quote-send-card"><b>${esc(q.id)}</b><div>${esc(q.customer)} · ${money(q.amount||0)}</div></div>
  <div class="field"><label>Send / Approval Method</label><select id="quoteMethod">
   <option value="Email">Email to Customer</option><option value="Text">Text Message</option><option value="Manual">Manual / Phone Approval</option>
  </select></div>
  <div class="field"><label>Email or Mobile (if applicable)</label><input id="quoteDestination" value="${esc(q.destination||"")}"></div>
  <div class="field"><label>Approval Notes</label><textarea id="quoteApprovalNotes" rows="3">${esc(q.approvalNotes||"")}</textarea></div>
  <div class="notice">Prototype mode records the method and approval information. It does not actually send email/text messages yet.</div>
  <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="button" class="primary" onclick="saveQuoteSend('${q.id}')">Save / Record Method</button></div>
 `,()=>{});
}
function saveQuoteSend(id){
 const q=db.quotes.find(x=>x.id===id);
 q.sendMethod=document.getElementById("quoteMethod").value;q.destination=document.getElementById("quoteDestination").value;q.approvalNotes=document.getElementById("quoteApprovalNotes").value;
 q.sentAt=new Date().toISOString();q.status=q.sendMethod==="Manual"?"Awaiting Approval":"Sent to Customer";
 save();closeModal();render();
}
function recordQuoteApproval(id,result){
 const q=db.quotes.find(x=>x.id===id);if(!q)return;
 const name=prompt(result==="Approved"?"Approved by (customer name):":"Reason / customer note:");
 if(result==="Approved"&&!name)return;
 q.approvalStatus=result;q.approvedBy=result==="Approved"?name:"";q.approvalAt=new Date().toISOString();q.status=result==="Approved"?"Approved":result==="Declined"?"Declined":"Changes Requested";
 save();render();
}

function openModal(title,html,onSubmit){
 document.getElementById("modalTitle").textContent=title;document.getElementById("modalForm").innerHTML=html;document.getElementById("modal").classList.remove("hidden");
 document.getElementById("modalForm").onsubmit=e=>{e.preventDefault();onSubmit(new FormData(e.target));closeModal();save();render()};
}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
document.getElementById("closeModal").onclick=closeModal;
document.getElementById("quickAdd").onclick=()=>openNewJob();
document.getElementById("addJob").onclick=openNewJob;
document.getElementById("addCustomer").onclick=openNewCustomer;
document.getElementById("addInventory").onclick=openNewInventory;
document.getElementById("addQuote").onclick=openQuoteBuilder;
document.getElementById("addDelivery").onclick=openNewDelivery;
function customerOptions(){return db.customers.map(c=>`<option>${esc(c.name)}</option>`).join("")}

async function getCurrentSupabaseSession(){
 if(!supabaseClient)return null;
 try{return (await supabaseClient.auth.getSession()).data.session||null}catch(e){return null}
}
async function nextRemoteNumber(table,column,prefix,start){
 if(!supabaseClient)return `${prefix}-${start}`;
 const {data,error}=await supabaseClient.from(table).select(column).like(column,`${prefix}-%`).order(column,{ascending:false}).limit(100);
 if(error)throw error;
 let max=start-1;
 for(const row of (data||[])){
   const m=String(row[column]||"").match(new RegExp("^"+prefix+"-(\\d+)$"));
   if(m)max=Math.max(max,Number(m[1]));
 }
 return `${prefix}-${max+1}`;
}
async function dbCustomerIdByName(name){
 const local=(db.customers||[]).find(c=>c.name===name);
 if(local && local.id && String(local.id).length>20)return local.id;
 const {data,error}=await supabaseClient.from("customers").select("id").eq("company_name",name).maybeSingle();
 if(error)throw error;
 return data?.id||null;
}

async function openNewCustomer(){
 const session=await getCurrentSupabaseSession();
 openModal("New Customer",`<div class="form-grid">
   <div class="field"><label>Customer #</label><input name="customerNumber" placeholder="Auto-generated"></div>
   <div class="field"><label>Company / Name</label><input name="name" required></div>
   <div class="field"><label>Contact</label><input name="contact"></div>
   <div class="field"><label>Phone</label><input name="phone"></div>
   <div class="field"><label>Email</label><input name="email" type="email"></div>
   <div class="field full"><label>Notes</label><textarea name="notes" rows="3"></textarea></div>
 </div><div class="form-actions"><button class="secondary" type="button" onclick="closeModal()">Cancel</button><button class="primary">Save Customer</button></div>`,
 async f=>{
   const name=f.get("name").trim(); if(!name){alert("Company / Name is required.");return}
   try{
     if(session){
       const customerNumber=(f.get("customerNumber")||"").trim()||await nextRemoteNumber("customers","customer_number","C",1001);
       const {data,error}=await supabaseClient.from("customers").insert({
         customer_number:customerNumber,company_name:name,contact_name:f.get("contact")||null,
         phone:f.get("phone")||null,email:f.get("email")||null,notes:f.get("notes")||null
       }).select("id,customer_number,company_name,contact_name,phone,email,notes").single();
       if(error)throw error;
       db.customers.push({id:data.id,customerNumber:data.customer_number,name:data.company_name,contact:data.contact_name||"",phone:data.phone||"",email:data.email||"",notes:data.notes||""});
     }else{
       db.customers.push({id:Date.now(),customerNumber:f.get("customerNumber")||`C-${Date.now()}`,name,contact:f.get("contact"),phone:f.get("phone"),email:f.get("email"),notes:f.get("notes")});
     }
     logAudit("Created customer");save();closeModal();render();
   }catch(e){alert("Customer was not saved to the database: "+(e.message||e))}
 });
}
async function editCustomer(id){
 const c=db.customers.find(x=>x.id===id); if(!c)return;
 const session=await getCurrentSupabaseSession();
 openModal("Edit Customer",`<div class="form-grid">
   <div class="field"><label>Customer #</label><input name="customerNumber" value="${esc(c.customerNumber||"")}" readonly></div>
   <div class="field"><label>Company / Name</label><input name="name" value="${esc(c.name)}" required></div>
   <div class="field"><label>Contact</label><input name="contact" value="${esc(c.contact)}"></div>
   <div class="field"><label>Phone</label><input name="phone" value="${esc(c.phone)}"></div>
   <div class="field"><label>Email</label><input name="email" value="${esc(c.email)}"></div>
   <div class="field full"><label>Notes</label><textarea name="notes" rows="3">${esc(c.notes||"")}</textarea></div>
 </div><div class="form-actions"><button class="secondary" type="button" onclick="closeModal()">Cancel</button><button class="primary">Save Changes</button></div>`,
 async f=>{
   const name=f.get("name").trim(); if(!name){alert("Company / Name is required.");return}
   try{
     if(session && c.id){
       const {data,error}=await supabaseClient.from("customers").update({
         company_name:name,contact_name:f.get("contact")||null,phone:f.get("phone")||null,
         email:f.get("email")||null,notes:f.get("notes")||null
       }).eq("id",c.id).select("id,customer_number,company_name,contact_name,phone,email,notes").single();
       if(error)throw error;
       Object.assign(c,{id:data.id,customerNumber:data.customer_number,name:data.company_name,contact:data.contact_name||"",phone:data.phone||"",email:data.email||"",notes:data.notes||""});
     }else Object.assign(c,{name,contact:f.get("contact"),phone:f.get("phone"),email:f.get("email"),notes:f.get("notes")});
     logAudit("Updated customer");save();closeModal();render();
   }catch(e){alert("Customer was not saved to the database: "+(e.message||e))}
 });
}
async function openNewJob(){
 const session=await getCurrentSupabaseSession();
 openModal("New Motor / Breaker Job",`<div class="form-grid">
   <div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div>
   <div class="field"><label>Equipment Type</label><select name="type"><option>AC 3 Phase</option><option>AC Single Phase</option><option>DC Motor</option><option>Breaker</option><option>Pump</option><option>Generator</option><option>Engineering Field Service</option><option>Other</option></select></div>
   <div class="field"><label>Horsepower</label><input name="hp" type="number"></div>
   <div class="field"><label>Voltage</label><input name="voltage"></div>
   <div class="field"><label>Serial Number</label><input name="serial"></div>
   <div class="field"><label>Priority</label><select name="priority"><option>Normal</option><option>High</option><option>Rush</option></select></div>
   <div class="field full"><label>Customer Complaint / Notes</label><textarea name="notes" rows="3"></textarea></div>
 </div><div class="form-actions"><button class="secondary" type="button" onclick="closeModal()">Cancel</button><button class="primary">Create Job</button></div>`,
 async f=>{
   const customer=f.get("customer"),type=f.get("type"),notes=f.get("notes")||"";
   if(!customer){alert("Select a customer.");return}
   try{
     const n=session?await nextRemoteNumber("jobs","job_number","J",1001):`J-${db.jobs.length+1001}`;
     if(session){
       const customerId=await dbCustomerIdByName(customer);
       if(!customerId)throw new Error("Could not find the selected customer in the database.");
       const {data,error}=await supabaseClient.from("jobs").insert({
         job_number:n,customer_id:customerId,equipment_type:type,job_type:"Repair",
         description:notes||type,status:"Receiving",priority:f.get("priority")||"Normal",notes
       }).select("job_number,equipment_type,status,priority,notes,customers(company_name)").single();
       if(error)throw error;
       db.jobs.push({id:data.job_number,customer:data.customers?.company_name||customer,type:data.equipment_type||"",
         hp:f.get("hp")||"",voltage:f.get("voltage")||"",serial:f.get("serial")||"",
         stage:data.status||"Receiving",priority:data.priority||"Normal",notes:data.notes||""});
     }else{
       db.jobs.push({id:n,customer,type,hp:f.get("hp"),voltage:f.get("voltage"),serial:f.get("serial"),
         stage:"Receiving",priority:f.get("priority"),notes,completed:{},photos:[]});
     }
     logAudit(`Created job ${n}`);save();closeModal();render();
   }catch(e){alert("Job was not saved to the database: "+(e.message||e))}
 });
}

function saveNameplateData(id){
 const j=db.jobs.find(x=>x.id===id); if(!j)return;
 j.motor=j.motor||{};
 const map={
  np_manufacturer:"manufacturer",np_model:"model",np_acdc:"acdc",np_phase:"phase",np_power:"power",
  np_voltage:"voltage",np_amps:"amps",np_rpm:"rpm",np_frequency:"frequency",np_frame:"frame",
  np_serviceFactor:"serviceFactor",np_enclosure:"enclosure",np_insulationClass:"insulationClass",
  np_tempRise:"tempRise",np_duty:"duty",np_efficiency:"efficiency",np_powerFactor:"powerFactor",
  np_bearingDE:"bearingDE",np_bearingODE:"bearingODE"
 };
 Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id);if(el)j.motor[key]=el.value});
 const serial=document.getElementById("np_serial"); if(serial)j.serial=serial.value;
 const notes=document.getElementById("np_notes"); if(notes)j.motor.identNotes=notes.value;
 j.motor.nameplateCapturedAt=new Date().toISOString();
 save();editJob(id);
}

function editJob(id){
 const j=db.jobs.find(x=>x.id===id); if(!j)return;
 const stages=["Receiving","Inspection","Disassembly","Cleaning","Machine Shop","Waiting on Parts","Assembly","Testing","Paint","Quality Check","Ready for Pickup","Completed"];
 openModal("Job "+j.id,`<div class="form-grid"><div class="field"><label>Customer</label><input value="${esc(j.customer)}" disabled></div><div class="field"><label>Equipment</label><input value="${esc(j.type)}" disabled></div><div class="field"><label>Serial</label><input value="${esc(j.serial)}" disabled></div><div class="field"><label>Stage</label><select name="stage">${stages.map(s=>`<option ${s===j.stage?"selected":""}>${s}</option>`).join("")}</select></div><div class="field full"><label>Technician Notes</label><textarea name="notes" rows="4">${esc(j.notes||"")}</textarea></div></div><div class="form-actions"><button class="primary">Update Job</button></div>`,f=>Object.assign(j,{stage:f.get("stage"),notes:f.get("notes")}));
}
function openNewInventory(){
 openModal("New Inventory Part",`<div class="form-grid"><div class="field"><label>Part Number</label><input name="part" required></div><div class="field"><label>Description</label><input name="desc"></div><div class="field"><label>Quantity</label><input name="qty" type="number" value="0"></div><div class="field"><label>Minimum Stock</label><input name="min" type="number" value="0"></div><div class="field"><label>Unit Cost</label><input name="cost" type="number" step="0.01" value="0"></div></div><div class="form-actions"><button class="primary">Save Part</button></div>`,f=>db.inventory.push({part:f.get("part"),desc:f.get("desc"),qty:Number(f.get("qty")),min:Number(f.get("min")),cost:Number(f.get("cost"))}));
}
function editInventory(part){
 const i=db.inventory.find(x=>x.part===part);if(!i)return;
 openModal("Edit "+part,`<div class="form-grid"><div class="field"><label>Part Number</label><input value="${esc(i.part)}" disabled></div><div class="field"><label>Description</label><input name="desc" value="${esc(i.desc)}"></div><div class="field"><label>Quantity</label><input name="qty" type="number" value="${i.qty}"></div><div class="field"><label>Minimum Stock</label><input name="min" type="number" value="${i.min}"></div><div class="field"><label>Unit Cost</label><input name="cost" type="number" step="0.01" value="${i.cost}"></div></div><div class="form-actions"><button class="primary">Save Changes</button></div>`,f=>Object.assign(i,{desc:f.get("desc"),qty:Number(f.get("qty")),min:Number(f.get("min")),cost:Number(f.get("cost"))}));
}
function quoteTotal(items){
 return (items||[]).reduce((sum,i)=>sum+(Number(i.qty)||0)*(Number(i.unit)||0),0);
}
function quoteBuilderRows(items=[]){
 return items.map((i,n)=>`<div class="quote-line" data-line="${n}">
  <div><input class="qdesc" placeholder="Description" value="${esc(i.desc||"")}"></div>
  <div><input class="qqty" type="number" min="0" step="0.01" value="${i.qty??1}"></div>
  <div><input class="qunit" type="number" min="0" step="0.01" value="${i.unit??0}"></div>
  <div class="qamount">${money((Number(i.qty)||0)*(Number(i.unit)||0))}</div>
  <button type="button" class="danger-btn" onclick="removeQuoteLine(this)">×</button>
 </div>`).join("");
}
function openQuoteBuilder(existingId=null,prefill=null){
 const existing=existingId?db.quotes.find(q=>q.id===existingId):null;
 const q=existing||prefill||{customer:db.customers[0]?.name||"",job:"",amount:0,status:"Draft",items:[{desc:"Motor inspection / evaluation",qty:1,unit:0}]};
 openModal(existing?"Edit Quote "+existing.id:"Build New Quote",`
  <div class="quote-head">
   <div><b>${existing?esc(existing.id):"New Quote"}</b><div class="muted">Basic repair estimate builder</div></div>
   ${badge(q.status)}
  </div>
  ${q.job?`<div class="linked-job"><b>🔗 Linked Job / Motor: ${esc(q.job)}</b><div>${esc(q.motorDescription||"Motor information linked from job")}</div></div>`:""}
  <div class="form-grid">
   <div class="field"><label>Customer <span class="req">*</span></label><select id="qcustomer">${customerOptions()}</select></div>
   <div class="field"><label>Job Number</label><input id="qjob" value="${esc(q.job||"")}"></div>
   <div class="field"><label>Quote Date</label><input id="qdate" type="date" value="${esc(q.date||new Date().toISOString().slice(0,10))}"></div>
   <div class="field"><label>Valid Through</label><input id="qvalid" type="date" value="${esc(q.validThrough||"")}"></div>
   <div class="field"><label>Customer Contact</label><input id="qcontact" value="${esc(q.contact||"")}"></div>
   <div class="field"><label>Prepared By</label><input id="qprepared" value="${esc(q.preparedBy||"")}"></div>
   <div class="field full"><label>Motor / Job Description</label><input id="qmotor" value="${esc(q.motorDescription||"")}" placeholder="Automatically filled when quote is created from a job"></div>
  </div>
  <div class="quote-section">
   <div class="quote-section-head"><h3>Quote Items</h3><button type="button" class="secondary" onclick="addQuoteLine()">+ Add Line</button></div>
   <div class="quote-line quote-line-head"><div>Description</div><div>Qty</div><div>Unit Price</div><div>Amount</div><div></div></div>
   <div id="quoteLines">${quoteBuilderRows(q.items)}</div>
   <div class="quote-total"><span>Estimated Total</span><strong id="quoteBuilderTotal">${money(quoteTotal(q.items))}</strong></div>
  </div>
  <div class="form-grid">
   <div class="field"><label>Estimated Labor Hours</label><input id="qlaborhours" type="number" step="0.1" value="${q.laborHours||""}"></div>
   <div class="field"><label>Labor Rate</label><input id="qlaborrate" type="number" step="0.01" value="${q.laborRate||""}"></div>
   <div class="field"><label>Tax / Other</label><input id="qtax" type="number" step="0.01" value="${q.tax||""}"></div>
   <div class="field"><label>Status</label><select id="qstatus"><option>Draft</option><option>Awaiting Approval</option><option>Approved</option><option>Declined</option><option>Sent to Customer</option></select></div>
  </div>
  <div class="field"><label>Scope of Work / Quote Notes</label><textarea id="qnotes" rows="4" placeholder="Example: Disassemble, clean, inspect, replace bearings, reassemble and test.">${esc(q.notes||"")}</textarea></div>
  <div class="notice"><b>Prototype:</b> This builder creates a basic estimate. Later we can add AC Electric's actual labor rates, standard repair operations, bearing pricing, markup, taxes, discounts and quote PDF/email generation.</div>
  <div class="form-actions">
   <button type="button" class="secondary" onclick="closeModal()">Cancel</button>
   ${existing?`<button type="button" class="secondary" onclick="quoteSend('${existing.id}')">📤 Send / Request Approval</button>
   <button type="button" class="secondary" onclick="recordQuoteApproval('${existing.id}','Approved')">✅ Record Approval</button>
   <button type="button" class="secondary" onclick="recordQuoteApproval('${existing.id}','Changes Requested')">✏️ Changes Requested</button>
   <button type="button" class="secondary" onclick="recordQuoteApproval('${existing.id}','Declined')">❌ Declined</button>`:""}
   <button type="button" class="primary" onclick="saveQuoteBuilder('${existing?existing.id:""}')">Save Quote</button>
  </div>
 `,()=>{});
 const cs=document.getElementById("qcustomer"); if(cs&&q.customer)cs.value=q.customer;
 const st=document.getElementById("qstatus"); if(st)st.value=q.status||"Draft";
 document.querySelectorAll(".qdesc,.qqty,.qunit").forEach(x=>x.addEventListener("input",updateQuoteBuilderTotal));
}
function addQuoteLine(){
 const container=document.getElementById("quoteLines"); if(!container)return;
 const div=document.createElement("div");div.className="quote-line";
 div.innerHTML=`<div><input class="qdesc" placeholder="Description"></div><div><input class="qqty" type="number" min="0" step="0.01" value="1"></div><div><input class="qunit" type="number" min="0" step="0.01" value="0"></div><div class="qamount">$0.00</div><button type="button" class="danger-btn" onclick="removeQuoteLine(this)">×</button>`;
 container.appendChild(div);
 div.querySelectorAll("input").forEach(x=>x.addEventListener("input",updateQuoteBuilderTotal));
 updateQuoteBuilderTotal();
}
function removeQuoteLine(btn){btn.closest(".quote-line")?.remove();updateQuoteBuilderTotal()}
function getQuoteBuilderItems(){
 return [...document.querySelectorAll("#quoteLines .quote-line:not(.quote-line-head)")].map(r=>({
  desc:r.querySelector(".qdesc")?.value||"",
  qty:Number(r.querySelector(".qqty")?.value||0),
  unit:Number(r.querySelector(".qunit")?.value||0)
 })).filter(i=>i.desc||i.qty||i.unit);
}
function updateQuoteBuilderTotal(){
 const items=getQuoteBuilderItems();let subtotal=quoteTotal(items);
 const labor=(Number(document.getElementById("qlaborhours")?.value||0)*Number(document.getElementById("qlaborrate")?.value||0));
 const tax=Number(document.getElementById("qtax")?.value||0);
 document.querySelectorAll(".quote-line:not(.quote-line-head)").forEach(r=>{
  const qty=Number(r.querySelector(".qqty")?.value||0),unit=Number(r.querySelector(".qunit")?.value||0);
  const a=r.querySelector(".qamount");if(a)a.textContent=money(qty*unit);
 });
 const total=subtotal+labor+tax;
 const t=document.getElementById("quoteBuilderTotal");if(t)t.textContent=money(total);
 return total;
}
async function saveQuoteBuilder(id){
 const customer=document.getElementById("qcustomer").value;
 const items=getQuoteBuilderItems();
 if(!customer){alert("Select a customer.");return}
 if(!items.length){alert("Add at least one quote line.");return}
 const laborHours=Number(document.getElementById("qlaborhours").value||0),laborRate=Number(document.getElementById("qlaborrate").value||0),tax=Number(document.getElementById("qtax").value||0);
 const subtotal=quoteTotal(items),labor=laborHours*laborRate,total=subtotal+labor+tax;
 const session=await getCurrentSupabaseSession();
 const jobNumber=(document.getElementById("qjob").value||"").trim();
 try{
   if(session){
     const customerId=await dbCustomerIdByName(customer);
     if(!customerId)throw new Error("Could not find the selected customer.");
     const quoteNumber=id||await nextRemoteNumber("quotes","quote_number","Q",2001);
     let payload={quote_number:quoteNumber,customer_id:customerId,status:document.getElementById("qstatus").value||"Draft",
       subtotal:subtotal+labor,tax,total,valid_until:document.getElementById("qvalid").value||null,customer_approval_method:"Prototype"};
     if(jobNumber){
       const {data:job,error:je}=await supabaseClient.from("jobs").select("id").eq("job_number",jobNumber).maybeSingle();
       if(je)throw je;
       if(job?.id)payload.job_id=job.id;
     }
     const existing=await supabaseClient.from("quotes").select("id").eq("quote_number",quoteNumber).maybeSingle();
     if(existing.error)throw existing.error;
     let result=existing.data
       ? await supabaseClient.from("quotes").update(payload).eq("id",existing.data.id).select("id,quote_number,total,status,job_id,customers(company_name)").single()
       : await supabaseClient.from("quotes").insert(payload).select("id,quote_number,total,status,job_id,customers(company_name)").single();
     if(result.error)throw result.error;
     let q=db.quotes.find(x=>x.id===quoteNumber); if(!q){q={id:quoteNumber};db.quotes.push(q)}
     Object.assign(q,{remoteId:result.data.id,customer:result.data.customers?.company_name||customer,job:jobNumber,
       amount:Number(result.data.total||total),status:result.data.status||"Draft",date:document.getElementById("qdate").value,
       items,subtotal,laborHours,laborRate,labor,tax,notes:document.getElementById("qnotes").value});
     logAudit(`Saved quote ${quoteNumber} to database`);
   }else{
     let q=id?db.quotes.find(x=>x.id===id):null;
     if(!q){q={id:"Q-"+(db.quotes.length+2001)};db.quotes.push(q)}
     Object.assign(q,{customer,job:jobNumber,date:document.getElementById("qdate").value,validThrough:document.getElementById("qvalid").value,
       contact:document.getElementById("qcontact").value,preparedBy:document.getElementById("qprepared").value,
       motorDescription:document.getElementById("qmotor").value,items,subtotal,laborHours,laborRate,labor,tax,amount:total,
       status:document.getElementById("qstatus").value,notes:document.getElementById("qnotes").value});
   }
   save();closeModal();render();
 }catch(e){alert("Quote was not saved to the database: "+(e.message||e))}
}

function openNewDelivery(){
 openModal("Schedule Pickup / Delivery",`<div class="form-grid"><div class="field"><label>Type</label><select name="type"><option>Pickup</option><option>Delivery</option></select></div><div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div><div class="field"><label>Date</label><input name="date" type="date" required></div><div class="field"><label>Driver</label><select name="driver"><option>Unassigned</option><option>Driver 1</option><option>Driver 2</option><option>Driver 3</option><option>Driver 4</option></select></div></div><div class="form-actions"><button class="primary">Schedule</button></div>`,f=>db.deliveries.push({id:"D-"+(db.deliveries.length+3001),type:f.get("type"),customer:f.get("customer"),date:f.get("date"),driver:f.get("driver"),status:"Scheduled",jobs:[],condition:"",notes:"",photos:[],signature:null}));
}
["customerSearch","jobSearch","inventorySearch","motorRecordSearch"].forEach(id=>document.getElementById(id)?.addEventListener("input",render));
document.getElementById("addMotorRecord")?.addEventListener("click",openNewMotorRecord);

const WORKFLOW=[
["Receiving","Job In / Receiving",["Confirm customer/contact","Record nameplate and equipment data","Record customer complaint/scope","Take incoming-condition photos","Assign job number/tag"]],
["Inspection","Initial Inspection & Testing",["Document incoming condition","Record applicable electrical tests","Record mechanical observations","Document suspected failure cause","Attach inspection photos/test sheets"]],
["Disassembly","Disassembly",["Confirm approved scope","Photograph orientation/connections","Record shims/hardware/component locations","Inspect bearings/seals/shaft","Document teardown findings"]],
["Cleaning","Cleaning / Drying",["Select approved cleaning method","Protect equipment during cleaning","Document post-cleaning condition","Dry using shop-approved method","Reinspect insulation/core/fits"]],
["Repair","Repair / Reconditioning",["Confirm approved repair scope","Record repair work performed","Record parts/bearings used","Record winding/rewind data when applicable","Complete intermediate inspections"]],
["Assembly","Assembly",["Verify parts/components","Verify bearings/seals/fits","Reassemble in documented orientation","Verify leads/accessories","Perform mechanical checks"]],
["Testing","Final Testing",["Record applicable insulation resistance/PI results","Record winding resistance","Record applicable no-load/load results","Record voltage/current/phase balance/RPM/vibration/temp as applicable","Attach final test sheet"]],
["FinalInspection","Final Inspection / QC",["Verify scope complete","Verify test results recorded","Verify hardware/guards/leads/accessories","Verify finish and identification","Supervisor/QC sign-off"]],
["Ready","Ready for Pickup / Delivery",["Confirm customer notification","Confirm invoice/paperwork","Confirm motor tagged/staged","Confirm pickup/delivery arrangement","Record release authorization"]]
];
const WF_KEYS=WORKFLOW.map(x=>x[0]);
function jobPct(j){let i=WF_KEYS.indexOf(j.stage);return Math.max(0,Math.round(i/(WF_KEYS.length-1)*100))}
function addJobPhoto(id,stage){
 const input=document.createElement("input"); input.type="file"; input.accept="image/*"; input.multiple=true; input.capture="environment";
 input.onchange=async()=>{let j=db.jobs.find(x=>x.id===id);j.photos=j.photos||[];for(const f of input.files){j.photos.push({stage,name:f.name,data:await photoData(f)})}save();editJob(id)}; input.click();
}
function photoData(file){return new Promise(res=>{let r=new FileReader();r.onload=e=>{let im=new Image();im.onload=()=>{let c=document.createElement("canvas"),m=Math.min(1,1200/im.width,1200/im.height);c.width=im.width*m;c.height=im.height*m;c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.7))};im.src=e.target.result};r.readAsDataURL(file)})}
function completeStage(id,key){
 let j=db.jobs.find(x=>x.id===id), i=WF_KEYS.indexOf(key), checks=(j.checks||{})[key]||[];
 if(checks.filter(Boolean).length<WORKFLOW[i][2].length){alert("Complete every checklist item before moving forward. A supervisor override can be used when authorized.");return}
 j.completed=j.completed||{};j.completed[key]=true;j.stage=WORKFLOW[i+1]?WORKFLOW[i+1][0]:"Completed";save();editJob(id)
}
function supervisorOverride(id){
 let j=db.jobs.find(x=>x.id===id), code=prompt("Prototype supervisor override code: 2468");
 if(code!=="2468"){alert("Override denied.");return}
 let i=WF_KEYS.indexOf(j.stage);j.overrides=j.overrides||[];j.overrides.push({from:j.stage,at:new Date().toISOString()});
 j.completed=j.completed||{};j.completed[j.stage]=true;j.stage=WORKFLOW[i+1]?WORKFLOW[i+1][0]:"Completed";save();editJob(id)
}
function workflowHtml(j){
 return WORKFLOW.map((w,i)=>{let done=(j.completed||{})[w[0]],active=j.stage===w[0];
 return `<div class="stage ${done?"done":""} ${active?"active":""}"><div class="stage-top"><div><b>${i+1}. ${w[1]}</b><div class="muted">${done?"Completed":active?"Current step":"Locked"}</div></div><span class="stage-dot">${done?"✓":i+1}</span></div>
 ${active?`<div class="checklist">${w[2].map((x,k)=>`<label><input class="wfcheck" data-key="${w[0]}" data-i="${k}" type="checkbox" ${((j.checks||{})[w[0]]||[])[k]?"checked":""}>${x}</label>`).join("")}</div>
 ${w[0]==="Receiving"?`<div class="nameplate-sheet">
   <div class="nameplate-head"><div><b>Motor Nameplate / Job-In Data Sheet</b><div class="muted">Enter information exactly as shown on the nameplate when available.</div></div><button type="button" class="secondary" onclick="addJobPhoto('${j.id}','Nameplate')">📷 Nameplate Photo</button></div>
   <div class="form-grid">
    ${motorField("Manufacturer","np_manufacturer",j.motor?.manufacturer)}
    ${motorField("Model / Type","np_model",j.motor?.model)}
    ${motorField("Serial Number","np_serial",j.serial||j.motor?.serial)}
    ${motorField("AC / DC","np_acdc",j.motor?.acdc)}
    ${motorField("Phase","np_phase",j.motor?.phase)}
    ${motorField("HP / kW","np_power",j.motor?.power||j.hp)}
    ${motorField("Voltage","np_voltage",j.motor?.voltage||j.voltage)}
    ${motorField("Amps","np_amps",j.motor?.amps)}
    ${motorField("RPM","np_rpm",j.motor?.rpm)}
    ${motorField("Hz / Frequency","np_frequency",j.motor?.frequency)}
    ${motorField("Frame","np_frame",j.motor?.frame)}
    ${motorField("Service Factor","np_serviceFactor",j.motor?.serviceFactor)}
    ${motorField("Enclosure","np_enclosure",j.motor?.enclosure)}
    ${motorField("Insulation Class","np_insulationClass",j.motor?.insulationClass)}
    ${motorField("Temperature Rise","np_tempRise",j.motor?.tempRise)}
    ${motorField("Duty","np_duty",j.motor?.duty)}
    ${motorField("Efficiency","np_efficiency",j.motor?.efficiency)}
    ${motorField("Power Factor","np_powerFactor",j.motor?.powerFactor)}
    ${motorField("Bearing DE","np_bearingDE",j.motor?.bearingDE)}
    ${motorField("Bearing ODE","np_bearingODE",j.motor?.bearingODE)}
    ${motorText("Additional Nameplate Information","np_notes",j.motor?.identNotes,2)}
   </div>
   <div class="nameplate-actions"><button type="button" class="primary" onclick="saveNameplateData('${j.id}')">Save Nameplate Data</button></div>
 </div>`:""}
 <div class="stage-actions"><button type="button" class="secondary" onclick="addJobPhoto('${j.id}','${w[0]}')">📷 Add / Take Photos</button>${w[0]==="Receiving"?`<button type="button" class="secondary" onclick="showMotorQr('${j.id}')">▣ Create / Print QR</button>`:""}<button type="button" class="secondary" onclick="openLaborTimer('${j.id}')">⏱️ Start / Stop Work</button><button type="button" class="primary" onclick="completeStage('${j.id}','${w[0]}')">Complete Step</button></div>`:""}</div>`}).join("")
}
function editJob(id){
 let j=db.jobs.find(x=>x.id===id);if(!j)return;
 let photos=(j.photos||[]).map(x=>`<div class="photo"><img src="${x.data}"><small>${esc(x.stage)} · ${esc(x.name)}</small></div>`).join("")||empty("No photos attached.");
 openModal("Job "+j.id,`<div class="job-summary"><div><b>${esc(j.customer)}</b><div class="muted">${esc(j.type)} · ${j.hp?esc(j.hp)+" HP · ":""}${esc(j.voltage)} V · S/N ${esc(j.serial)}</div></div>${badge(j.stage)}</div>
 <div class="progress"><div style="width:${jobPct(j)}%"></div></div><div class="progress-label"><span>${jobPct(j)}%</span><span>${esc(j.stage)}</span></div>
 <div class="notice"><b>Workflow lock:</b> each step must be completed before the next step opens. Supervisor override is available for authorized exceptions.</div>
 <div class="workflow">${workflowHtml(j)}</div>
 <div class="override"><button type="button" class="secondary" onclick="supervisorOverride('${j.id}')">🔒 Supervisor Override Current Step</button></div>
 <div class="field"><label>Job Notes</label><textarea id="jn" rows="4">${esc(j.notes||"")}</textarea></div>
 <div><b>Motor / Job Photos</b><div class="photos">${photos}</div></div>
 <div class="form-actions">
  <button type="button" class="secondary" onclick="openQuoteFromJob('${j.id}')">💰 Build Quote</button>
  <button type="button" class="secondary" onclick="showMotorQr('${j.id}')">▣ QR Code</button>
  <button type="button" class="primary" onclick="saveJobNotes('${j.id}')">Save Job</button>
</div>`,()=>{});
 document.querySelectorAll(".wfcheck").forEach(c=>c.onchange=()=>{j.checks=j.checks||{};j.checks[c.dataset.key]=j.checks[c.dataset.key]||[];j.checks[c.dataset.key][+c.dataset.i]=c.checked;save()})
}

function ensureMotorMasterRecord(j){
 if(!j)return;
 j.motor=j.motor||{};
 j.motorMaster=j.motorMaster||{};
 j.motorMaster.createdAt=j.motorMaster.createdAt||new Date().toISOString();
 j.motorMaster.jobbedInAt=j.motorMaster.jobbedInAt||new Date().toISOString();
 j.motorMaster.status="Active";
 j.motorMaster.jobId=j.id;
 j.motorMaster.customer=j.customer;
 j.motorMaster.description=j.type||"Motor";
 j.motorMaster.serial=j.serial||j.motor?.serial||"";
 j.motorMaster.qrId=j.id;
}

function saveJobNotes(id){let j=db.jobs.find(x=>x.id===id);j.notes=document.getElementById("jn").value;save();closeModal();render()}

renderUsers();
renderAdmin();
document.getElementById("addUser")?.addEventListener("click",()=>openUserBuilder());

db.jobs.forEach(ensureMotorMasterRecord);
save();

document.getElementById("addNewMotor")?.addEventListener("click",()=>openNewMotorBuilder());
document.getElementById("newMotorSearch")?.addEventListener("input",renderNewMotors);

document.getElementById("addMileage")?.addEventListener("click",openMileageBuilder);

document.getElementById("newSale")?.addEventListener("click",openSaleBuilder);
document.getElementById("newInvoice")?.addEventListener("click",openInvoiceBuilder);

document.getElementById("refreshBilling")?.addEventListener("click",renderBilling);

document.getElementById("newTimeSlip")?.addEventListener("click",openTimeSlip);
document.getElementById("newJournal")?.addEventListener("click",openJournalEntry);
document.getElementById("exportAccounting")?.addEventListener("click",exportAccountingData);

document.getElementById("newEngineeringJob")?.addEventListener("click",openEngineeringJobBuilder);
document.getElementById("newTestRecord")?.addEventListener("click",()=>openTestRecordBuilder(""));

document.getElementById("newSchedule")?.addEventListener("click",openScheduleBuilder);
document.getElementById("newProcedure")?.addEventListener("click",openProcedureBuilder);
document.getElementById("newMaintenance")?.addEventListener("click",openMaintenanceBuilder);
document.getElementById("newCertification")?.addEventListener("click",openCertificationBuilder);
document.getElementById("exportUniversal")?.addEventListener("click",universalExport);
document.getElementById("exportReport")?.addEventListener("click",()=>{alert("Management report export is available in the production roadmap; use Universal Accounting Export for raw business data in this prototype.");});
document.getElementById("askAssistant")?.addEventListener("click",()=>{const q=document.getElementById("assistantQuestion").value;document.getElementById("assistantAnswer").innerHTML="<b>Shop Assistant:</b> "+esc(assistantAnswer(q));});

render();

if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",installEquipmentTestPage)}else{installEquipmentTestPage()}
