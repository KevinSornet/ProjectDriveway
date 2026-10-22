/**
 * Hardened receiver for the website's inquiry and booking forms.
 *
 * This is a TEMPLATE for the Google Apps Script behind SHEETS_URL in js/main.js.
 * The website's own checks run in the visitor's browser and can be bypassed by
 * anyone who posts to the script URL directly, so the same checks are repeated here.
 *
 * Spreadsheet: "SVC Website" with tabs Inquiries, Service and Helpdesk (opened by SPREADSHEET_ID below).
 * Replies: "ok" = saved, "rejected" = failed validation, "error" = script problem (see Executions log).
 * After pasting, run testSetup once from the editor to grant access and confirm the tabs are found.
 * Setup: open the spreadsheet > Extensions > Apps Script, replace the code with this file,
 * then Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 * Editing the existing deployment keeps the same URL, so the website needs no change.
 */

// Open the "SVC Website" spreadsheet by ID so this works whether the script is bound to the sheet or standalone
const SPREADSHEET_ID = '1R8tp3zjl_c-XSsvrQgu-yq9mf4c7MDqv0MLPsN-V1NQ';
const SHEET_NAMES = { inquiry: 'Inquiries', booking: 'Service', helpdesk: 'Helpdesk' };
const MAX_PER_MINUTE = 20;   // global cap across all visitors (Apps Script cannot see IPs)

const ALLOWED = {
  vehicle: ['Nissan Almera', 'Nissan Primera EV', 'Nissan Livina', 'Nissan Kicks e-POWER', 'Nissan X-Trail e-POWER',
            'Nissan Terra', 'Nissan Navara', 'Nissan Navara Pro PHEV', 'Nissan Urvan', 'Nissan Patrol', 'Nissan Z',
            'Open to Suggestions'],
  branch: ['Nissan Alabang', 'Nissan Sucat', 'Nissan Dasmariñas', 'Nissan Carmona', 'Nissan Calamba', 'Nissan Sta. Rosa'],
  category: ['Orders, Delivery & Registration', 'Repair Follow-ups', 'Parts & Accessories', 'Warranty Claims',
             'Payments & Documents', 'Feedback & Complaints', 'Other'],
  contactPref: ['Call', 'SMS', 'Email', 'Viber'],
};

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return reply('busy');
  try {
    if (!e || !e.postData || e.postData.contents.length > 5000) return reply('rejected');

    const cache = CacheService.getScriptCache();
    const count = Number(cache.get('submissions') || 0);
    if (count >= MAX_PER_MINUTE) return reply('rate-limited');
    cache.put('submissions', String(count + 1), 60);

    const d = JSON.parse(e.postData.contents);
    if (d.company) return reply('ok');   // honeypot filled: pretend success, store nothing

    const firstName = clean(d.firstName, 50), lastName = clean(d.lastName, 50);
    const mobile = clean(d.mobile, 20), email = clean(d.email, 100);
    if (!firstName || !lastName) return reply('rejected');
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(email)) return reply('rejected');
    if (!/^(\+?63|0)9\d{9}$/.test(mobile.replace(/[\s()-]/g, ''))) return reply('rejected');

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (d.type === 'inquiry') {
      if (ALLOWED.vehicle.indexOf(d.vehicle) < 0 || ALLOWED.branch.indexOf(d.dealership) < 0) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.inquiry).appendRow([new Date(), firstName, lastName, mobile, email,
        d.vehicle, d.dealership, clean(d.message, 1000)]);
    } else if (d.type === 'booking') {
      if (ALLOWED.branch.indexOf(d.branch) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return reply('rejected');
      const model = clean(d.model, 60), serviceType = clean(d.serviceType, 300);
      if (!model || !serviceType) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.booking).appendRow([new Date(), firstName, lastName, mobile, email,
        d.branch, d.date, model, serviceType, clean(d.notes, 1000)]);
    } else if (d.type === 'helpdesk') {
      if (ALLOWED.category.indexOf(d.category) < 0 || ALLOWED.branch.indexOf(d.branch) < 0) return reply('rejected');
      if (!/^SVC-\d{6}-[A-Z0-9]{4}$/.test(String(d.ticketId))) return reply('rejected');
      const subject = clean(d.subject, 120), message = clean(d.message, 2000);
      if (!subject || !message) return reply('rejected');
      if (ALLOWED.contactPref.indexOf(d.contactPref) < 0) return reply('rejected');
      const contactPref = d.contactPref;
      // Columns: Timestamp, Ticket ID, Category, Branch, First Name, Last Name, Mobile, Email,
      //          Preferred Contact, Vehicle / Plate No., Subject, Message, Status, Assigned To, Internal Notes
      ss.getSheetByName(SHEET_NAMES.helpdesk).appendRow([new Date(), d.ticketId, d.category, d.branch, firstName, lastName,
        mobile, email, contactPref, clean(d.vehicle, 60), subject, message, 'New', '', '']);
    } else {
      return reply('rejected');
    }
    return reply('ok');
  } catch (err) {
    console.error('Form submission failed: ' + err);   // visible under Apps Script > Executions
    return reply('error');
  } finally {
    lock.releaseLock();
  }
}

// Strip control characters, cap length, and stop Sheets from evaluating input as a formula
function clean(value, max) {
  let v = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return v;
}

function reply(status) {
  return ContentService.createTextOutput(JSON.stringify({ status: status })).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the Apps Script editor (select testSetup > Run) after pasting this file.
// It asks for permission to use the spreadsheet and checks that all three tabs exist.
function testSetup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEET_NAMES).forEach(function (key) {
    const sheet = ss.getSheetByName(SHEET_NAMES[key]);
    console.log(SHEET_NAMES[key] + ': ' + (sheet ? 'found' : 'MISSING'));
  });
}
