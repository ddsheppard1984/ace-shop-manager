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
 render();
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
 renderCustomers();renderJobs();renderInventory();renderQuotes();renderDeliveries();
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
 <div>${esc(j.type)}<div class="muted">${j.motor?.manufacturer?esc(j.motor.manufacturer):"Manufacturer not entered"} ${j.hp?j.hp+" HP":""}</div></div>
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
 db.quotes.map(q=>`<div class="row"><div><strong>${esc(q.id)}</strong><div class="muted">${esc(q.job)}</div></div><div>${esc(q.customer)}</div><div>${money(q.amount)}</div><div>${badge(q.status)}</div></div>`).join("")||empty();
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
document.getElementById("addQuote").onclick=openNewQuote;
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
function openNewQuote(){
 openModal("New Quote",`<div class="form-grid"><div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div><div class="field"><label>Job Number</label><input name="job"></div><div class="field"><label>Amount</label><input name="amount" type="number" step="0.01"></div><div class="field"><label>Status</label><select name="status"><option>Draft</option><option>Awaiting Approval</option><option>Approved</option><option>Declined</option></select></div></div><div class="form-actions"><button class="primary">Save Quote</button></div>`,f=>db.quotes.push({id:"Q-"+(db.quotes.length+2001),customer:f.get("customer"),job:f.get("job"),amount:Number(f.get("amount")),status:f.get("status")}));
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
 <div class="stage-actions"><button type="button" class="secondary" onclick="addJobPhoto('${j.id}','${w[0]}')">📷 Add / Take Photos</button><button type="button" class="primary" onclick="completeStage('${j.id}','${w[0]}')">Complete Step</button></div>`:""}</div>`}).join("")
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
 <div class="form-actions"><button type="button" class="primary" onclick="saveJobNotes('${j.id}')">Save Job</button></div>`,()=>{});
 document.querySelectorAll(".wfcheck").forEach(c=>c.onchange=()=>{j.checks=j.checks||{};j.checks[c.dataset.key]=j.checks[c.dataset.key]||[];j.checks[c.dataset.key][+c.dataset.i]=c.checked;save()})
}
function saveJobNotes(id){let j=db.jobs.find(x=>x.id===id);j.notes=document.getElementById("jn").value;save();closeModal();render()}

render();