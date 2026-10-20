/**
 * Hardened receiver for the website's inquiry and booking forms.
 *
 * This is a TEMPLATE for the Google Apps Script behind SHEETS_URL in js/main.js.
 * The website's own checks run in the visitor's browser and can be bypassed by
 * anyone who posts to the script URL directly, so the same checks are repeated here.
 *
 * Setup: open the existing Apps Script project, merge this logic into its doPost,
 * keep your current sheet names/columns, then Deploy > Manage deployments > Edit > New version.
 */

const SHEET_NAMES = { inquiry: 'Inquiries', booking: 'Bookings' };
const MAX_PER_MINUTE = 20;   // global cap across all visitors (Apps Script cannot see IPs)

const ALLOWED = {
  vehicle: ['Nissan Almera', 'Nissan Primera EV', 'Nissan Livina', 'Nissan Kicks e-POWER', 'Nissan X-Trail e-POWER',
            'Nissan Terra', 'Nissan Navara', 'Nissan Navara Pro PHEV', 'Nissan Urvan', 'Nissan Patrol', 'Nissan Z',
            'Open to Suggestions'],
  branch: ['Nissan Alabang', 'Nissan Sucat', 'Nissan Dasmariñas', 'Nissan Carmona', 'Nissan Calamba', 'Nissan Sta. Rosa'],
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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (d.type === 'inquiry') {
      if (ALLOWED.vehicle.indexOf(d.vehicle) < 0 || ALLOWED.branch.indexOf(d.dealership) < 0) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.inquiry).appendRow([new Date(), firstName, lastName, mobile, email,
        d.vehicle, d.dealership, clean(d.message, 1000)]);
    } else if (d.type === 'booking') {
      if (ALLOWED.branch.indexOf(d.branch) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return reply('rejected');
      ss.getSheetByName(SHEET_NAMES.booking).appendRow([new Date(), firstName, lastName, mobile, email,
        d.branch, d.date, clean(d.model, 60), clean(d.serviceType, 300), clean(d.notes, 1000)]);
    } else {
      return reply('rejected');
    }
    return reply('ok');
  } catch (err) {
    return reply('rejected');
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
