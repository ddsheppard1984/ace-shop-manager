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
 const names={dashboard:["Dashboard","AC Electric Corp. shop overview"],customers:["Customers","Customer accounts and contacts"],jobs:["Jobs / Motors","Work orders and repair workflow"],inventory:["Inventory","Parts, bearings and shop supplies"],quotes:["Quotes","Repair estimates and approvals"],deliveries:["Pickups / Deliveries","Schedule and track transportation"]};
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
 db.deliveries.map(d=>`<div class="row"><div><strong>${esc(d.type)}</strong><div class="muted">${esc(d.customer)}</div></div><div>${esc(d.date)}</div><div>${esc(d.driver)}</div><div>${badge(d.status)}</div></div>`).join("")||empty();
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
 openModal("New Motor / Breaker Job",`<div class="form-grid"><div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div><div class="field"><label>Equipment Type</label><select name="type"><option>AC 3 Phase</option><option>AC Single Phase</option><option>DC Motor</option><option>Breaker</option><option>Pump</option><option>Generator</option><option>Other</option></select></div><div class="field"><label>Horsepower</label><input name="hp" type="number"></div><div class="field"><label>Voltage</label><input name="voltage"></div><div class="field"><label>Serial Number</label><input name="serial"></div><div class="field"><label>Priority</label><select name="priority"><option>Normal</option><option>High</option><option>Rush</option></select></div><div class="field full"><label>Customer Complaint / Notes</label><textarea name="notes" rows="3"></textarea></div></div><div class="form-actions"><button class="primary">Create Job</button></div>`,f=>{const n=db.jobs.length+1001;db.jobs.push({id:"J-"+n,customer:f.get("customer"),type:f.get("type"),hp:f.get("hp"),voltage:f.get("voltage"),serial:f.get("serial"),stage:"Receiving",priority:f.get("priority"),notes:f.get("notes")})});
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
 openModal("Schedule Pickup / Delivery",`<div class="form-grid"><div class="field"><label>Type</label><select name="type"><option>Pickup</option><option>Delivery</option></select></div><div class="field"><label>Customer</label><select name="customer">${customerOptions()}</select></div><div class="field"><label>Date</label><input name="date" type="date" required></div><div class="field"><label>Driver</label><select name="driver"><option>Unassigned</option><option>Driver 1</option><option>Driver 2</option><option>Driver 3</option><option>Driver 4</option></select></div></div><div class="form-actions"><button class="primary">Schedule</button></div>`,f=>db.deliveries.push({id:"D-"+(db.deliveries.length+3001),type:f.get("type"),customer:f.get("customer"),date:f.get("date"),driver:f.get("driver"),status:"Scheduled"}));
}
["customerSearch","jobSearch","inventorySearch"].forEach(id=>document.getElementById(id).addEventListener("input",render));
render();