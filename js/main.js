// ── CONFIG ──
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyM_tZFi46Irap2rMnMHXes1nDs08_hYuimEmACAQNjuG7jCGJ-0MD1jGj-XwP4eRYZ/exec';

// ── HAMBURGER ──
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});
document.querySelectorAll('.mobile-nav-link').forEach(l => l.addEventListener('click', () => {
  hamburger.classList.remove('open');
  mobileMenu.classList.remove('open');
}));

// ── TAB SWITCHER ──
function switchTab(tab) {
  document.querySelectorAll('.contact-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.contact-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}
document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => switchTab(el.dataset.tab)));

// ── CHIP TOGGLE ──
document.querySelectorAll('.svc-chip').forEach(chip => chip.addEventListener('click', () => chip.classList.toggle('selected')));

// ── FORM HELPERS ──
function showMsg(id, type, text) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  el.style.background = type === 'ok' ? 'rgba(0,160,80,0.08)' : 'rgba(200,16,46,0.08)';
  el.style.border = type === 'ok' ? '1px solid rgba(0,160,80,0.3)' : '1px solid rgba(200,16,46,0.3)';
  el.style.color = type === 'ok' ? '#007a3d' : '#C8102E';
  el.textContent = text;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const PH_MOBILE_RE = /^(\+?63|0)9\d{9}$/;
const MIN_FILL_MS = 3000;          // bots submit instantly
const COOLDOWN_MS = 60 * 1000;     // one submission per minute per browser
const pageLoadedAt = Date.now();

// Strip control characters, cap length, and stop Google Sheets from treating input as a formula
function clean(value, max) {
  let v = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return v;
}
function isAllowedOption(select) {
  return [...select.options].some(o => o.value && o.value === select.value);
}
function lastSubmit() {
  try { return Number(sessionStorage.getItem('svcLastSubmit')) || 0; } catch (e) { return 0; }
}
function markSubmitted() {
  try { sessionStorage.setItem('svcLastSubmit', String(Date.now())); } catch (e) {}
}

// Shared checks; returns an error message or '' when the submission may proceed
function checkSubmission(prefix, fields) {
  if (document.getElementById(prefix + 'Company').value) return 'bot';
  if (Date.now() - pageLoadedAt < MIN_FILL_MS) return 'Please take a moment to review your details, then try again.';
  if (Date.now() - lastSubmit() < COOLDOWN_MS) return 'Thanks! We already received a request from you. Please wait a minute before sending another.';
  if (!fields.firstName || !fields.lastName || !fields.mobile || !fields.email) return 'Please fill in all required fields.';
  if (!EMAIL_RE.test(fields.email)) return 'Please enter a valid email address.';
  if (!PH_MOBILE_RE.test(fields.mobile.replace(/[\s()-]/g, ''))) return 'Please enter a valid PH mobile number (e.g. 0917 123 4567).';
  return '';
}

async function send(payload, btn, label, msgId, okText, resetIds) {
  btn.disabled = true; btn.textContent = 'Sending...'; btn.style.opacity = '0.7';
  try {
    await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers: {'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload) });
    markSubmitted();
    showMsg(msgId, 'ok', okText);
    resetIds.forEach(id => document.getElementById(id).value = '');
  } catch(e) {
    showMsg(msgId, 'err', 'Something went wrong. Please try again or call us directly.');
  }
  btn.disabled = false; btn.textContent = label; btn.style.opacity = '1';
}

// ── SUBMIT INQUIRY ──
document.getElementById('inqSubmit').addEventListener('click', e => {
  const get = id => document.getElementById(id);
  const fields = {
    firstName: clean(get('inqFirstName').value, 50),
    lastName:  clean(get('inqLastName').value, 50),
    mobile:    clean(get('inqMobile').value, 20),
    email:     clean(get('inqEmail').value, 100),
  };
  let err = checkSubmission('inq', fields);
  if (!err && (!isAllowedOption(get('inqVehicle')) || !isAllowedOption(get('inqDealership')))) err = 'Please select a vehicle and a dealership.';
  if (err === 'bot') return showMsg('inqMsg', 'ok', '✓ Inquiry submitted! A consultant will contact you within 24 hours.');
  if (err) return showMsg('inqMsg', 'err', err);
  send({ type:'inquiry', ...fields, vehicle: get('inqVehicle').value, dealership: get('inqDealership').value, message: clean(get('inqMessage').value, 1000) },
    e.currentTarget, 'Submit Inquiry', 'inqMsg', '✓ Inquiry submitted! A consultant will contact you within 24 hours.',
    ['inqFirstName','inqLastName','inqMobile','inqEmail','inqVehicle','inqDealership','inqMessage']);
});

// ── SUBMIT BOOKING ──
document.getElementById('svcSubmit').addEventListener('click', e => {
  const get = id => document.getElementById(id);
  const fields = {
    firstName: clean(get('svcFirstName').value, 50),
    lastName:  clean(get('svcLastName').value, 50),
    mobile:    clean(get('svcMobile').value, 20),
    email:     clean(get('svcEmail').value, 100),
  };
  const date = get('svcDate').value;
  let err = checkSubmission('svc', fields);
  if (!err && !isAllowedOption(get('svcBranch'))) err = 'Please select a branch.';
  if (!err && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < new Date().toISOString().slice(0, 10))) err = 'Please choose a preferred date from today onward.';
  if (err === 'bot') return showMsg('svcMsg', 'ok', '✓ Booking request received! A service advisor will confirm your slot within 24 hours.');
  if (err) return showMsg('svcMsg', 'err', err);
  const serviceType = [...document.querySelectorAll('.svc-chip.selected')].map(c => c.textContent.trim()).join(', ') || 'Not specified';
  send({ type:'booking', ...fields, branch: get('svcBranch').value, date, model: clean(get('svcModel').value, 60), serviceType, notes: clean(get('svcNotes').value, 1000) },
    e.currentTarget, 'Confirm Booking Request', 'svcMsg', '✓ Booking request received! A service advisor will confirm your slot within 24 hours.',
    ['svcFirstName','svcLastName','svcMobile','svcEmail','svcBranch','svcDate','svcModel','svcNotes']);
  document.querySelectorAll('.svc-chip.selected').forEach(c => c.classList.remove('selected'));
});
document.getElementById('svcDate').min = new Date().toISOString().slice(0, 10);

