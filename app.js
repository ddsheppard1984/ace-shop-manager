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
function save(){localStorage.setItem(KEY,JSON.stringify(db))}
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
render();
const motorParam=new URLSearchParams(location.search).get('motor'); if(motorParam && db.jobs.some(j=>j.id===motorParam)){setTimeout(()=>editJob(motorParam),100);}
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>nav(b.dataset.view));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>nav(b.dataset.go));
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
function adminData(){db.admin=db.admin||JSON.parse(JSON.stringify(ADMIN_DEFAULTS));db.procedures=db.procedures||JSON.parse(JSON.stringify(DEFAULT_PROCEDURES));return db.admin}
function renderAdmin(){
 const el=document.getElementById("adminPanel");if(!el)return;
 adminData();
 el.innerHTML=`<div class="muted">Choose a category above to edit settings.</div>`;
 document.querySelectorAll(".admin-card").forEach(b=>b.onclick=()=>openAdminTab(b.dataset.adminTab));
}
function openAdminTab(tab){
 adminData();const a=db.admin;const el=document.getElementById("adminPanel");let html="";
 if(tab==="company")html=`<h3>Company / Shop Information</h3><div class="form-grid">${motorField("Company Name","a_company",a.company.name)}${motorField("Phone","a_phone",a.company.phone)}${motorField("Email","a_email",a.company.email)}${motorField("Time Zone","a_timezone",a.company.timezone)}${motorText("Address","a_address",a.company.address,2)}</div><button class="primary" onclick="saveAdminTab('company')">Save Company Settings</button>`;
 if(tab==="roles")html=`<h3>Roles & Permissions</h3><div class="role-admin-list">${Object.entries(USER_ROLES).map(([r,p])=>`<div class="role-admin"><b>${esc(r)}</b><ul>${p.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div><div class="notice">Role permissions will become enforced by the production authentication system. The prototype displays the planned access model.</div>`;
 if(tab==="rates")html=`<h3>Labor & Quote Rates</h3><div class="form-grid">${motorField("Default Labor Rate","a_laborRate",a.rates.laborRate,"number")}${motorField("Tax Rate %","a_taxRate",a.rates.taxRate,"number")}${motorField("Default Parts Markup %","a_markup",a.rates.markup,"number")}${motorField("Quote Valid Days","a_quoteValidDays",a.rates.quoteValidDays,"number")}</div><button class="primary" onclick="saveAdminTab('rates')">Save Rate Settings</button>`;
 if(tab==="procedures")html=`<h3>Shop Procedures</h3><div class="procedure-admin">${Object.entries(db.procedures).map(([k,items])=>`<div class="procedure-card"><b>${esc(k)}</b><ol>${items.map((x,i)=>`<li><input value="${esc(x)}" data-proc="${esc(k)}" data-index="${i}"></li>`).join("")}</ol><button class="secondary" onclick="addProcedure('${k}')">+ Add Procedure</button></div>`).join("")}</div><button class="primary" onclick="saveProcedures()">Save Procedures</button>`;
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
 if(tab==='ifta')renderIFTAAdmin();
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
 const driver=document.getElementById("m_driver").value.trim(),date=document.getElementById("m_date").value,truck=document.getElementById("m_truck").value.trim(),start=Number(document.getElementById("m_start").value||0),end=Number(document.getElementById("m_end").value||0),total=end-start;
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
 db.mileage=db.mileage||[];
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
 el.innerHTML=`<div class="ifta-quarter-bar">
   <div><b>IFTA Quarter Running Tally</b><div class="muted">Updates automatically as mileage entries are added.</div></div>
   <select id="iftaQuarterSelect">${[...Array(8)].map((_,i)=>{
     const d=new Date();d.setMonth(d.getMonth()-i*3);const q=getQuarterInfo(d.toISOString().slice(0,10));const v=`${q.year}-Q${q.quarter}`;
     return `<option value="${v}" ${v===selected?"selected":""}>${q.label}</option>`;
   }).join("")}</select>
 </div>
 <div class="fleet-cards"><div><b>${totalMiles.toLocaleString()}</b><span>Total Miles</span></div><div><b>${totalGallons.toFixed(1)}</b><span>Total Gallons</span></div><div><b>${entries.length}</b><span>Mileage Entries</span></div></div>
 <div class="ifta-state-table">
  <div class="row head"><div>State</div><div>Miles</div><div>Gallons</div><div>MPG</div></div>
  ${Object.entries(states).sort((a,b)=>a[0].localeCompare(b[0])).map(([st,x])=>`<div class="row"><div><b>${esc(st)}</b></div><div>${x.miles.toLocaleString()}</div><div>${x.gallons.toFixed(1)}</div><div>${x.gallons? (x.miles/x.gallons).toFixed(2):"—"}</div></div>`).join("")||empty("No mileage recorded for this quarter.")}
  ${Object.keys(states).length?`<div class="row ifta-total"><div><b>TOTAL</b></div><div><b>${totalMiles.toLocaleString()}</b></div><div><b>${totalGallons.toFixed(1)}</b></div><div>${totalGallons?(totalMiles/totalGallons).toFixed(2):"—"}</div></div>`:""}
 </div>
 <div class="notice">This is a running operational tally for the quarter. Final IFTA filing calculations should be reviewed by the responsible office/accounting person before filing.</div>`;
 document.getElementById("iftaQuarterSelect")?.addEventListener("change",e=>{window.iftaAdminQuarter=e.target.value;renderIFTAAdmin()});
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
function openNewCustomer(){
 openModal("New Customer",`<div class="form-grid"><div class="field"><label>Company / Name</label><input name="name" required></div><div class="field"><label>Contact</label><input name="contact"></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div></div><div class="form-actions"><button class="secondary" type="button" onclick="closeModal()">Cancel</button><button class="primary">Save Customer</button></div>`,f=>{db.customers.push({id:Date.now(),name:f.get("name"),contact:f.get("contact"),phone:f.get("phone"),email:f.get("email")})});
}
function editCustomer(id){
 const c=db.customers.find(x=>x.id===id); if(!c)return;
 openModal("Edit Customer",`<div class="form-grid"><div class="field"><label>Company / Name</label><input name="name" value="${esc(c.name)}" required></div><div class="field"><label>Contact</label><input name="contact" value="${esc(c.contact)}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(c.phone)}"></div><div class="field"><label>Email</label><input name="email" value="${esc(c.email)}"></div></div><div class="form-actions"><button class="primary">Save Changes</button></div>`,f=>Object.assign(c,{name:f.get("name"),contact:f.get("contact"),phone:f.get("phone"),email:f.get("email")}));
}
function openNewJob(){
 openModal("New Motor / Breaker Job",`<div class="form-grid"><div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div><div class="field"><label>Equipment Type</label><select name="type"><option>AC 3 Phase</option><option>AC Single Phase</option><option>DC Motor</option><option>Breaker</option><option>Pump</option><option>Generator</option><option>Other</option></select></div><div class="field"><label>Horsepower</label><input name="hp" type="number"></div><div class="field"><label>Voltage</label><input name="voltage"></div><div class="field"><label>Serial Number</label><input name="serial"></div><div class="field"><label>Priority</label><select name="priority"><option>Normal</option><option>High</option><option>Rush</option></select></div><div class="field full"><label>Customer Complaint / Notes</label><textarea name="notes" rows="3"></textarea></div></div><div class="form-actions"><button class="primary">Create Job</button></div>`,f=>{const n=db.jobs.length+1001;db.jobs.push({id:"J-"+n,customer:f.get("customer"),type:f.get("type"),hp:f.get("hp"),voltage:f.get("voltage"),serial:f.get("serial"),stage:"Receiving",priority:f.get("priority"),notes:f.get("notes"),completed:{},photos:[]})});
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
function saveQuoteBuilder(id){
 const customer=document.getElementById("qcustomer").value;
 const items=getQuoteBuilderItems();
 if(!customer){alert("Select a customer.");return}
 if(!items.length){alert("Add at least one quote line.");return}
 const laborHours=Number(document.getElementById("qlaborhours").value||0),laborRate=Number(document.getElementById("qlaborrate").value||0),tax=Number(document.getElementById("qtax").value||0);
 const subtotal=quoteTotal(items),labor=laborHours*laborRate,total=subtotal+labor+tax;
 let q=id?db.quotes.find(x=>x.id===id):null;
 if(!q){q={id:"Q-"+(db.quotes.length+2001)};db.quotes.push(q)}
 Object.assign(q,{
  customer,job:document.getElementById("qjob").value,date:document.getElementById("qdate").value,
  validThrough:document.getElementById("qvalid").value,contact:document.getElementById("qcontact").value,
  preparedBy:document.getElementById("qprepared").value,motorDescription:document.getElementById("qmotor").value,items,subtotal,laborHours,laborRate,labor,tax,
  amount:total,status:document.getElementById("qstatus").value,notes:document.getElementById("qnotes").value
 });
 save();closeModal();render();
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
 <div class="stage-actions"><button type="button" class="secondary" onclick="addJobPhoto('${j.id}','${w[0]}')">📷 Add / Take Photos</button>${w[0]==="Receiving"?`<button type="button" class="secondary" onclick="showMotorQr('${j.id}')">▣ Create / Print QR</button>`:""}<button type="button" class="primary" onclick="completeStage('${j.id}','${w[0]}')">Complete Step</button></div>`:""}</div>`}).join("")
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

render();
