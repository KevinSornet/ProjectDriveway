/**
 * Hardened receiver for the website's inquiry and booking forms.
 *
 * This is a TEMPLATE for the Google Apps Script behind SHEETS_URL in js/main.js.
 * The website's own checks run in the visitor's browser and can be bypassed by
 * anyone who posts to the script URL directly, so the same checks are repeated here.
 *
 * Spreadsheet: "SVC Website" with tabs Inquiries, Service and Helpdesk (opened by SPREADSHEET_ID below).
 * Replies: "ok" = saved, "rejected" = failed validation, "error" = script problem (see Executions log).
 * After pasting, run testSetup once from the editor: it grants sheet + email access, checks the tabs,
 * and sends a test email to SUPPORT_EMAIL. New helpdesk tickets are emailed there automatically.
 * Setup: open the spreadsheet > Extensions > Apps Script, replace the code with this file,
 * then Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 * Editing the existing deployment keeps the same URL, so the website needs no change.
 */

// Open the "SVC Website" spreadsheet by ID so this works whether the script is bound to the sheet or standalone
const SPREADSHEET_ID = '1R8tp3zjl_c-XSsvrQgu-yq9mf4c7MDqv0MLPsN-V1NQ';
const SHEET_NAMES = { inquiry: 'Inquiries', booking: 'Service', helpdesk: 'Helpdesk' };
const SUPPORT_EMAIL = 'nissansvc.customerexperience@gmail.com';   // receives a notification for every new helpdesk ticket
const RETENTION_YEARS = 2;   // matches section 5 of privacy.html
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

    // Data Privacy Act: only store data from people who ticked the Privacy Notice consent box
    if (d.consent !== true || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.noticeVersion))) return reply('rejected');
    const consentRecord = 'Yes (Privacy Notice v' + d.noticeVersion + ')';

    const firstName = clean(d.firstName, 50), lastName = clean(d.lastName, 50);
    const email = clean(d.email, 100);
    if (!firstName || !lastName) return reply('rejected');
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(email)) return reply('rejected');
    // Validate the raw number first: clean() adds a leading apostrophe to values starting with "+",
    // which keeps "+63..." as text in Sheets but would make this check fail if it ran first.
    const mobileRaw = String(d.mobile == null ? '' : d.mobile).replace(/[\s()-]/g, '');
    if (!/^(\+?63|0)9\d{9}$/.test(mobileRaw)) return reply('rejected');
    const mobile = clean(mobileRaw, 20);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (d.type === 'inquiry') {
      if (ALLOWED.vehicle.indexOf(d.vehicle) < 0 || ALLOWED.branch.indexOf(d.dealership) < 0) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.inquiry).appendRow([new Date(), firstName, lastName, mobile, email,
        d.vehicle, d.dealership, clean(d.message, 1000), consentRecord]);
    } else if (d.type === 'booking') {
      if (ALLOWED.branch.indexOf(d.branch) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return reply('rejected');
      const model = clean(d.model, 60), serviceType = clean(d.serviceType, 300);
      if (!model || !serviceType) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.booking).appendRow([new Date(), firstName, lastName, mobile, email,
        d.branch, d.date, model, serviceType, clean(d.notes, 1000), consentRecord]);
    } else if (d.type === 'helpdesk') {
      if (ALLOWED.category.indexOf(d.category) < 0 || ALLOWED.branch.indexOf(d.branch) < 0) return reply('rejected');
      if (!/^SVC-\d{6}-[A-Z0-9]{4}$/.test(String(d.ticketId))) return reply('rejected');
      const subject = clean(d.subject, 120), message = clean(d.message, 2000);
      if (!subject || !message) return reply('rejected');
      if (ALLOWED.contactPref.indexOf(d.contactPref) < 0) return reply('rejected');
      const contactPref = d.contactPref;
      // Columns: Timestamp, Ticket ID, Category, Branch, First Name, Last Name, Mobile, Email,
      //          Preferred Contact, Vehicle / Plate No., Subject, Message, Status, Assigned To, Internal Notes, Privacy Consent
      ss.getSheetByName(SHEET_NAMES.helpdesk).appendRow([new Date(), d.ticketId, d.category, d.branch, firstName, lastName,
        mobile, email, contactPref, clean(d.vehicle, 60), subject, message, 'New', '', '', consentRecord]);
      notifySupport({ ticketId: d.ticketId, category: d.category, branch: d.branch, name: firstName + ' ' + lastName,
        mobile: mobileRaw, email: email, contactPref: contactPref, vehicle: clean(d.vehicle, 60), subject: subject, message: message });
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

// Email the Customer Experience team about a new ticket. Replying to the email goes straight to the customer.
// A failed email never blocks the ticket: it is already saved in the sheet.
function notifySupport(t) {
  const plain = function (v) { return String(v).replace(/^'/, ''); };   // drop the Sheets text-escape apostrophe
  try {
    MailApp.sendEmail({
      to: SUPPORT_EMAIL,
      replyTo: plain(t.email),
      subject: '[' + t.ticketId + '] ' + t.category + ' · ' + t.branch + ' — ' + plain(t.subject),
      body: [
        'New helpdesk ticket from the website',
        '',
        'Ticket:            ' + t.ticketId,
        'Topic:             ' + t.category,
        'Branch:            ' + t.branch,
        'Customer:          ' + plain(t.name),
        'Mobile:            ' + t.mobile,
        'Email:             ' + plain(t.email),
        'Preferred contact: ' + t.contactPref,
        'Vehicle / Plate:   ' + (plain(t.vehicle) || '—'),
        '',
        'Subject: ' + plain(t.subject),
        '',
        plain(t.message),
        '',
        'Update the status in the Helpdesk tab: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit',
      ].join('\n'),
    });
  } catch (err) {
    console.error('Ticket ' + t.ticketId + ' saved, but the notification email failed: ' + err);
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
  // Also grants permission to send email and confirms the notification address receives mail
  MailApp.sendEmail(SUPPORT_EMAIL, 'SVC website helpdesk is connected',
    'Ticket notifications from the website helpdesk will arrive at this address.');
  console.log('Test email sent to ' + SUPPORT_EMAIL + ' (emails left today: ' + MailApp.getRemainingDailyQuota() + ')');
}

// Data retention: deletes rows older than RETENTION_YEARS from all three tabs (column A is the timestamp).
// Run it manually, or schedule it: Apps Script > Triggers > Add trigger > purgeExpiredRecords > Time-driven > Month timer.
// Keep rows longer when needed for an open warranty or legal matter by copying them elsewhere first.
function purgeExpiredRecords() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  Object.keys(SHEET_NAMES).forEach(function (key) {
    const sheet = ss.getSheetByName(SHEET_NAMES[key]);
    if (!sheet || sheet.getLastRow() < 2) return;
    const stamps = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    let removed = 0;
    for (let i = stamps.length - 1; i >= 0; i--) {   // bottom-up so row numbers stay valid
      const t = stamps[i][0];
      if (t instanceof Date && t < cutoff) { sheet.deleteRow(i + 2); removed++; }
    }
    console.log(SHEET_NAMES[key] + ': removed ' + removed + ' record(s) older than ' + RETENTION_YEARS + ' years');
  });
}