// ── SHOWROOM DATA ──
const MODELS = {
  almera: {
    name:'Almera', category:'Sedan', price:'₱1,099,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/almera_brochure.pdf',
    colors:[{name:'Cayenne Red (VE)',hex:'#A3141C'},{name:'Pearl White',hex:'#E6E6E3'},{name:'Gun Metallic',hex:'#5A5B5D'},{name:'Galaxy Black (VE)',hex:'#1E1E1F'}],
    specs:[{key:'Engine',val:'1.0L 3-Cyl Turbo Petrol'},{key:'Power',val:'100 PS'},{key:'Torque',val:'152 Nm'},{key:'Transmission',val:'CVT'},{key:'Fuel Tank',val:'35 L'},{key:'Variants',val:'VE · VL Turbo CVT'}],
    features:['NissanConnect Services: remote start, lock, SOS & car finder','Intelligent Around View Monitor & Blind Spot Warning','7" TFT meter, black leather with dark blue stitching','5-year / 150,000 km warranty (VL)'],
    angles:['Base Spec'],
    photos:['images/models/almera.webp']
  },
  primera: {
    name:'Primera EV', category:'Electric Sedan', price:'Coming Soon',
    brochure:'',
    colors:[{name:'Silver (as shown) · full palette TBA',hex:'#C3C6CC'}],
    specs:[{key:'Motor',val:'Single e-Motor'},{key:'Power',val:'218 PS'},{key:'Torque',val:'305 Nm'},{key:'Battery',val:'60 kWh LFP'},{key:'Range',val:'Approx. 500 km'},{key:'Drive',val:'FWD'}],
    features:['15.6" touchscreen + 10.25" digital cluster','ProPILOT driver assistance','Panoramic sunroof & 12-speaker audio','Power front seats with memory, 6 airbags'],
    angles:['Base Spec'],
    photos:['images/models/primera.webp']
  },
  livina: {
    name:'Livina', category:'7-Seater MPV', price:'₱1,214,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/livina_brochure.pdf',
    colors:[{name:'Royal Ruby Red',hex:'#9E1B22'},{name:'Diamond Pearl White',hex:'#F2F1EC'},{name:'Silver',hex:'#C4C7CA'},{name:'Moonstone Grey',hex:'#7A7C80'},{name:'Onyx Black',hex:'#1B1B1D'}],
    specs:[{key:'Engine',val:'1.5L DOHC Petrol'},{key:'Power',val:'105 PS'},{key:'Torque',val:'141 Nm'},{key:'Transmission',val:'4-Speed AT'},{key:'Seating',val:'7 Passengers'},{key:'Variants',val:'VE · VL'}],
    features:['Fold-flat 2nd row, 50:50 split 3rd row','Traction Control System','Hill Start Assist','Parking sensors (VE & VL)'],
    angles:['Base Spec'],
    photos:['images/models/livina.webp'],
    interiorPhoto:'images/models/livina-interior.jpg'
  },
  kicks: {
    name:'Kicks e-POWER', category:'All-New Crossover', price:'₱1,549,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/Kicks%20e-POWER%20Digital%20Brochure%20(without%20QR%20Code)_4267X5687%20px.pdf',
    colors:[{name:'Aquamarine Metallic',hex:'#1E7FA8'},{name:'Gun Metallic',hex:'#55595E'},{name:'Pearl White',hex:'#F2F1EC'},{name:'Moon Pearl Gray',hex:'#A9AEB5'}],
    specs:[{key:'System',val:'1.2L e-POWER'},{key:'Power',val:'136 PS'},{key:'Torque',val:'280 Nm'},{key:'Drive',val:'FWD'},{key:'Cargo',val:'470 L'},{key:'Variants',val:'VE · VL · LE Plus'}],
    features:['100% electric-motor driven, no charging needed','12.3" touchscreen, wireless CarPlay & Android Auto','ProPILOT (LE Plus) & NissanConnect Services','Black-roof two-tone and Moonstone leather on LE Plus'],
    angles:['Base Spec'],
    photos:['images/models/kicks.webp']
  },
  xtrail: {
    name:'X-Trail e-POWER', category:'SUV', price:'₱2,290,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/Nissan%20X-Trail%20e-POWER%20Digital%20Brochure.pdf',
    colors:[{name:'Cardinal Red Metallic',hex:'#8E1B24'},{name:'Stealth Pearl Gray',hex:'#4B4F54'},{name:'Everest White',hex:'#F4F4F2'},{name:'Sahara Dune Metallic',hex:'#B49A78'}],
    specs:[{key:'System',val:'1.5L VC-Turbo e-POWER'},{key:'Power',val:'204 PS'},{key:'Torque',val:'330 Nm'},{key:'Drive',val:'FWD'},{key:'Range',val:'Up to 1,039 km'},{key:'Seating',val:'5 Passengers'}],
    features:['Dual 12.3" screens, wireless CarPlay & Android Auto','Panoramic sunroof & hands-free power tailgate','3D Around View Monitor & Intelligent Rear View Mirror','Emergency Braking, Blind Spot Warning, Rear Cross Traffic Alert'],
    angles:['Base Spec'],
    photos:['images/models/xtrail-front.webp']
  },
  terra: {
    name:'Terra', category:'7-Seater SUV', price:'₱1,969,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/terra_brochure.pdf',
    colors:[{name:'Lunar Metallic Gray',hex:'#6B6F73'},{name:'Nebula Metallic Red',hex:'#8E1B24'},{name:'Forged Metallic Copper',hex:'#8A4A2B'},{name:'Galaxy Black',hex:'#18191B'},{name:'Brilliant Silver',hex:'#C4C7CA'},{name:'Aspen Pearl White',hex:'#F1F0EB'}],
    specs:[{key:'Engine',val:'2.5L YD25 Turbo Diesel'},{key:'Power',val:'190 PS'},{key:'Torque',val:'450 Nm'},{key:'Transmission',val:'7-Speed AT'},{key:'Drive',val:'4x2 / 4x4 (2H/4H/4L)'},{key:'Seating',val:'7 Passengers'}],
    features:['Intelligent Around View Monitor with Moving Object Detection','Intelligent Rear View Mirror & Blind Spot Warning','Emergency Braking & Lane Departure Warning','Variants: VE · VL · Sport · Sport VL, 5-year warranty'],
    angles:['Base Spec'],
    photos:['images/models/terra.webp']
  },
  navara: {
    name:'Navara', category:'Pick-up Truck', price:'₱1,240,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/navara_brochure.pdf',
    colors:[{name:'Forged Metallic Copper',hex:'#8A4A2B'},{name:'Fiery Red',hex:'#C1121F'},{name:'Aspen Pearl White',hex:'#F1F0EB'},{name:'Alpine White',hex:'#FFFFFF'},{name:'Stealth Pearl Gray',hex:'#4B4F54'},{name:'Lunar Metallic Gray',hex:'#6B6F73'},{name:'Galaxy Black',hex:'#18191B'},{name:'Brilliant Silver',hex:'#C4C7CA'}],
    specs:[{key:'Engine',val:'2.5L YD25 Turbo Diesel'},{key:'Power',val:'190 PS (AT) / 163 PS (MT)'},{key:'Torque',val:'450 Nm (AT) / 403 Nm (MT)'},{key:'Transmission',val:'7-Speed AT / 6-Speed MT'},{key:'Drive',val:'4x2 / 4x4'},{key:'Variants',val:'EL · VE · VL · Calibre-X · PRO-4X'}],
    features:['Multi-link rear suspension, dual-rate coil springs','9" touchscreen display audio','Intelligent Around View Monitor & Emergency Braking','Dual-zone climate (VE and up), 5-year warranty'],
    angles:['Base Spec','Calibre-X'],
    photos:['images/models/navara.webp','images/models/navara-calibre.webp'],
    interiorPhoto:'images/models/navara-interior.jpg'
  },
  navarapro: {
    name:'Navara Pro PHEV', category:'Plug-in Hybrid Pick-up', price:'Coming Soon',
    brochure:'',
    colors:[{name:'Yellow (as shown) · full palette TBA',hex:'#D9D23A'}],
    specs:[{key:'System',val:'1.5L Turbo PHEV'},{key:'Power',val:'Up to 408 PS'},{key:'Torque',val:'800 Nm'},{key:'Drive',val:'4WD'},{key:'EV Range',val:'Up to 131 km (NEDC)'},{key:'Variants',val:'VL · LE'}],
    features:['14.6" central display with up to 12 speakers','Design inspired by the legendary D21 Hardbody','Vehicle-to-Load (V2L) power outlets','Front & rear differential locks, Level 2 ADAS'],
    angles:['Base Spec'],
    photos:['images/models/navarapro-front.webp'],
    interiorPhoto:'images/models/navarapro-interior.jpg'
  },
  urvan: {
    name:'Urvan', category:'Van', price:'₱1,280,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/urvan_brochure.pdf',
    colors:[{name:'Pearl White',hex:'#F2F1EC'},{name:'Alpine White',hex:'#FFFFFF'},{name:'Brilliant Silver',hex:'#C4C7CA'},{name:'Gun Metallic',hex:'#55595E'},{name:'Granite Black',hex:'#1A1B1D'}],
    specs:[{key:'Engine',val:'2.5L YD25 Turbo Diesel'},{key:'Power',val:'129 PS'},{key:'Torque',val:'356 Nm'},{key:'Transmission',val:'5-Speed MT / AT'},{key:'Fuel Tank',val:'65 L'},{key:'Variants',val:'C · Standard · Premium · CX'}],
    features:['Seats up to 15 in the Premium variant','Blind Spot Warning & Vehicle Dynamic Control (AT)','Hill Start Assist (AT), driver & passenger airbags','Auto headlamps with High Beam Assist'],
    angles:['Base Spec'],
    photos:['images/models/urvan.webp']
  },
  patrol: {
    name:'Patrol', category:'Full-size SUV', price:'₱5,335,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/patrol_brochure.pdf',
    colors:[{name:'Everest White with Black Roof',hex:'#F3F3F0'},{name:'Gun Metallic with Black Roof',hex:'#55595E'},{name:'Everest White',hex:'#F8F8F6'},{name:'Granite Black',hex:'#121314'}],
    specs:[{key:'Engine',val:'3.5L Twin-Turbo V6'},{key:'Power',val:'431 PS'},{key:'Torque',val:'700 Nm'},{key:'Transmission',val:'9-Speed AT'},{key:'Drive',val:'4WD, 2-speed transfer'},{key:'Clearance',val:'244 mm'}],
    features:['Adaptive Air Suspension, a first in its segment','ProPILOT, 3D Around View Monitor & Invisible Hood View','12-speaker Klipsch Premium Audio','Dual rear displays (variant) & NissanConnect Services'],
    angles:['Base Spec'],
    photos:['images/models/patrol.webp'],
    interiorPhoto:'images/models/patrol-interior.jpg'
  },
  z: {
    name:'Z', category:'Sports Car', price:'₱3,988,000',
    brochure:'https://www-asia.nissan-cdn.net/content/dam/Nissan/ph/brochures/Z_brochure.pdf',
    colors:[{name:'Seiran Blue with Black Roof',hex:'#1F4FA8'},{name:'Ikazuchi Yellow with Black Roof',hex:'#F5C300'},{name:'Stealth Pearl Gray with Black Roof',hex:'#4B4F54'},{name:'Granite Black',hex:'#121314'}],
    specs:[{key:'Engine',val:'3.0L Twin-Turbo V6'},{key:'Power',val:'383 PS'},{key:'Torque',val:'475 Nm'},{key:'Transmission',val:'6-Speed MT / 9-Speed AT'},{key:'Drive',val:'RWD, Limited-slip'},{key:'Variants',val:'Premium MT · AT · NISMO'}],
    features:['SynchroRev Match (MT), Downshift Rev Matching (AT)','Carbon-fiber composite driveshaft','Intelligent Cruise Control & Emergency Braking','Blind Spot Warning & Rear Cross Traffic Alert'],
    angles:['Base Spec'],
    photos:['images/models/z.webp'],
    interiorPhoto:'images/models/z-interior.jpg'
  }
};

