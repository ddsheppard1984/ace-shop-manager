ACE SHOP MANAGER — PROTOTYPE v0.1
AC Electric Corp.

WHAT THIS IS
A clickable working prototype for the proposed AC Electric Corp. shop-management system.

INCLUDED
- Dashboard
- Customers
- Jobs / Motors
- Repair workflow stages
- Inventory with low-stock warnings
- Quotes
- Pickup / delivery scheduling
- Local data storage in the browser
- Responsive layout for Windows and iPhone-sized screens

IMPORTANT
This is a prototype, NOT the production system yet.
It does not have multi-user accounts, cloud synchronization, payment processing,
real database storage, security controls, or ACS integration.

WINDOWS — EASIEST TEST
1. Unzip this folder.
2. Double-click index.html.
3. It should open in your browser.
4. Add customers, jobs, parts, quotes, and deliveries.
5. The demo data is stored in that browser on that computer.

IPHONE
The prototype's responsive interface can be tested on an iPhone after the files
are hosted on a web server. The next development step is to put this into GitHub
and turn it into a proper installable web/PWA build.

NEXT DEVELOPMENT MILESTONE
- GitHub repository
- Real PostgreSQL database
- User login and permissions
- Cloud synchronization
- Job photos and documents
- QR codes
- Technician workflow
- Proper Windows/iPhone deployment


V0.2 WORKFLOW FEATURES
- Prototype workflow: Receiving, Inspection, Disassembly, Cleaning/Drying, Repair/Reconditioning, Assembly, Testing, Final Inspection/QC, Ready for Pickup/Delivery.
- Each stage has a checklist and is locked until the previous stage is completed.
- Supervisor override exists for demo purposes only (code 2468). Production must use authenticated supervisor accounts, audit logs and permissions.
- iPhone camera/file photo capture is supported; photos are attached to the job and stage in this prototype.
- Public online procedure sources used as design references: ANSI/EASA AR100-2025, ABB maintenance documentation, and IEEE insulation-resistance guidance. These are not copied into the app. Replace the generic checklist with AC Electric's approved procedures, manufacturer requirements, applicable standards, safety/LOTO rules and acceptance criteria before production use.
