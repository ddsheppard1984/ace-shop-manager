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


V0.3 DRIVER PICKUP / DELIVERY
- Dedicated driver workflow for pickups and deliveries.
- Select the job(s)/motor(s) being transported.
- Pickup condition checklist with Good / Damaged—Documented / Significant Damage.
- Driver notes and required condition photos.
- Customer name and touch-screen signature captured on the phone/tablet.
- Completion requires a selected job, customer name, signature, and (for damaged conditions) at least one photo.
- Completion records date/time and status.
- Prototype stores data locally; production must use authenticated driver accounts, secure cloud storage, encrypted signatures/photos, GPS, audit logs, and retention controls.


V0.4 MOTOR MASTER RECORD
- Dedicated Motor Master Records section.
- Permanent equipment record tied to each job.
- Identification: manufacturer, model, serial, AC/DC, phase, power, voltage, amps, RPM, frame, frequency, service factor, enclosure, insulation class and notes.
- Mechanical: DE/ODE bearings, bearing manufacturer, seals, shaft dimensions/fits, endplay, air gap, balance and rotor condition.
- Electrical: winding resistance, insulation resistance, PI, surge test, phase balance, grounding, initial and final test results.
- History tab with workflow completion and supervisor override history.
- Chain-of-custody summary and complete job photo gallery.
- QR code is planned for the next iteration; the record structure is ready for a QR-linked motor ID.
- Prototype data remains local to the browser. Production requires a secure database, authenticated users, audit logging, secure object storage, GPS and controlled access.


V0.5 PICKUP / DELIVERY RULE UPDATE
- Pickup no longer requires customer signature.
- Pickup photos are optional when the condition is Good.
- If pickup condition is marked damaged/significant, a damage description AND at least one photo are required.
- Pickup requires a motor/equipment description and allows optional HP, AC/DC, phase, voltage, manufacturer, model and serial information.
- Return delivery requires customer receiving name and signature.
- Delivery photos are optional unless a damage/problem condition is reported.

V0.6 DASHBOARD JOB NAVIGATION
- Dashboard job entries open the selected job directly when clicked.
- Jobs / Motors remains available for full job searching and management.
- Clickable dashboard rows have hover styling.


V0.7 QUOTE BUILDER
- Quotes page now has a basic quote builder.
- Customer, job number, dates, contact, preparer and status.
- Line items with description, quantity, unit price and calculated amount.
- Labor hours and labor rate.
- Tax/other amount.
- Scope-of-work notes.
- Automatic quote total calculation.
- Existing quotes can be clicked to edit.
- Designed as a prototype foundation for later AC Electric-specific labor operations, parts/markup rules, approvals, PDF generation and customer delivery.


V0.8 JOB-LINKED QUOTING
- Job editor now has a Build Quote button.
- Clicking Build Quote from a job automatically links the quote to that job number and customer.
- Customer contact and basic motor description are prefilled from the job where available.
- If a quote already exists for that job, Build Quote opens the existing quote for editing instead of creating a duplicate.
- Quote builder displays the linked job/motor information.


V0.9 QUOTE APPROVAL + MOTOR QR
- Quotes can be sent/requested by Email, Text Message, or Manual/Phone Approval method.
- Prototype records send method, destination, timestamp and approval notes.
- Quotes can record Approved, Changes Requested, or Declined status and approver/note.
- Job editor has Build Quote and QR Code actions.
- Receiving stage has Create / Print QR option.
- QR identifies the job/motor and can open the job record in the prototype.
- QR generation currently uses a public QR image service for prototype convenience; production should generate/store QR codes without exposing sensitive data and use authenticated links.
- Email/SMS sending is intentionally not connected yet; production will use a transactional email/SMS provider with secure customer data handling.


V1.0 JOB-IN NAMEPLATE DATA SHEET
- Receiving / Job-In now includes a dedicated motor nameplate data sheet.
- Technicians can manually enter nameplate information at receiving.
- Fields include manufacturer, model/type, serial, AC/DC, phase, HP/kW, voltage, amps, RPM, frequency, frame, service factor, enclosure, insulation class, temperature rise, duty, efficiency, power factor, DE/ODE bearings and additional notes.
- Nameplate photo can be attached from the same section.
- Saved nameplate data feeds the Motor Master Record so information does not need to be entered twice.
- QR creation remains available directly in Receiving.


V1.1 USERS / ACCESS PROTOTYPE
- Added Users / Access section.
- Prototype roles: Technician, Receiving, Driver, Manager, Supervisor, Office, Admin.
- Each role displays typical permissions.
- Users can be added, edited and disabled in the prototype.
- Production authentication will not use this local prototype mechanism; production will use secure identity, password/SSO, MFA, sessions, role permissions and audit logs.

HOSTING / DATABASE PLAN
- Prototype: static GitHub Pages only; data is local/browser storage and is not suitable for real company data.
- Production: web app + managed PostgreSQL database + private object storage for photos/documents + authentication + backups + monitoring.
- We can build the production environment step-by-step without requiring the user to know coding or server administration.


V1.2 ADMINISTRATION AREA
- Added Administration section with Company, Roles & Permissions, Labor/Quote Rates, Procedures, Parts/Bearings, Delivery Settings, Audit Log and System/Production Readiness.
- Company/shop settings are editable without changing code.
- Labor rate, tax rate, markup and quote-validity defaults are configurable.
- Workflow procedure checklists are configurable in the prototype.
- Delivery signature and damaged-photo rules are configurable.
- Audit log framework added for administrative changes.
- Parts/Bearings catalog framework added for future inventory integration.


V1.3 ADMIN NAVIGATION FIX
- Added visible Users / Access and Administration navigation buttons to the sidebar.
- Ensured Users and Administration panels are rendered when the app loads.
- Added Add User button initialization.
- Updated prototype version label.


V1.4 AUTOMATIC MOTOR MASTER RECORD CREATION
- Every motor/job created through Job-In automatically creates its permanent Motor Master Record immediately.
- Existing prototype/test jobs are automatically backfilled into Motor Master Records when the app loads.
- Master record stores job ID, customer, motor description/type, serial, QR ID and jobbed-in timestamp.
- The Motor Master Record remains linked to the job for the entire repair lifecycle.
- Future production database will enforce a true one-to-one motor/job master record and immutable audit history.


V1.5 CUSTOMER / INVENTORY IMPORTS
- Administration now includes Import / Export.
- Customer CSV import with Name, Contact, Phone, Email, Address and Notes.
- Inventory CSV import with Part Number, Description, Category, Manufacturer, Quantity, Unit Cost, Location and Reorder Level.
- Customer and inventory CSV exports are available.
- Prototype JSON backup export is available.
- Production version should add validated templates, duplicate matching, preview-before-import, error reporting, rollback, permissions and encrypted cloud backups.


V1.6 NEW MOTOR INVENTORY
- Added a dedicated New Motors inventory section.
- New motors can be added individually with detailed nameplate/stock information.
- Search new motor inventory.
- Track quantity, location, cost, sale price and reorder level.
- Administration Import/Export now supports importing and exporting new motor inventory via CSV.
- New motor CSV supports stock number, manufacturer, model, serial, HP, AC/DC, phase, voltage, amps, RPM, frame, frequency, enclosure, quantity, location, unit cost, sale price, reorder level and notes.
- Future production version can connect new motor stock directly to POS sales, quotes, reservations and inventory depletion.


V1.7 NEW MOTOR INVENTORY DISPLAY FIX
- Fixed the New Motors page so its inventory is rendered when the application loads and after changes.
- New Motors navigation remains available from the sidebar.
- Existing imported/new-motor records should now appear immediately.