// ── VARIANT COMPARISON ──
// Source: Nissan Philippines price guide and official brochures. ✓ = included, — = not available.
const VARIANTS = {
  almera: {
    common: 'Both variants: 1.0L turbo (100 PS, 152 Nm), CVT, NissanConnect Services, push-button start, Forward Collision Warning.',
    cols: ['VE Turbo CVT', 'VL Turbo CVT'],
    rows: [
      ['Price', '₱1,099,000', '₱1,199,000'],
      ['Wheels', '15" alloy', '16" alloy'],
      ['Seats', 'Fabric', 'Black leather, dark blue stitching'],
      ['Apple CarPlay & Android Auto', 'Y (8" touchscreen)', 'Y (8" touchscreen)'],
      ['Steering wheel', 'Urethane', 'Leather-wrapped'],
      ['Meter', 'Standard', '7" TFT'],
      ['Blind Spot Warning & Rear Cross Traffic Alert', 'N', 'Y'],
      ['Lane Departure Warning & High Beam Assist', 'N', 'Y'],
      ['Tire pressure monitoring', 'N', 'Y'],
      ['Trunk space', '466 L', '474 L'],
      ['5-year / 150,000 km warranty', 'N', 'Y'],
    ],
  },
  livina: {
    common: 'Both variants: 1.5L petrol (105 PS, 141 Nm), 4-speed AT, 7 seats, 16" alloys, VDC, Traction Control, Hill Start Assist, reverse camera, parking sensors.',
    cols: ['VE AT', 'VL AT'],
    rows: [
      ['Price', '₱1,214,000', '₱1,274,000'],
      ['Seats', 'Brown fabric', 'Black leather'],
      ['Keyless entry', 'Remote', 'Intelligent Key'],
      ['Push-button start', 'N', 'Y'],
      ['Apple CarPlay & Android Auto', 'Y (9" touchscreen)', 'Y (9" touchscreen)'],
      ['Speakers', '4', '6'],
      ['Steering wheel', 'Urethane, audio controls', 'Leather, audio controls'],
      ['Meter', 'Mono-tone LCD', 'Color LCD'],
      ['Side mirrors', 'Body color, auto-fold', 'Chrome, auto-fold'],
      ['5-year warranty', 'N', 'Y'],
    ],
  },
  kicks: {
    common: 'All variants: 136 PS / 280 Nm e-POWER, 17" alloys, 6 airbags, Intelligent Cruise Control, Emergency Braking with pedestrian detection, Blind Spot Warning, Rear Cross Traffic Alert, 7" digital cluster, auto climate, remote engine start, 8-year e-POWER battery warranty.',
    cols: ['VE', 'VL', 'LE Plus'],
    rows: [
      ['Price', '₱1,549,000', '₱1,699,000', '₱1,799,000'],
      ['Driver seat', 'Manual 6-way', 'Power 6-way', 'Power 6-way'],
      ['Interior', 'Black & dark grey leather', 'Black & dark grey leather', 'Moonstone leather'],
      ['Apple CarPlay & Android Auto', 'Y (2-DIN touchscreen)', 'Wireless (12.3" touchscreen)', 'Wireless (12.3" touchscreen)'],
      ['Speakers', '4', '6', '6'],
      ['Camera', 'Reverse camera', 'Around View Monitor (MOD)', 'Around View Monitor (MOD)'],
      ['Rear parking sensors', 'N', 'Y', 'Y'],
      ['Daytime running lights', 'LED', 'Triple Arrow LED', 'Triple Arrow LED'],
      ['ProPILOT (Traffic Jam & Lane-Keep Assist)', 'N', 'N', 'Y'],
      ['NissanConnect Services', 'N', 'N', 'Y'],
      ['Intelligent Rear View Mirror', 'N', 'N', 'Y'],
      ['Rear Automatic Emergency Braking', 'N', 'N', 'Y'],
      ['Wireless charger', 'N', 'N', 'Y'],
      ['Black-roof two-tone paint', 'N', 'N', 'Y'],
    ],
  },
  terra: {
    common: 'All variants: 2.5L diesel (190 PS, 450 Nm), 7-speed AT, 7 seats, 18" alloys, 6 airbags, Around View Monitor with Moving Object Detection, Emergency Braking, Blind Spot Warning, Rear Cross Traffic Alert, cruise control.',
    cols: ['VE 4x2 AT', 'VL 4x2 AT', 'VL 4x4 AT', 'Sport 4x2 AT', 'Sport 4x4 AT'],
    rows: [
      ['Price', '₱1,969,000', '₱2,119,000', '₱2,409,000', '₱2,179,000', '₱2,469,000'],
      ['Drive', '4x2', '4x2', '4x4 (2H/4H/4L)', '4x2', '4x4 (2H/4H/4L)'],
      ['Rear diff lock, Hill Descent & off-road monitor', 'N', 'N', 'Y', 'N', 'Y'],
      ['Touchscreen', '8"', '9" with navigation', '9" with navigation', '9" with navigation', '9" with navigation'],
      ['Apple CarPlay & Android Auto', 'Y', 'Y', 'Y', 'Y', 'Y'],
      ['Speakers', '6', '8 BOSE', '8 BOSE', '8 BOSE', '8 BOSE'],
      ['Climate control', 'Manual, rear cooler', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto'],
      ['11" flip-down rear monitor', 'N', 'Y', 'Y', 'Y', 'Y'],
      ['Parking sensors', 'Rear', 'Front & rear', 'Front & rear', 'Front & rear', 'Front & rear'],
      ['Tire pressure monitoring', 'N', 'Y', 'Y', 'Y', 'Y'],
      ['Styling', 'Chrome accents', 'Chrome accents', 'Chrome accents', 'Gloss black, black alloys', 'Gloss black, black alloys'],
    ],
    note: 'Also available: Terra Sport VL 4x2 AT (₱2,209,000) and Sport VL 4x4 AT (₱2,499,000). Their equipment is not yet in the official brochure, so please ask a dealer.',
  },
  navara: {
    common: 'All variants: 2.5L YD25 turbo diesel, 5 seats, 1,470 mm cargo bed, 6 airbags, VDC with Trailer Stability Assist, Hill Start Assist, 5-year warranty. Automatics make 190 PS / 450 Nm; the EL and VE Calibre manuals make 163 PS / 403 Nm.',
    cols: ['EL 4x2 MT', 'VE Calibre 4x2 MT', 'VE Calibre 4x2 AT', 'VE 4x4 MT', 'VL Calibre 4x2 AT', 'Calibre-X 4x2 AT', 'VL 4x4 MT', 'VL 4x4 AT', 'PRO-4X 4x4 AT'],
    rows: [
      ['Price', '₱1,240,000', '₱1,595,000', '₱1,695,000', '₱1,750,000', '₱1,870,000', '₱1,965,000', '₱1,990,000', '₱2,090,000', '₱2,220,000'],
      ['Transmission', '6-speed MT', '6-speed MT', '7-speed AT', '6-speed MT', '7-speed AT', '7-speed AT', '6-speed MT', '7-speed AT', '7-speed AT'],
      ['Drive', '4x2', '4x2', '4x2', '4x4', '4x2', '4x2', '4x4', '4x4', '4x4'],
      ['Rear diff lock & Hill Descent', 'N', 'N', 'N', 'Y', 'N', 'N', 'Y', 'Y', 'Y'],
      ['Wheels', '17" steel', '17" alloy', '17" alloy', '17" alloy', '18" alloy', '17" gloss black alloy', '18" alloy', '18" alloy', '17" gloss black, all-terrain'],
      ['Headlamps', 'Halogen', 'Quad LED', 'Quad LED', 'Quad LED', 'Quad LED', 'Quad LED', 'Quad LED', 'Quad LED', 'Quad LED'],
      ['Touchscreen', '7"', '8"', '8"', '8"', '9" with navigation', '9" with navigation', '9" with navigation', '9" with navigation', '9" with navigation'],
      ['Apple CarPlay & Android Auto', 'N', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y'],
      ['Camera', 'N', 'Reverse camera', 'Reverse camera', 'Reverse camera', 'Around View (MOD)', 'Around View (MOD)', 'Around View + off-road', 'Around View + off-road', 'Around View + off-road'],
      ['Emergency Braking & Forward Collision Warning', 'N', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y'],
      ['Blind Spot Warning & Rear Cross Traffic Alert', 'N', 'N', 'N', 'N', 'Y', 'Y', 'Y', 'Y', 'Y'],
      ['Climate control', 'Manual', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto', 'Dual-zone auto'],
      ['Seats', 'Fabric', 'Fabric', 'Fabric', 'Fabric', 'Leather, power driver', 'Leather, power driver', 'Leather, power driver', 'Leather, power driver', 'Leather with PRO-4X stitching'],
      ['Push-button start & rear parking sensors', 'N', 'N', 'N', 'N', 'Y', 'Y', 'Y', 'Y', 'Y'],
    ],
  },
  urvan: {
    common: 'All variants: 2.5L YD25 diesel (129 PS, 356 Nm), Vehicle Dynamic Control, High Beam Assist, automatic headlamps, front and rear air-conditioning.',
    cols: ['C MT', 'Standard MT', 'Standard Plus MT', 'CX MT', 'CX AT', 'Premium MT', 'Premium AT'],
    rows: [
      ['Price', '₱1,280,000', '₱1,570,000', '₱1,580,000', '₱1,820,000', '₱1,880,000', '₱2,105,000', '₱2,165,000'],
      ['Transmission', '5-speed MT', '5-speed MT', '5-speed MT', '5-speed MT', '5-speed AT', '5-speed MT', '5-speed AT'],
      ['Body', 'Cargo, 5,080 mm', 'Standard roof, 4,695 mm', 'Standard roof, 4,695 mm', 'High roof van, 5,230 mm', 'High roof van, 5,230 mm', 'High roof, 5,230 mm', 'High roof, 5,230 mm'],
      ['Rear seating', 'None (cargo)', 'Benches + jump seats', 'Bench + side-facing benches', 'None (van)', 'None (van)', '4 rows, up to 15 seats', '4 rows, up to 15 seats'],
      ['Airbags', '2', '2', '2', '6', '6', '6', '6'],
      ['Hill Start Assist', 'N', 'N', 'N', 'N', 'Y', 'N', 'Y'],
      ['Apple CarPlay & Android Auto', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
      ['Audio', '1-DIN, 2 speakers', '1-DIN, 2 speakers', '1-DIN, 2 speakers', '2-DIN CD, 4 speakers', '2-DIN CD, 4 speakers', '2-DIN CD, 4 speakers', '2-DIN CD, 4 speakers'],
      ['Rear A/C vents', '4', '12', '12', '14', '14', '14', '14'],
      ['Remote keyless entry & LED fog lamps', 'N', 'N', 'N', 'Y', 'Y', 'Y', 'Y'],
      ['Payload', '1,340 kg', '1,390 kg', '1,390 kg', '1,344 kg', '1,324 kg', '1,161 kg', '1,145 kg'],
    ],
    note: 'The C and CX variants appear as "Cargo" and "GX Van" in the official brochure.',
  },
  patrol: {
    common: 'Both variants: 3.5L twin-turbo V6 (431 PS, 700 Nm), 9-speed AT, intelligent 4WD, Adaptive Air Suspension, ProPILOT, 3D Around View Monitor with Invisible Hood View, 14.3" touchscreen, 12-speaker Klipsch audio, panoramic sunroof, 8 seats.',
    cols: ['Patrol', 'Patrol with Rear Display'],
    rows: [
      ['Price', '₱5,335,000', '₱5,385,000'],
      ['Apple CarPlay & Android Auto', 'Wireless', 'Wireless'],
      ['Rear entertainment (dual 12.8" screens, HDMI, Miracast)', 'N', 'Y'],
    ],
  },
  z: {
    common: 'All variants: 3.0L twin-turbo V6, rear-wheel drive, mechanical limited-slip differential, 19" forged RAYS wheels, BOSE 8-speaker audio, Intelligent Cruise Control, Emergency Braking, Blind Spot Warning.',
    cols: ['Premium MT', 'Premium AT', 'NISMO AT'],
    rows: [
      ['Price', '₱3,988,000', '₱3,988,000', '₱4,688,000'],
      ['Power / torque', '383 PS / 475 Nm', '383 PS / 475 Nm', '420 PS / 520 Nm'],
      ['Transmission', '6-speed manual, EXEDY clutch', '9-speed AT, paddle shift', 'NISMO-tuned 9-speed AT, paddle shift'],
      ['Rev matching', 'SynchroRev Match', 'Downshift rev matching', 'Downshift rev matching'],
      ['Apple CarPlay & Android Auto', 'Y (8" touchscreen)', 'Y (8" touchscreen)', 'Y (8" touchscreen)'],
      ['Carbon-fiber driveshaft', 'Y', 'N', 'N'],
      ['Seats', 'Leather, synthetic-suede inserts', 'Leather, synthetic-suede inserts', 'NISMO Recaro, Alcantara inserts'],
      ['Brakes', 'Nissan Sport (14" front)', 'Nissan Sport (14" front)', 'NISMO/Akebono (15" front)'],
      ['Curb weight', '1,600 kg', '1,647 kg', '1,675 kg'],
    ],
  },
};

function openCompare() {
  const v = VARIANTS[currentModel];
  if (!v) return;
  document.getElementById('vcTitle').textContent = MODELS[currentModel].name;
  document.getElementById('vcCommon').textContent = v.common;
  const note = document.getElementById('vcNote');
  note.textContent = v.note || '';
  note.style.display = v.note ? '' : 'none';

  const table = document.getElementById('vcTable');
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  head.appendChild(document.createElement('th'));
  v.cols.forEach(c => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = c; head.appendChild(th); });
  const body = table.createTBody();
  v.rows.forEach(([label, ...cells]) => {
    const tr = body.insertRow();
    if (label === 'Price') tr.className = 'vc-price';
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = label; tr.appendChild(th);
    cells.forEach(val => {
      const td = tr.insertCell();
      const yesWithDetail = val.startsWith('Y (');
      td.textContent = val === 'Y' ? '✓' : val === 'N' ? '—' : yesWithDetail ? '✓ ' + val.slice(2) : val;
      if (val === 'Y' || yesWithDetail || val.startsWith('Wireless')) td.className = 'vc-yes';
      if (val === 'N') td.className = 'vc-no';
    });
  });
  document.getElementById('svCompare').showModal();
}
const compareDialog = document.getElementById('svCompare');
document.getElementById('svCompareBtn').addEventListener('click', openCompare);
document.getElementById('vcClose').addEventListener('click', () => compareDialog.close());
compareDialog.addEventListener('click', e => { if (e.target === compareDialog) compareDialog.close(); });

// ── SHOWROOM STATE ──
let currentModel = 'almera';
let currentView = 'exterior';
let currentImageIdx = 0;
let currentColorIdx = 0;

// Generic SVG silhouette (used as fallback for all models)
function buildCarSVG(type, colorHex) {
  const g = `<linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colorHex}" stop-opacity="1"/><stop offset="100%" stop-color="${colorHex}" stop-opacity="0.65"/></linearGradient><linearGradient id="glassG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a0d8ef" stop-opacity="0.7"/><stop offset="100%" stop-color="#4aa3cc" stop-opacity="0.4"/></linearGradient>`;
  const shapes = {
    sedan: `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" class="car-svg"><defs>${g}</defs><rect x="50" y="110" width="460" height="72" rx="6" fill="url(#bodyG)"/><path d="M130,110 L170,60 L380,60 L420,110 Z" fill="url(#bodyG)"/><path d="M175,108 L200,66 L270,66 L295,108 Z" fill="url(#glassG)"/><path d="M302,108 L308,66 L368,66 L393,108 Z" fill="url(#glassG)"/><rect x="56" y="118" width="34" height="14" rx="3" fill="#fffbe6" opacity="0.9"/><rect x="470" y="116" width="26" height="16" rx="3" fill="#C8102E" opacity="0.85"/><circle cx="158" cy="186" r="28" fill="#1a1a1a"/><circle cx="158" cy="186" r="17" fill="#333"/><circle cx="402" cy="186" r="28" fill="#1a1a1a"/><circle cx="402" cy="186" r="17" fill="#333"/><ellipse cx="280" cy="216" rx="218" ry="8" fill="rgba(0,0,0,0.4)"/></svg>`,
    suv: `<svg viewBox="0 0 560 240" xmlns="http://www.w3.org/2000/svg" class="car-svg"><defs>${g}</defs><rect x="60" y="100" width="440" height="88" rx="8" fill="url(#bodyG)"/><path d="M110,100 L145,52 L390,52 L430,100 Z" fill="url(#bodyG)"/><path d="M150,98 L178,60 L260,60 L280,98 Z" fill="url(#glassG)"/><path d="M288,98 L290,60 L370,60 L388,98 Z" fill="url(#glassG)"/><rect x="68" y="110" width="38" height="18" rx="4" fill="#fffbe6" opacity="0.9"/><rect x="452" y="108" width="28" height="20" rx="4" fill="#C8102E" opacity="0.85"/><circle cx="165" cy="192" r="35" fill="#1a1a1a"/><circle cx="165" cy="192" r="22" fill="#333"/><circle cx="395" cy="192" r="35" fill="#1a1a1a"/><circle cx="395" cy="192" r="22" fill="#333"/><ellipse cx="280" cy="228" rx="225" ry="10" fill="rgba(0,0,0,0.4)"/></svg>`,
    truck: `<svg viewBox="0 0 560 240" xmlns="http://www.w3.org/2000/svg" class="car-svg"><defs>${g}</defs><rect x="310" y="100" width="190" height="85" rx="4" fill="url(#bodyG)"/><rect x="100" y="90" width="230" height="95" rx="6" fill="url(#bodyG)"/><path d="M130,90 L160,50 L270,50 L320,90 Z" fill="url(#bodyG)"/><path d="M155,88 L178,56 L248,56 L272,88 Z" fill="url(#glassG)"/><rect x="60" y="130" width="50" height="30" rx="4" fill="${colorHex}"/><rect x="65" y="115" width="30" height="16" rx="3" fill="#fffbe6" opacity="0.9"/><rect x="460" y="110" width="24" height="18" rx="3" fill="#C8102E" opacity="0.85"/><circle cx="170" cy="188" r="32" fill="#1a1a1a"/><circle cx="170" cy="188" r="20" fill="#333"/><circle cx="400" cy="188" r="32" fill="#1a1a1a"/><circle cx="400" cy="188" r="20" fill="#333"/><ellipse cx="285" cy="222" rx="220" ry="10" fill="rgba(0,0,0,0.4)"/></svg>`,
    van: `<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg" class="car-svg"><defs>${g}</defs><rect x="50" y="80" width="460" height="115" rx="4" fill="url(#bodyG)"/><rect x="90" y="50" width="360" height="32" rx="3" fill="url(#bodyG)"/><rect x="100" y="53" width="145" height="26" rx="2" fill="url(#glassG)"/><rect x="255" y="53" width="145" height="26" rx="2" fill="url(#glassG)"/><rect x="55" y="95" width="38" height="20" rx="3" fill="#fffbe6" opacity="0.9"/><rect x="465" y="93" width="34" height="22" rx="3" fill="#C8102E" opacity="0.85"/><circle cx="155" cy="200" r="36" fill="#1a1a1a"/><circle cx="155" cy="200" r="22" fill="#333"/><circle cx="405" cy="200" r="36" fill="#1a1a1a"/><circle cx="405" cy="200" r="22" fill="#333"/><ellipse cx="280" cy="237" rx="228" ry="11" fill="rgba(0,0,0,0.45)"/></svg>`,
    sports: `<svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg" class="car-svg"><defs>${g}</defs><rect x="55" y="115" width="450" height="62" rx="4" fill="url(#bodyG)"/><path d="M115,115 L175,58 L390,58 L450,115 Z" fill="url(#bodyG)"/><path d="M180,113 L215,66 L295,66 L320,113 Z" fill="url(#glassG)"/><path d="M328,113 L332,66 L385,66 L405,113 Z" fill="url(#glassG)"/><rect x="60" y="122" width="35" height="12" rx="3" fill="#fffbe6" opacity="0.9"/><rect x="465" y="120" width="28" height="14" rx="3" fill="#C8102E" opacity="0.85"/><circle cx="160" cy="180" r="26" fill="#1a1a1a"/><circle cx="160" cy="180" r="16" fill="#333"/><circle cx="400" cy="180" r="26" fill="#1a1a1a"/><circle cx="400" cy="180" r="16" fill="#333"/><ellipse cx="280" cy="198" rx="220" ry="8" fill="rgba(0,0,0,0.4)"/></svg>`
  };
  const map = { almera:'sedan', primera:'sedan', livina:'suv', kicks:'suv', xtrail:'suv', terra:'suv', navara:'truck', navarapro:'truck', urvan:'van', patrol:'suv', z:'sports' };
  return shapes[map[type]] || shapes.suv;
}


function renderShowroom() {
  const m = MODELS[currentModel];
  const hasInterior = !!m.interiorPhoto;
  document.querySelector('.sv-view-toggle').style.display = hasInterior ? '' : 'none';
  if (!hasInterior && currentView === 'interior') {
    currentView = 'exterior';
    document.querySelectorAll('.sv-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'exterior'));
  }
  document.getElementById('svModelName').textContent = m.name;
  document.getElementById('svModelCat').textContent = m.category;
  document.getElementById('svModelPrice').textContent = m.price === 'Coming Soon' ? 'Coming Soon' : `Starting at ${m.price}`;
  const brochure = document.getElementById('svBrochure');
  brochure.href = m.brochure || '#';
  brochure.style.display = m.brochure ? '' : 'none';
  document.getElementById('svCompareBtn').style.display = VARIANTS[currentModel] ? '' : 'none';

  // Colors
  document.getElementById('svColors').innerHTML = m.colors.map((c,i) =>
    `<div class="sv-color-swatch ${i===currentColorIdx?'active':''}" style="background:${c.hex};box-shadow:0 2px 8px ${c.hex}55;" data-idx="${i}" title="${c.name}"></div>`
  ).join('');
  document.getElementById('svColorName').textContent = m.colors[currentColorIdx].name;
  document.getElementById('svColors').querySelectorAll('.sv-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => { currentColorIdx = +sw.dataset.idx; renderShowroom(); });
  });

  // Specs
  document.getElementById('svSpecs').innerHTML = m.specs.map(s =>
    `<div class="sv-spec-row"><span class="sv-spec-key">${s.key}</span><span class="sv-spec-val">${s.val}</span></div>`
  ).join('');
  document.getElementById('svFeatures').innerHTML = m.features.map(f => `<li>${f}</li>`).join('');

  renderViewer();
}

function renderViewer() {
  const m = MODELS[currentModel];
  const colorHex = m.colors[currentColorIdx].hex;
  const wrap = document.getElementById('svImageWrap');
  const thumbs = document.getElementById('svThumbs');
  const badge = document.getElementById('svViewBadge');

  if (currentView === 'exterior') {
    if (currentImageIdx >= m.angles.length) currentImageIdx = 0;

    wrap.innerHTML = m.photos ? m.angles.map((angle, i) =>
      `<div class="sv-image ${i===currentImageIdx?'active':''}"><div class="car-placeholder"><img class="sv-cutout" src="${m.photos[i]}" alt="${m.name} · ${angle}"></div></div>`
    ).join('') : m.angles.map((angle, i) => {
      const imgHtml = (m.thumb && i === 0)
        ? `<img src="${m.thumb}" alt="${m.name}" data-svg="${currentModel}" data-color="${colorHex}" class="sv-cutout">`
        : buildCarSVG(currentModel, colorHex);
      return `<div class="sv-image ${i===currentImageIdx?'active':''}">\
<div class="car-placeholder">${imgHtml}\
<div style="margin-top:8px;font-family:'Nissan Brand',sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.2);">${angle}</div>\
</div></div>`;
    }).join('');

    // Attach fallback after DOM insert
    wrap.querySelectorAll('img[data-svg]').forEach(img => {
      img.addEventListener('error', function() {
        const svg = buildCarSVG(this.dataset.svg, this.dataset.color);
        this.parentNode.innerHTML = svg + this.parentNode.innerHTML.split('>').slice(-2).join('>');
        this.remove();
      });
    });

    thumbs.innerHTML = m.angles.map((a,i) =>
      `<div class="sv-thumb ${i===currentImageIdx?'active':''}" data-idx="${i}">${a.split(' ')[0]}</div>`
    ).join('');
    thumbs.querySelectorAll('.sv-thumb').forEach(t => t.addEventListener('click', () => { currentImageIdx=+t.dataset.idx; renderViewer(); }));
    badge.textContent = `Exterior · ${m.angles[currentImageIdx]}`;

  } else if (m.interiorPhoto) {
    wrap.innerHTML = `<div class="sv-image sv-photo active"><img src="${m.interiorPhoto}" alt="${m.name} · Interior"></div>`;
    thumbs.innerHTML = '';
    badge.textContent = 'Interior · Cabin';
  }
}

// Model tabs
const MODEL_ORDER = [...document.querySelectorAll('#modelTabs .model-tab')].map(t => t.dataset.model);

function selectModel(key, imageIdx = 0) {
  document.querySelectorAll('.model-tab').forEach(t => {
    const active = t.dataset.model === key;
    t.classList.toggle('active', active);
    if (active) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  currentModel = key;
  currentColorIdx = 0; currentImageIdx = imageIdx;
  renderShowroom();
}
document.querySelectorAll('#modelTabs .model-tab').forEach(tab => tab.addEventListener('click', () => selectModel(tab.dataset.model)));

// View toggle
document.querySelectorAll('.sv-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sv-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    currentImageIdx = 0;
    renderViewer();
  });
});

// Arrows: step through the current model's photos, then on to the neighbouring model.
// In the interior view, step between models that have an interior photo.
function stepShowroom(dir) {
  const count = MODELS[currentModel].angles.length;
  if (currentView === 'exterior' && currentImageIdx + dir >= 0 && currentImageIdx + dir < count) {
    currentImageIdx += dir;
    return renderViewer();
  }
  const pool = currentView === 'interior' ? MODEL_ORDER.filter(k => MODELS[k].interiorPhoto) : MODEL_ORDER;
  const next = pool[(pool.indexOf(currentModel) + dir + pool.length) % pool.length];
  selectModel(next, currentView === 'exterior' && dir < 0 ? MODELS[next].angles.length - 1 : 0);
}
document.getElementById('svPrev').addEventListener('click', () => stepShowroom(-1));
document.getElementById('svNext').addEventListener('click', () => stepShowroom(1));

// Keep the showroom the same height for every model so the car doesn't jump when switching:
// measure each model's info panel once and lock the panel to the tallest one.
function lockShowroomHeight() {
  const panel = document.querySelector('.sv-panel');
  const saved = [currentModel, currentView, currentImageIdx, currentColorIdx];
  panel.style.minHeight = '';
  let tallest = 0;
  for (const key of MODEL_ORDER) {
    currentModel = key; currentView = 'exterior';
    renderShowroom();
    tallest = Math.max(tallest, panel.offsetHeight);
  }
  [currentModel, currentView, currentImageIdx, currentColorIdx] = saved;
  renderShowroom();
  panel.style.minHeight = tallest + 'px';
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(lockShowroomHeight, 200); });
document.fonts.ready.then(lockShowroomHeight);

renderShowroom();
