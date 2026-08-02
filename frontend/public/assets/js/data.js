/* ==========================================================================
   PanditConnect — data layer + icon set
   All content lives here so pages stay presentational. Swap this file for
   real API calls (fetch) when the backend is ready — the shape is the contract.
   ========================================================================== */

window.PC = window.PC || {};

/* ------------------------------------------------------------------ icons --
   Line-art SVG set (stroke = currentColor) so gold theming is automatic.
   Usage: PC.icon('map-pin')  /  PC.icon('star', {fill:true, size:20})
---------------------------------------------------------------------------- */
PC.iconPaths = {
  'search': '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
  'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  'phone': '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/>',
  'whatsapp': '<path d="M20.5 3.5A11 11 0 003.2 17L2 22l5.1-1.2A11 11 0 1020.5 3.5z"/><path d="M8.6 8.2c.3-.6 1.2-.5 1.5.1l.6 1.3c.2.4.1.9-.2 1.2l-.4.4a6.6 6.6 0 002.9 2.9l.4-.4c.3-.3.8-.4 1.2-.2l1.3.6c.6.3.7 1.2.1 1.5-2.2 1.2-5.1-.4-6.6-1.9s-3.1-4.4-1.9-6.6z"/>',
  'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2.5 6l9.5 7 9.5-7"/>',
  'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  'users': '<circle cx="9" cy="8" r="3.6"/><path d="M2 21c0-4 3.2-6.4 7-6.4s7 2.4 7 6.4"/><path d="M17 4.4a3.6 3.6 0 010 7.2M18.4 14.8c2.2.8 3.6 2.8 3.6 5.4"/>',
  'star': '<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z"/>',
  'heart': '<path d="M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6A4.6 4.6 0 016.6 3c1.9 0 3.7 1 4.4 2.4h2C13.7 4 15.5 3 17.4 3A4.6 4.6 0 0122 7.6c0 3.8-3.4 6.9-8.6 11.6z"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.4l2.4 2.4 4.6-5.2"/>',
  // solid scalloped badge with a knocked-out tick — the gold "verified" mark
  'verified': '<path d="M12 2.4l2.4 1.8 3-.2 1 2.8 2.4 1.7-1 2.9 1 2.9-2.4 1.7-1 2.8-3-.2L12 21.6l-2.4-1.8-3 .2-1-2.8L3.2 15.7l1-2.9-1-2.9 2.4-1.7 1-2.8 3 .2z" fill="currentColor" stroke="none"/><path d="M8.5 12.2l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  'check': '<path d="M4.5 12.5l5 5L20 7"/>',
  'shield-check': '<path d="M12 2.5l8 3v6c0 5-3.4 8.8-8 10.2C7.4 20.3 4 16.5 4 11.5v-6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'menu': '<path d="M3 6h18M3 12h18M3 18h18"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chevron-left': '<path d="M14.5 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
  'home': '<path d="M3.5 10.5L12 3.5l8.5 7V20a1 1 0 01-1 1h-15a1 1 0 01-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  'temple': '<path d="M12 2.5l3 4.5H9zM6 7h12l1.5 4H4.5zM5 11h14v10H5z"/><path d="M10.5 21v-5a1.5 1.5 0 013 0v5"/>',
  'diya': '<path d="M4 14h16c0 3.3-3.6 5.5-8 5.5S4 17.3 4 14z"/><path d="M12 13c1.8-1.4 1.8-3.6 0-5.5-1.8 1.9-1.8 4.1 0 5.5z"/>',
  'kalash': '<path d="M7.5 11c-.9 2-.9 4.3 0 6.1A4.7 4.7 0 0016.5 17c.9-1.8.9-4.1 0-6.1z"/><path d="M5.8 11h12.4"/><circle cx="12" cy="6.9" r="2.2"/><path d="M9.8 9.1c-1.4-.4-2.3-1.3-2.6-2.6 1.4.1 2.4.7 3 1.8M14.2 9.1c1.4-.4 2.3-1.3 2.6-2.6-1.4.1-2.4.7-3 1.8"/>',
  'om': '<path d="M8.6 9.4a3.2 3.2 0 100 6.4c2.6 0 3.6-2.4 3.6-4.6M12.2 11.2c2 0 3.4 1.6 3.4 3.4a3 3 0 01-3 3c-2 0-3-1.4-3-3M16 8.4c1.2 0 2 .8 2 2M14.6 4.6c1 .6 1.4 1.6 1.4 2.6"/>',
  'trishul': '<path d="M12 3v18M12 3l-3 3M12 3l3 3M6 7v5a6 6 0 0012 0V7"/>',
  'flame': '<path d="M12 21c3.9 0 6-2.4 6-5.5 0-4.5-6-6.5-4.5-11C10 5.5 6 8.5 6 15.5 6 18.6 8.1 21 12 21z"/><path d="M12 21c-1.8 0-2.8-1.2-2.8-2.8 0-2.2 2.8-3 2-5.4 1.6 1.2 3.6 2.6 3.6 5.4 0 1.6-1 2.8-2.8 2.8z"/>',
  'sparkles': '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 14l.6 1.6L7.2 16l-1.6.6L5 18.2l-.6-1.6L2.8 16l1.6-.4z"/>',
  'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 21 12 21 8.2 15.5 8.2 12 9.5 5.5 12 3z"/>',
  'video': '<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M15.5 10.5L21.5 7v10l-6-3.5z"/>',
  'play': '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  'message-circle': '<path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.3 9.3 0 01-3.7-.7L3 21l1.8-4.8A8.4 8.4 0 0112 3.1a8.4 8.4 0 019 8.4z"/>',
  'book-open': '<path d="M12 6.5C10.5 5 8.5 4.3 4 4.3V18c4.5 0 6.5.7 8 2.2 1.5-1.5 3.5-2.2 8-2.2V4.3c-4.5 0-6.5.7-8 2.2z"/><path d="M12 6.5v13.7"/>',
  'newspaper': '<path d="M4 5h13v15H4z"/><path d="M17 9h3v9a2 2 0 01-3 1.7"/><path d="M7 9h7M7 12.5h7M7 16h4"/>',
  'map': '<path d="M9 3.5L3 6v14.5l6-2.5 6 2.5 6-2.5V3.5L15 6z"/><path d="M9 3.5V18M15 6v14.5"/>',
  'layout-dashboard': '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  'bar-chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  'trending-up': '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  'eye': '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'bell': '<path d="M18 15V10a6 6 0 10-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
  'award': '<circle cx="12" cy="9" r="6"/><path d="M8.5 14.5L7 22l5-2.5 5 2.5-1.5-7.5"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 01-2.8-2.8l.1-.1A1.7 1.7 0 003.5 15a2 2 0 010-4h.2a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 012.8-2.8l.1.1A1.7 1.7 0 0011 4.1V4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.1a2 2 0 010 4h-.2"/>',
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  'share': '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4"/>',
  'qr-code': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2M19 14h2"/>',
  'filter': '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  'sliders': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 4h13l3.5 8v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z"/>',
  'download': '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
  'sun': '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  'moon': '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 18M20 6L8.5 16.5"/>',
  'rings': '<circle cx="9" cy="14" r="6"/><circle cx="16" cy="14" r="6"/><path d="M9 8V4M16 8V4"/>',
  'baby': '<circle cx="12" cy="9" r="5"/><path d="M9.5 8.5h.01M14.5 8.5h.01M10 11.5c1.2 1 2.8 1 4 0"/><path d="M6 21c0-3.3 2.7-5 6-5s6 1.7 6 5"/>',
  'facebook': '<path d="M15 3h-2.5A4.5 4.5 0 008 7.5V10H5.5v3.5H8V21h3.5v-7.5H14l.5-3.5h-3V7.8c0-.7.4-1.3 1.2-1.3H15z"/>',
  'instagram': '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  'youtube': '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.5l5 2.5-5 2.5z"/>',
  'twitter': '<path d="M21 5.4c-.7.5-1.5.8-2.3 1a3.7 3.7 0 00-6.3 2.5v.8A10.5 10.5 0 014 5.8s-4 9 5 13c-2 1.3-4.4 1.8-6.8 1.3 9.4 3 15.8-2.9 15.8-10.6v-.6c.8-.8 1.5-1.7 2-2.5z"/>',
  'linkedin': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7.2h.01M11.5 17v-4a2.5 2.5 0 015 0v4"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  'briefcase': '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M2.5 12h19"/>',
  'send': '<path d="M21 3L10.5 13.5M21 3l-7 18-3.5-7.5L3 10z"/>',
  'help-circle': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>',
  'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  'lotus': '<path d="M12 4c2 3 2 6 0 9-2-3-2-6 0-9z"/><path d="M12 13c-3-2-6-1.5-8 1 3 2 6 2 8-1zM12 13c3-2 6-1.5 8 1-3 2-6 2-8-1z"/><path d="M12 13c-1.5 3-5 5-8 5 2 2 6 2.5 8-5zM12 13c1.5 3 5 5 8 5-2 2-6 2.5-8-5z"/>',
};

PC.icon = function (name, opts) {
  opts = opts || {};
  var p = PC.iconPaths[name] || PC.iconPaths['info'];
  var size = opts.size || 24;
  var fill = opts.fill ? 'currentColor' : 'none';
  var stroke = opts.fill ? 'none' : 'currentColor';
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="' + fill +
    '" stroke="' + stroke + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    p + '</svg>';
};

/* ---------------------------------------------------------------- taxonomy */
PC.cities = ['Varanasi', 'Ujjain', 'Haridwar', 'Mathura', 'Ayodhya', 'Tirupati', 'Puri', 'Madurai', 'Nashik', 'Dwarka', 'Amritsar', 'Guwahati', 'Mumbai', 'Delhi', 'Jaipur'];
PC.states = ['Uttar Pradesh', 'Madhya Pradesh', 'Uttarakhand', 'Andhra Pradesh', 'Odisha', 'Tamil Nadu', 'Maharashtra', 'Gujarat', 'Punjab', 'Assam', 'Delhi', 'Rajasthan'];
PC.languages = ['Hindi', 'English', 'Sanskrit', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati',
  'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Assamese', 'Bhojpuri', 'Braj', 'Garhwali', 'Marwari'];

/* ---------------------------------------------------------------- services
   category: daily | life | festival | shanti
---------------------------------------------------------------------------- */
PC.services = [
  { id: 'griha-pravesh', name: 'Griha Pravesh', icon: 'home', cat: 'life', tag: 'New home inauguration', dur: '3–4 hours', pandits: 186, desc: 'Vastu Shanti and Griha Pravesh puja performed before entering a new home, invoking Ganesh, Vastu Purush and the nine planets for peace and prosperity.', samagri: ['Kalash with copper vessel', 'Coconut with husk', 'Mango leaves', 'Roli, haldi, akshat', 'Cow ghee & camphor', 'Havan samagri 500g', 'Navgrah samidha', 'Red cloth (1m)', 'Panchamrit ingredients', 'Fresh flowers & garland'] },
  { id: 'satyanarayan-katha', name: 'Satyanarayan Katha', icon: 'book-open', cat: 'daily', tag: 'Blessings and prosperity', dur: '2–3 hours', pandits: 214, desc: 'Recitation of the Shri Satyanarayan Vrat Katha in five chapters, traditionally performed on Purnima or after a wish is fulfilled.', samagri: ['Banana leaves & stem', 'Sapatha (wheat flour, sugar, ghee) for prasad', 'Panchamrit', 'Tulsi leaves', 'Betel leaves & nuts', 'Kalash & coconut', 'Yellow cloth', 'Fruits (5 varieties)'] },
  { id: 'havan-yagna', name: 'Havan / Yagna', icon: 'flame', cat: 'daily', tag: 'Purification ritual', dur: '2–5 hours', pandits: 248, desc: 'Fire ritual with Vedic mantra offerings for purification of space and mind. Available as Ganesh, Navgrah, Rudra or Chandi havan.', samagri: ['Havan kund', 'Mango wood samidha 2kg', 'Havan samagri 1kg', 'Cow ghee 500g', 'Camphor & kapoor', 'Black sesame & barley', 'Guggul & loban', 'Purnahuti coconut'] },
  { id: 'wedding', name: 'Wedding Ceremony', icon: 'rings', cat: 'life', tag: 'Traditional Hindu marriage', dur: '4–6 hours', pandits: 172, desc: 'Complete Vivah Sanskar — Ganesh puja, Kanyadaan, Panigrahan, Saptapadi and Sindoor daan, performed per your family tradition (Gotra-specific).', samagri: ['Mandap samagri set', 'Havan kund & samidha', 'Mangalsutra & sindoor', 'Varmala (2)', 'Kalash (4)', 'Ganesh-Gauri idols', 'Red & yellow cloth', 'Puffed rice (laja) 1kg'] },
  { id: 'mundan', name: 'Mundan Ceremony', icon: 'scissors', cat: 'life', tag: 'First haircut ritual for kids', dur: '1–2 hours', pandits: 158, desc: 'Chudakarana Sanskar — the child\'s first tonsure, performed at a temple or home on an auspicious muhurat for health and long life.', samagri: ['Kalash & coconut', 'Ganga jal', 'Silver razor (or barber kit)', 'Turmeric paste', 'Sweet prasad', 'New clothes for child', 'Flowers & akshat'] },
  { id: 'sunderkand', name: 'Sunderkand Path', icon: 'book-open', cat: 'daily', tag: 'Devotional reciting of Sunderkand', dur: '3 hours', pandits: 196, desc: 'Melodious recitation of the Sunderkand from Ramcharitmanas with dholak and manjira — a favourite for removing obstacles and fear.', samagri: ['Hanuman ji idol/picture', 'Sindoor & chameli oil', 'Boondi laddoo prasad', 'Red flag & cloth', 'Diya & ghee', 'Tulsi mala', 'Banana & jaggery'] },
  { id: 'rudrabhishek', name: 'Rudrabhishek', icon: 'trishul', cat: 'shanti', tag: 'Rudra mantra chanting for Shiva', dur: '2–3 hours', pandits: 164, desc: 'Abhishek of the Shivling with panchamrit while chanting the Rudri path — highly recommended on Mondays, Pradosh and Shivratri.', samagri: ['Panchamrit (milk, curd, ghee, honey, sugar)', 'Bel patra 108', 'Dhatura & bhang', 'White flowers', 'Gangajal', 'Bhasma & chandan', 'Black sesame'] },
  { id: 'navgrah-shanti', name: 'Navgraha Shanti', icon: 'sparkles', cat: 'shanti', tag: 'Appeasing the nine planets', dur: '3–4 hours', pandits: 142, desc: 'Graha shanti havan with planet-specific mantra japa and daan, prescribed from your janm kundali to reduce malefic planetary effects.', samagri: ['Nine grains (nav dhanya)', 'Nine samidha woods', 'Nine cloth pieces', 'Navratna or substitutes', 'Havan samagri', 'Til, jau, ghee', 'Daan items per planet'] },
  { id: 'ganesh-puja', name: 'Ganesh Puja', icon: 'om', cat: 'daily', tag: 'Obstacle-removing first puja', dur: '1–2 hours', pandits: 232, desc: 'Shri Ganesh Sthapana and Atharvashirsha path — the mandatory opening ritual for every auspicious beginning.', samagri: ['Ganesh idol (clay)', 'Durva grass 21', 'Modak prasad', 'Red flowers', 'Sindoor', 'Kalash & coconut'] },
  { id: 'namkaran', name: 'Namkaran Sanskar', icon: 'baby', cat: 'life', tag: 'Baby naming ceremony', dur: '1–2 hours', pandits: 138, desc: 'Naming ceremony on the 11th/12th day, with nakshatra-based name suggestion, Surya darshan and blessings for the newborn.', samagri: ['Honey & gold ring', 'Kalash & mango leaves', 'Cradle decoration', 'Panchamrit', 'Akshat & haldi', 'Sweet prasad'] },
  { id: 'annaprashan', name: 'Annaprashan', icon: 'kalash', cat: 'life', tag: 'First solid food ritual', dur: '1 hour', pandits: 112, desc: 'The baby\'s first rice ceremony performed on a shubh muhurat with kheer prepared in silver, followed by blessings from elders.', samagri: ['Silver bowl & spoon', 'Kheer ingredients', 'Kalash', 'Fruits & flowers', 'New clothes'] },
  { id: 'satyanarayan-vrat', name: 'Vastu Shanti', icon: 'shield-check', cat: 'shanti', tag: 'Correcting vastu doshas', dur: '2–3 hours', pandits: 126, desc: 'Vastu dosh nivaran puja with Vastu Purush mandala, for homes, shops and offices facing recurring problems.', samagri: ['Vastu yantra', 'Copper kalash', 'Nav dhanya', 'Havan samagri', 'Red cloth', 'Panchdhatu items'] },
  { id: 'katha-bhagwat', name: 'Bhagwat Katha', icon: 'book-open', cat: 'festival', tag: 'Seven-day Bhagwat recital', dur: '7 days', pandits: 84, desc: 'Shrimad Bhagwat Mahapuran katha over seven days with vyas peeth, sung by an experienced katha vachak.', samagri: ['Vyas peeth setup', 'Bhagwat granth', 'Tulsi mala', 'Peacock feather & flute', 'Chhappan bhog items', 'Mandap decoration'] },
  { id: 'durga-path', name: 'Durga Saptashati Path', icon: 'flame', cat: 'shanti', tag: 'Chandi path for shakti', dur: '4–6 hours', pandits: 96, desc: 'Complete 700-verse Durga Saptashati recitation with Kavach, Argala and Keelak — powerful during Navratri.', samagri: ['Durga idol/picture', 'Red chunri & bangles', 'Coconut & kalash', 'Red flowers (hibiscus)', 'Havan samagri', 'Kumkum & sindoor'] },
  { id: 'mahamrityunjay', name: 'Mahamrityunjay Jaap', icon: 'trishul', cat: 'shanti', tag: 'Health & longevity mantra japa', dur: '3–5 hours', pandits: 118, desc: 'Sankalp-based Mahamrityunjay mantra japa (11,000 / 1.25 lakh) for recovery from illness and protection from untimely danger.', samagri: ['Rudraksh mala', 'Shivling', 'Bel patra & white flowers', 'Milk & gangajal', 'Havan samagri', 'Black til'] },
  { id: 'satyanarayan-akhand', name: 'Akhand Ramayan Path', icon: 'book-open', cat: 'festival', tag: '24-hour continuous recital', dur: '24 hours', pandits: 72, desc: 'Non-stop 24-hour Ramcharitmanas recitation by a team of pandits, ending with havan and bhandara.', samagri: ['Ramcharitmanas granth', 'Team seating arrangement', 'Akhand diya', 'Havan kund', 'Bhog & prasad', 'Flowers & garlands'] },
  { id: 'kaal-sarp', name: 'Kaal Sarp Dosh Puja', icon: 'alert-circle', cat: 'shanti', tag: 'Rahu–Ketu dosh remedy', dur: '3–4 hours', pandits: 68, desc: 'Specialised Kaal Sarp Yog nivaran puja, traditionally performed at Trimbakeshwar or Ujjain with Naag pratishtha.', samagri: ['Silver naag-naagin pair', 'Rudraksh', 'Black til & urad', 'Havan samagri', 'Blue/black cloth', 'Coconut'] },
  { id: 'pitru-dosh', name: 'Pitru Dosh / Shradh', icon: 'moon', cat: 'shanti', tag: 'Ancestral rites & tarpan', dur: '2–4 hours', pandits: 132, desc: 'Shradh, Tarpan and Pind daan for ancestral peace — performed during Pitru Paksha or on the tithi of passing.', samagri: ['Black til & jau', 'Kush grass', 'Rice pind ingredients', 'Ganga jal', 'White cloth', 'Brahman bhoj arrangement'] },
  { id: 'janeu', name: 'Janeu / Upanayan', icon: 'award', cat: 'life', tag: 'Sacred thread ceremony', dur: '3–4 hours', pandits: 104, desc: 'Yagyopavit Sanskar with Gayatri mantra diksha, marking the start of Vedic study for the child.', samagri: ['Yagyopavit (janeu) set', 'Danda & mriga charm', 'Havan kund & samidha', 'Kaupin & dhoti', 'Bhiksha items', 'Kalash'] },
  { id: 'bhoomi-pujan', name: 'Bhoomi Pujan', icon: 'temple', cat: 'life', tag: 'Groundbreaking ceremony', dur: '2 hours', pandits: 148, desc: 'Shilanyas and Bhoomi Pujan before construction begins — worship of Bhoomi Devi, Naag devta and the eight directions.', samagri: ['Silver naag & kalash', 'Foundation brick/shila', 'Nav dhanya', 'Panchdhatu', 'Coconut & flowers', 'Havan samagri'] },
  { id: 'gau-puja', name: 'Gau Puja & Daan', icon: 'sparkles', cat: 'daily', tag: 'Cow worship ritual', dur: '1 hour', pandits: 88, desc: 'Gau puja with feeding and daan, considered highly meritorious — often paired with Govardhan puja or Gopashtami.', samagri: ['Green fodder & jaggery', 'Haldi & kumkum', 'Garland for cow', 'Diya & agarbatti', 'Cloth for daan'] },
  { id: 'satyanarayan-diwali', name: 'Lakshmi Puja (Diwali)', icon: 'diya', cat: 'festival', tag: 'Diwali evening puja', dur: '1–2 hours', pandits: 226, desc: 'Shri Lakshmi-Ganesh puja with Kuber and bahi-khata pujan on Diwali night at the shubh Pradosh muhurat.', samagri: ['Lakshmi-Ganesh idols', 'Lotus flowers', 'Kamal gatta mala', 'Silver coin', 'Kheel-batasha', 'Bahi khata & pen', '11 diyas'] },
  { id: 'navratri-sthapana', name: 'Navratri Kalash Sthapana', icon: 'kalash', cat: 'festival', tag: 'Nine-night ghatasthapana', dur: '1–2 hours', pandits: 178, desc: 'Ghatasthapana on Pratipada with jawara sowing, akhand jyoti and daily aarti arrangement through nine nights.', samagri: ['Clay pot & soil', 'Barley seeds (jawara)', 'Kalash & coconut', 'Red chunri', 'Akhand jyoti diya', 'Nine-day flowers'] },
  { id: 'ganesh-utsav', name: 'Ganesh Utsav Sthapana', icon: 'om', cat: 'festival', tag: 'Ganesh Chaturthi setup', dur: '2 hours', pandits: 192, desc: 'Pranpratishtha of the Ganesh idol on Chaturthi with daily aarti schedule and visarjan guidance.', samagri: ['Ganesh idol', 'Durva & modak', 'Red flowers', 'Decoration set', 'Kalash', 'Aarti thali'] },
  { id: 'holika-dahan', name: 'Holika Dahan Puja', icon: 'flame', cat: 'festival', tag: 'Holi eve fire worship', dur: '1 hour', pandits: 116, desc: 'Holika puja and dahan at the correct Bhadra-free muhurat with parikrama and new-grain offering.', samagri: ['Cow dung cakes', 'Wheat sheaves', 'Gulal & haldi', 'Coconut', 'Kalava thread', 'Water pot'] },
  { id: 'chhath', name: 'Chhath Puja Vidhi', icon: 'sun', cat: 'festival', tag: 'Surya arghya guidance', dur: '2 days', pandits: 64, desc: 'Guided Chhath vidhi across Nahay-Khay, Kharna, Sandhya Arghya and Usha Arghya with Surya mantras.', samagri: ['Bamboo soop & daura', 'Thekua prasad', 'Sugarcane', 'Seasonal fruits', 'Diya & agarbatti', 'Sindoor'] },
  { id: 'katha-jagran', name: 'Mata Ka Jagran', icon: 'flame', cat: 'festival', tag: 'Night-long bhajan jagran', dur: '6–8 hours', pandits: 78, desc: 'Devi jagran with chowki, bhajan mandali, akhand jyoti and morning bhandara arrangement.', samagri: ['Chowki decoration', 'Devi idols/pictures', 'Akhand jyoti', 'Bhajan mandali setup', 'Prasad & bhandara', 'Red chunri'] },
  { id: 'kundali', name: 'Kundali & Matchmaking', icon: 'globe', cat: 'shanti', tag: 'Horoscope & guna milan', dur: '1 hour', pandits: 154, desc: 'Janm kundali preparation, dasha analysis and 36-guna matching for marriage with written report.', samagri: ['Birth date, time & place', 'Both kundalis (for milan)', 'Notebook for remedies'] },
  { id: 'aarti-seva', name: 'Daily Aarti Seva', icon: 'diya', cat: 'daily', tag: 'Regular temple aarti', dur: '30 min', pandits: 204, desc: 'Arrange daily, weekly or monthly aarti and abhishek seva in your name at a listed temple with photo confirmation.', samagri: ['Ghee for diya', 'Flowers & garland', 'Prasad items', 'Agarbatti & dhoop'] },
  { id: 'antim-sanskar', name: 'Antim Sanskar', icon: 'moon', cat: 'life', tag: 'Last rites guidance', dur: 'As needed', pandits: 92, desc: 'Respectful guidance and pandit availability for Antim Sanskar, Asthi visarjan and the 13-day rites.', samagri: ['Kush & til', 'Ganga jal', 'White cloth', 'Havan samagri', 'Pind daan items'] },
  { id: 'shop-opening', name: 'Shop / Office Opening', icon: 'briefcase', cat: 'life', tag: 'Business muhurat puja', dur: '1–2 hours', pandits: 136, desc: 'Lakshmi-Kuber puja with Vastu shanti for a new shop, office or factory at a business-friendly muhurat.', samagri: ['Lakshmi-Ganesh idols', 'Kalash & coconut', 'Cash box & bahi khata', 'Nimbu-mirchi & toran', 'Havan samagri'] },
  { id: 'satyanarayan-shanti', name: 'Shani Shanti Puja', icon: 'moon', cat: 'shanti', tag: 'Shani dosh remedy', dur: '2 hours', pandits: 108, desc: 'Shani shanti with til-tel abhishek and Shani stotra japa, advised during Shani Mahadasha or Sade Sati.', samagri: ['Black til & mustard oil', 'Black cloth & urad dal', 'Iron item for daan', 'Blue flowers', 'Havan samagri'] },
];

/* ----------------------------------------------------------------- temples
   img: real photo path — falls back to the SVG when the jpg is absent.
   lat/lng drive the marker positions on the map page.
---------------------------------------------------------------------------- */
PC.temples = [
  { id: 'kashi-vishwanath', name: 'Kashi Vishwanath Temple', city: 'Varanasi', state: 'Uttar Pradesh', deity: 'Lord Shiva', rating: 4.8, reviews: 1204, pandits: 12, timings: '3:00 AM – 11:00 PM', est: '1780', lat: 25.3109, lng: 83.0107, services: ['rudrabhishek', 'mahamrityunjay', 'havan-yagna', 'aarti-seva', 'pitru-dosh'], img: 'assets/img/temples/kashi-vishwanath.jpg', about: 'One of the twelve Jyotirlingas and the spiritual heart of Varanasi, standing on the western bank of the Ganga. The present structure was rebuilt by Maharani Ahilyabai Holkar in 1780. Rudrabhishek and Mahamrityunjay jaap here are considered especially potent.', highlights: ['Jyotirlinga darshan', 'Ganga Aarti at Dashashwamedh', 'Mangala Aarti (3 AM)', 'Annakut in Kartik'] },
  { id: 'mahakaleshwar', name: 'Mahakaleshwar Jyotirlinga', city: 'Ujjain', state: 'Madhya Pradesh', deity: 'Lord Mahakal', rating: 4.9, reviews: 1876, pandits: 18, timings: '4:00 AM – 11:00 PM', est: 'Ancient', lat: 23.1828, lng: 75.7683, services: ['rudrabhishek', 'kaal-sarp', 'navgrah-shanti', 'mahamrityunjay', 'havan-yagna'], img: 'assets/img/temples/mahakaleshwar.jpg', about: 'The only south-facing Jyotirlinga, famous for the Bhasma Aarti performed at dawn with sacred ash. Ujjain is the traditional seat for Kaal Sarp and Mangal dosh nivaran pujas.', highlights: ['Bhasma Aarti (4 AM)', 'Kaal Sarp dosh puja', 'Nagchandreshwar darshan', 'Simhastha Kumbh'] },
  { id: 'har-ki-pauri', name: 'Har Ki Pauri & Daksheshwar', city: 'Haridwar', state: 'Uttarakhand', deity: 'Ganga Mata', rating: 4.7, reviews: 942, pandits: 22, timings: '5:00 AM – 10:00 PM', est: '1810', lat: 29.9457, lng: 78.1642, services: ['pitru-dosh', 'mundan', 'janeu', 'antim-sanskar', 'havan-yagna'], img: 'assets/img/temples/haridwar.jpg', about: 'The principal ghat of Haridwar where the Ganga enters the plains. The traditional destination for Shradh, Tarpan, Mundan and Asthi visarjan, with generations of pandit families maintaining vanshavali records.', highlights: ['Evening Ganga Aarti', 'Pind daan & tarpan', 'Vanshavali records', 'Kanwar Yatra season'] },
  { id: 'banke-bihari', name: 'Shri Banke Bihari Mandir', city: 'Mathura', state: 'Uttar Pradesh', deity: 'Lord Krishna', rating: 4.8, reviews: 1338, pandits: 14, timings: '7:45 AM – 9:30 PM', est: '1864', lat: 27.5826, lng: 77.7003, services: ['katha-bhagwat', 'satyanarayan-katha', 'namkaran', 'annaprashan', 'gau-puja'], img: 'assets/img/temples/banke-bihari.jpg', about: 'The most beloved Krishna temple of Vrindavan, where the curtain is drawn every few minutes so devotees never meet Bihari ji\'s gaze for too long. Bhagwat Katha and Chhappan Bhog seva are arranged through temple pandits.', highlights: ['Jhulan & Holi utsav', 'Chhappan Bhog seva', 'Mangla Aarti (Janmashtami)', 'Bhagwat Katha vachak'] },
  { id: 'ram-mandir', name: 'Shri Ram Janmabhoomi Mandir', city: 'Ayodhya', state: 'Uttar Pradesh', deity: 'Lord Ram', rating: 4.9, reviews: 2410, pandits: 26, timings: '6:30 AM – 9:30 PM', est: '2024', lat: 26.7956, lng: 82.1943, services: ['satyanarayan-akhand', 'sunderkand', 'havan-yagna', 'namkaran', 'aarti-seva'], img: 'assets/img/temples/ram-mandir.jpg', about: 'The grand Nagara-style temple at Ram Janmabhoomi, consecrated in January 2024. Akhand Ramayan Path and Sunderkand recitals are the most requested sevas, along with Saryu snan rituals.', highlights: ['Ram Lalla darshan', 'Akhand Ramayan Path', 'Deepotsav (Diwali)', 'Saryu ghat rituals'] },
  { id: 'tirumala', name: 'Tirumala Venkateswara Temple', city: 'Tirupati', state: 'Andhra Pradesh', deity: 'Lord Venkateswara', rating: 4.9, reviews: 3204, pandits: 20, timings: '2:30 AM – 1:30 AM', est: '300 CE', lat: 13.6833, lng: 79.3474, services: ['mundan', 'annaprashan', 'namkaran', 'aarti-seva', 'wedding'], img: 'assets/img/temples/tirumala.jpg', about: 'The world\'s most-visited temple, on the seventh hill of Tirumala. Mundan (tonsure) and Annaprashan here are family traditions across South India; Kalyanotsavam is performed daily.', highlights: ['Suprabhata Seva', 'Kalyanotsavam', 'Tonsure (mottai) ritual', 'Brahmotsavam'] },
  { id: 'jagannath-puri', name: 'Shri Jagannath Temple', city: 'Puri', state: 'Odisha', deity: 'Lord Jagannath', rating: 4.8, reviews: 1654, pandits: 16, timings: '5:00 AM – 11:00 PM', est: '12th c.', lat: 19.8050, lng: 85.8180, services: ['katha-bhagwat', 'pitru-dosh', 'havan-yagna', 'satyanarayan-katha', 'gau-puja'], img: 'assets/img/temples/jagannath.jpg', about: 'Home of the Char Dham deity Jagannath with brother Balabhadra and sister Subhadra. Famous for the Rath Yatra and the Mahaprasad cooked in the world\'s largest temple kitchen.', highlights: ['Rath Yatra', 'Mahaprasad seva', 'Snana Purnima', 'Pind daan at Swargadwar'] },
  { id: 'meenakshi', name: 'Meenakshi Amman Temple', city: 'Madurai', state: 'Tamil Nadu', deity: 'Goddess Meenakshi', rating: 4.8, reviews: 1420, pandits: 15, timings: '5:00 AM – 10:00 PM', est: '17th c.', lat: 9.9195, lng: 78.1193, services: ['wedding', 'durga-path', 'navratri-sthapana', 'kundali', 'aarti-seva'], img: 'assets/img/temples/meenakshi.jpg', about: 'A Dravidian masterpiece with fourteen towering gopurams and the Hall of Thousand Pillars. Thirukalyanam — the divine wedding — makes it a favoured venue for marriage rituals.', highlights: ['Thirukalyanam', 'Chithirai festival', 'Hall of 1000 Pillars', 'Night Palliarai seva'] },
  { id: 'trimbakeshwar', name: 'Trimbakeshwar Shiva Temple', city: 'Nashik', state: 'Maharashtra', deity: 'Lord Shiva', rating: 4.7, reviews: 1108, pandits: 24, timings: '5:30 AM – 9:00 PM', est: '18th c.', lat: 19.9333, lng: 73.5297, services: ['kaal-sarp', 'pitru-dosh', 'navgrah-shanti', 'rudrabhishek', 'satyanarayan-shanti'], img: 'assets/img/temples/trimbakeshwar.jpg', about: 'A Jyotirlinga at the source of the Godavari and the recognised centre for Kaal Sarp Yog, Narayan Nagbali and Tripindi Shradh — pujas that require specially trained pandits.', highlights: ['Kaal Sarp Yog puja', 'Narayan Nagbali', 'Tripindi Shradh', 'Kushavarta Kund snan'] },
  { id: 'dwarkadhish', name: 'Dwarkadhish Temple', city: 'Dwarka', state: 'Gujarat', deity: 'Lord Krishna', rating: 4.7, reviews: 876, pandits: 11, timings: '6:00 AM – 9:30 PM', est: '16th c.', lat: 22.2378, lng: 68.9685, services: ['katha-bhagwat', 'wedding', 'satyanarayan-katha', 'namkaran', 'aarti-seva'], img: 'assets/img/temples/dwarkadhish.jpg', about: 'The Jagat Mandir of Char Dham fame, with a five-storey spire held by seventy-two pillars. Bhagwat Katha and Krishna-vivah style wedding rituals are performed by resident Gugli pandits.', highlights: ['Dhwaja changing seva', 'Janmashtami utsav', 'Gomti snan', 'Bet Dwarka darshan'] },
  { id: 'kamakhya', name: 'Kamakhya Devi Temple', city: 'Guwahati', state: 'Assam', deity: 'Goddess Kamakhya', rating: 4.8, reviews: 1042, pandits: 13, timings: '5:30 AM – 10:00 PM', est: '8th c.', lat: 26.1664, lng: 91.7055, services: ['durga-path', 'navratri-sthapana', 'katha-jagran', 'navgrah-shanti', 'kundali'], img: 'assets/img/temples/kamakhya.jpg', album: true, about: 'The most revered Shakti Peeth on Nilachal Hill, centre of tantric worship. Durga Saptashati path and Devi anusthans here are conducted by hereditary tantric pandits.', highlights: ['Ambubachi Mela', 'Durga Saptashati path', 'Panch Ratna darshan', 'Navratri anusthan'] },
  { id: 'siddhivinayak', name: 'Shree Siddhivinayak Temple', city: 'Mumbai', state: 'Maharashtra', deity: 'Lord Ganesh', rating: 4.8, reviews: 2140, pandits: 17, timings: '5:30 AM – 10:00 PM', est: '1801', lat: 19.0170, lng: 72.8302, services: ['ganesh-puja', 'ganesh-utsav', 'griha-pravesh', 'shop-opening', 'satyanarayan-katha'], img: 'assets/img/temples/siddhivinayak.jpg', about: 'Mumbai\'s most visited Ganesh temple, where Tuesday queues stretch for kilometres. The first stop for Griha Pravesh sankalp and new-business pujas across the city.', highlights: ['Tuesday Ganesh darshan', 'Ganesh Utsav (10 days)', 'Angarki Chaturthi', 'Kakad Aarti (5:30 AM)'] },
  { id: 'chhatarpur', name: 'Shri Adya Katyayani Shakti Peeth', city: 'Delhi', state: 'Delhi', deity: 'Goddess Katyayani', rating: 4.6, reviews: 728, pandits: 10, timings: '6:00 AM – 10:00 PM', est: '1974', lat: 28.5010, lng: 77.1780, services: ['durga-path', 'navratri-sthapana', 'katha-jagran', 'mundan', 'griha-pravesh'], img: 'assets/img/temples/chhatarpur.jpg', about: 'Delhi\'s sprawling Chhatarpur temple complex in white marble, packed through both Navratris. Jagran, Durga path and Mundan ceremonies are arranged in its many mandaps.', highlights: ['Navratri jagran', 'Marble mandap ceremonies', 'Shayan Aarti', 'Free bhandara'] },
  { id: 'govind-devji', name: 'Govind Dev Ji Temple', city: 'Jaipur', state: 'Rajasthan', deity: 'Lord Krishna', rating: 4.7, reviews: 964, pandits: 12, timings: '4:30 AM – 9:00 PM', est: '1735', lat: 26.9260, lng: 75.8235, services: ['katha-bhagwat', 'satyanarayan-katha', 'wedding', 'annaprashan', 'aarti-seva'], img: 'assets/img/temples/govind-devji.jpg', about: 'Jaipur\'s presiding deity inside the City Palace complex, with seven daily jhankis. Weddings and Bhagwat Katha here follow the Gaudiya Vaishnav tradition.', highlights: ['Seven daily jhankis', 'Janmashtami jhulan', 'Annakut darshan', 'Gaudiya vidhi weddings'] },
];

/* ----------------------------------------------------------------- pandits */
PC.pandits = [
  { id: 'ramesh-sharma', name: 'Pandit Ramesh Sharma', city: 'Varanasi', state: 'Uttar Pradesh', exp: 22, rating: 4.9, reviews: 186, verified: true, tier: 'Diamond', langs: ['Hindi', 'Sanskrit', 'English'], services: ['rudrabhishek', 'mahamrityunjay', 'havan-yagna', 'griha-pravesh', 'wedding'], temples: ['kashi-vishwanath', 'har-ki-pauri'], phone: '+919000000101', edu: 'Shastri (Veda), Sampurnanand Sanskrit University', gotra: 'Bharadwaj', about: 'Twenty-two years of performing Rudrabhishek and Mahamrityunjay anusthans at Kashi Vishwanath. Explains every step of the vidhi in Hindi and English so families understand what they are participating in.', img: 'assets/img/pandits/ramesh-sharma.jpg' },
  { id: 'devdatt-shastri', name: 'Pandit Devdatt Shastri', city: 'Ujjain', state: 'Madhya Pradesh', exp: 28, rating: 4.9, reviews: 241, verified: true, tier: 'Diamond', langs: ['Hindi', 'Sanskrit', 'Marathi'], services: ['kaal-sarp', 'navgrah-shanti', 'rudrabhishek', 'satyanarayan-shanti', 'mahamrityunjay'], temples: ['mahakaleshwar', 'trimbakeshwar'], phone: '+919000000102', edu: 'Acharya (Jyotish), Maharishi Panini Sanskrit University', gotra: 'Kashyap', about: 'Ujjain\'s senior-most Kaal Sarp and Navgrah shanti specialist. Reads the kundali first and performs only the puja your chart actually calls for — never a package.', img: 'assets/img/pandits/devdatt-shastri.jpg' },
  { id: 'naman-tiwari', name: 'Pandit Naman Tiwari', city: 'Ayodhya', state: 'Uttar Pradesh', exp: 14, rating: 4.8, reviews: 132, verified: true, tier: 'Gold', langs: ['Hindi', 'English', 'Bhojpuri'], services: ['sunderkand', 'satyanarayan-akhand', 'havan-yagna', 'namkaran', 'satyanarayan-katha', 'chhath'], temples: ['ram-mandir', 'banke-bihari'], phone: '+919000000103', edu: 'Shastri (Ramcharitmanas), Ayodhya Sanskrit Mahavidyalaya', gotra: 'Vatsa', about: 'Leads a Sunderkand mandali of five with dholak and manjira. Known for a clear, singing recitation style that keeps children and elders engaged for the full three hours.', img: 'assets/img/pandits/naman-tiwari.jpg' },
  { id: 'suresh-joshi', name: 'Pandit Suresh Joshi', city: 'Nashik', state: 'Maharashtra', exp: 19, rating: 4.8, reviews: 164, verified: true, tier: 'Gold', langs: ['Marathi', 'Hindi', 'Sanskrit'], services: ['kaal-sarp', 'pitru-dosh', 'navgrah-shanti', 'satyanarayan-vrat', 'satyanarayan-shanti'], temples: ['trimbakeshwar', 'siddhivinayak'], phone: '+919000000104', edu: 'Ved Murti, Trimbakeshwar Vedshala', gotra: 'Gautam', about: 'Trained at Trimbakeshwar Vedshala in Narayan Nagbali and Tripindi Shradh — rituals that require exact procedure. Handles all samagri arrangement at the ghat himself.', img: 'assets/img/pandits/suresh-joshi.jpg' },
  { id: 'anand-iyer', name: 'Pandit Anand Iyer', city: 'Madurai', state: 'Tamil Nadu', exp: 24, rating: 4.9, reviews: 208, verified: true, tier: 'Diamond', langs: ['Tamil', 'Telugu', 'Sanskrit', 'English'], services: ['wedding', 'namkaran', 'annaprashan', 'durga-path', 'kundali'], temples: ['meenakshi', 'tirumala'], phone: '+919000000105', edu: 'Ghanapaathi (Yajur Veda), Madurai Veda Patasala', gotra: 'Srivatsa', about: 'A Ghanapaathi who has conducted over 900 Tamil-tradition weddings at Meenakshi Amman. Provides the full muhurat sheet and guna-milan report before the ceremony.', img: 'assets/img/pandits/anand-iyer.jpg' },
  { id: 'mohan-das', name: 'Pandit Mohan Das', city: 'Puri', state: 'Odisha', exp: 17, rating: 4.7, reviews: 118, verified: true, tier: 'Silver', langs: ['Odia', 'Hindi', 'Sanskrit', 'Bengali'], services: ['pitru-dosh', 'katha-bhagwat', 'havan-yagna', 'gau-puja', 'satyanarayan-katha'], temples: ['jagannath-puri'], phone: '+919000000106', edu: 'Shastri (Puran), Puri Sanskrit College', gotra: 'Vishwamitra', about: 'Sevayat family of the Jagannath temple, fourth generation. Conducts Pind daan at Swargadwar and seven-day Bhagwat Katha in Odia, Hindi or Bengali.', img: 'assets/img/pandits/mohan-das.jpg' },
  { id: 'gopal-chaturvedi', name: 'Pandit Gopal Chaturvedi', city: 'Mathura', state: 'Uttar Pradesh', exp: 21, rating: 4.8, reviews: 176, verified: true, tier: 'Gold', langs: ['Hindi', 'Braj', 'Sanskrit'], services: ['katha-bhagwat', 'satyanarayan-katha', 'ganesh-puja', 'annaprashan', 'gau-puja'], temples: ['banke-bihari', 'govind-devji'], phone: '+919000000107', edu: 'Acharya (Bhagwat), Vrindavan Shodh Sansthan', gotra: 'Garg', about: 'Braj-tradition katha vachak. His seven-day Bhagwat Katha includes daily bhajan and a Chhappan Bhog on the final day, arranged with the temple kitchen.', img: 'assets/img/pandits/gopal-chaturvedi.jpg' },
  { id: 'vikas-upadhyay', name: 'Pandit Vikas Upadhyay', city: 'Haridwar', state: 'Uttarakhand', exp: 12, rating: 4.7, reviews: 96, verified: true, tier: 'Silver', langs: ['Hindi', 'Garhwali', 'Sanskrit', 'English'], services: ['mundan', 'janeu', 'pitru-dosh', 'antim-sanskar', 'havan-yagna'], temples: ['har-ki-pauri'], phone: '+919000000108', edu: 'Shastri (Karmakand), Gurukul Kangri', gotra: 'Bhargav', about: 'Handles Mundan, Janeu and Shradh at Har Ki Pauri with the family vanshavali register. Patient with first-time families and transparent about ghat charges upfront.', img: 'assets/img/pandits/vikas-upadhyay.jpg' },
  { id: 'srinivas-rao', name: 'Pandit Srinivas Rao', city: 'Tirupati', state: 'Andhra Pradesh', exp: 26, rating: 4.9, reviews: 224, verified: true, tier: 'Diamond', langs: ['Telugu', 'Tamil', 'Sanskrit', 'English'], services: ['mundan', 'annaprashan', 'namkaran', 'wedding', 'kundali'], temples: ['tirumala'], phone: '+919000000109', edu: 'Vedanta Vidwan, Tirumala Veda Patasala', gotra: 'Atreya', about: 'Twenty-six years of Tirumala sevas. Coordinates tonsure, Annaprashan and Kalyanotsavam slots including the TTD booking formalities for out-of-state families.', img: 'assets/img/pandits/srinivas-rao.jpg' },
  { id: 'harish-bhatt', name: 'Pandit Harish Bhatt', city: 'Dwarka', state: 'Gujarat', exp: 16, rating: 4.7, reviews: 104, verified: true, tier: 'Silver', langs: ['Gujarati', 'Hindi', 'Sanskrit'], services: ['katha-bhagwat', 'wedding', 'griha-pravesh', 'shop-opening', 'satyanarayan-katha'], temples: ['dwarkadhish'], phone: '+919000000110', edu: 'Shastri (Veda), Dwarka Sharda Peeth', gotra: 'Shandilya', about: 'Gugli pandit of Dwarkadhish. Performs Gujarati-vidhi weddings and Griha Pravesh with the complete samagri list shared on WhatsApp a week in advance.', img: 'assets/img/pandits/harish-bhatt.jpg' },
  { id: 'bipul-goswami', name: 'Pandit Bipul Goswami', city: 'Guwahati', state: 'Assam', exp: 15, rating: 4.8, reviews: 112, verified: true, tier: 'Gold', langs: ['Assamese', 'Bengali', 'Hindi', 'Sanskrit'], services: ['durga-path', 'navratri-sthapana', 'katha-jagran', 'navgrah-shanti', 'kundali'], temples: ['kamakhya'], phone: '+919000000111', edu: 'Tantra Acharya, Kamakhya Peeth', gotra: 'Kaushik', about: 'Hereditary Kamakhya pandit for Devi anusthans. Performs the complete Durga Saptashati with Kavach-Argala-Keelak and explains each remedy in plain language.', img: 'assets/img/pandits/bipul-goswami.jpg' },
  { id: 'kailash-mishra', name: 'Pandit Kailash Mishra', city: 'Mumbai', state: 'Maharashtra', exp: 20, rating: 4.8, reviews: 198, verified: true, tier: 'Gold', langs: ['Hindi', 'Marathi', 'English', 'Sanskrit'], services: ['ganesh-puja', 'ganesh-utsav', 'griha-pravesh', 'shop-opening', 'bhoomi-pujan'], temples: ['siddhivinayak'], phone: '+919000000112', edu: 'Ved Shastri, Mumbai Ved Vidyalaya', gotra: 'Vashishtha', about: 'Mumbai\'s go-to pandit for flat Griha Pravesh and office openings. Works around apartment society rules and finishes within the muhurat window without rushing the vidhi.', img: 'assets/img/pandits/kailash-mishra.jpg' },
  { id: 'satish-dubey', name: 'Pandit Satish Dubey', city: 'Delhi', state: 'Delhi', exp: 18, rating: 4.7, reviews: 154, verified: true, tier: 'Gold', langs: ['Hindi', 'English', 'Punjabi', 'Sanskrit'], services: ['griha-pravesh', 'durga-path', 'katha-jagran', 'mundan', 'satyanarayan-diwali', 'holika-dahan'], temples: ['chhatarpur'], phone: '+919000000113', edu: 'Shastri (Karmakand), Delhi Sanskrit Academy', gotra: 'Parashar', about: 'Delhi-NCR Griha Pravesh and Jagran specialist with his own bhajan mandali. Sends a printed vidhi card so the family knows the sequence in advance.', img: 'assets/img/pandits/satish-dubey.jpg' },
  { id: 'mahesh-vyas', name: 'Pandit Mahesh Vyas', city: 'Jaipur', state: 'Rajasthan', exp: 23, rating: 4.8, reviews: 182, verified: true, tier: 'Diamond', langs: ['Hindi', 'Marwari', 'Sanskrit', 'English'], services: ['wedding', 'kundali', 'katha-bhagwat', 'annaprashan', 'navgrah-shanti'], temples: ['govind-devji'], phone: '+919000000114', edu: 'Acharya (Jyotish), Jagatguru Ramanandacharya University', gotra: 'Dadhich', about: 'Marwari-tradition wedding vidhi with full jyotish backing — kundali milan, muhurat and dosh remedies handled by the same person who performs the ceremony.', img: 'assets/img/pandits/mahesh-vyas.jpg' },
  { id: 'raghav-pathak', name: 'Pandit Raghav Pathak', city: 'Varanasi', state: 'Uttar Pradesh', exp: 9, rating: 4.6, reviews: 74, verified: true, tier: 'Silver', langs: ['Hindi', 'English', 'Sanskrit'], services: ['sunderkand', 'ganesh-puja', 'satyanarayan-katha', 'namkaran', 'aarti-seva'], temples: ['kashi-vishwanath'], phone: '+919000000115', edu: 'Shastri (Veda), BHU', gotra: 'Upamanyu', about: 'Younger BHU-trained pandit who runs online Sunderkand and Satyanarayan katha for families abroad, with the samagri list couriered in advance.', img: 'assets/img/pandits/raghav-pathak.jpg' },
  { id: 'lakshman-acharya', name: 'Pandit Lakshman Acharya', city: 'Ujjain', state: 'Madhya Pradesh', exp: 31, rating: 4.9, reviews: 268, verified: true, tier: 'Diamond', langs: ['Hindi', 'Sanskrit', 'Gujarati'], services: ['mahamrityunjay', 'durga-path', 'havan-yagna', 'pitru-dosh', 'rudrabhishek'], temples: ['mahakaleshwar'], phone: '+919000000116', edu: 'Mahamahopadhyaya (Veda), Ujjain', gotra: 'Angiras', about: 'Thirty-one years at Mahakal. Conducts large-scale Mahamrityunjay jaap anusthans (1.25 lakh) with a team of eleven pandits and full sankalp documentation.', img: 'assets/img/pandits/lakshman-acharya.jpg' },
];

/* --------------------------------------------------------------- festivals */
PC.festivals = [
  { date: '2026-08-09', label: '09 Aug 2026', name: 'Raksha Bandhan', note: 'Shravan Purnima' },
  { date: '2026-08-16', label: '16 Aug 2026', name: 'Krishna Janmashtami', note: 'Nishith puja muhurat' },
  { date: '2026-09-04', label: '04 Sep 2026', name: 'Ganesh Chaturthi', note: 'Sthapana muhurat' },
  { date: '2026-09-26', label: '26 Sep 2026', name: 'Pitru Paksha begins', note: 'Shradh & tarpan' },
  { date: '2026-10-11', label: '11 Oct 2026', name: 'Navratri Ghatasthapana', note: 'Kalash sthapana' },
  { date: '2026-10-20', label: '20 Oct 2026', name: 'Vijayadashami', note: 'Shastra puja' },
  { date: '2026-11-08', label: '08 Nov 2026', name: 'Diwali — Lakshmi Puja', note: 'Pradosh muhurat' },
  { date: '2026-11-15', label: '15 Nov 2026', name: 'Chhath Puja', note: 'Sandhya arghya' },
];

/* ---------------------------------------------------------------- reviews */
PC.reviews = [
  { name: 'Ankit Verma', city: 'Lucknow', rating: 5, text: 'Pandit ji ke saath direct baat hui, koi middleman nahi. Griha Pravesh ke liye samagri list pehle hi WhatsApp par mil gayi — sab kuch time par ho gaya.', service: 'Griha Pravesh' },
  { name: 'Priya Nair', city: 'Bengaluru', rating: 5, text: 'We needed a Tamil-speaking pandit in Madurai for our wedding. Found three profiles with video intros, spoke to two on call, and booked the one we connected with. No commission, no pressure.', service: 'Wedding Ceremony' },
  { name: 'Rohit Deshmukh', city: 'Pune', rating: 5, text: 'Kaal Sarp dosh puja Trimbakeshwar mein karani thi. Platform par temple ke saath jude pandit ji mile — verification aur certificate dono dikhe. Bharosa ho gaya.', service: 'Kaal Sarp Dosh Puja' },
  { name: 'Sneha Agarwal', city: 'Kolkata', rating: 4, text: 'Durga Saptashati path ke liye Kamakhya ke pandit ji se seedha contact hua. Reviews padh ke decide kiya. Bas mobile app aa jaye toh aur asaan ho.', service: 'Durga Saptashati Path' },
  { name: 'Karthik Menon', city: 'Dubai', rating: 5, text: 'Living abroad, arranging my father\'s Shradh in Haridwar was my biggest worry. The pandit ji did a video call during the tarpan so we could all participate. Deeply grateful.', service: 'Pitru Dosh / Shradh' },
  { name: 'Manish Jain', city: 'Indore', rating: 5, text: 'Shop opening ka muhurat aur puja dono same pandit ji ne kiya. Kundali dekhi, phir date batayi. Direct call feature sabse best hai.', service: 'Shop / Office Opening' },
];

/* ------------------------------------------------------------------ blog */
PC.posts = [
  { id: 'griha-pravesh-guide', cat: 'Rituals', title: 'Griha Pravesh: complete vidhi, samagri and muhurat guide', date: '12 Jul 2026', read: '8 min', excerpt: 'What actually happens during a Griha Pravesh puja, why Vastu Shanti comes first, and the twelve samagri items families most often forget.' },
  { id: 'why-no-middleman', cat: 'PanditConnect', title: 'Why we will never take a commission on your puja', date: '04 Jul 2026', read: '5 min', excerpt: 'Most platforms sit between you and the pandit and keep 20–30%. Here is how our directory model works instead, and what it means for both sides.' },
  { id: 'kaal-sarp-explained', cat: 'Jyotish', title: 'Kaal Sarp Yog: what it is, and what it is not', date: '28 Jun 2026', read: '10 min', excerpt: 'A calm, non-alarmist explanation of the Rahu–Ketu axis, when a remedy is genuinely advised, and why Trimbakeshwar and Ujjain are the traditional venues.' },
  { id: 'choose-pandit', cat: 'Guides', title: 'Seven questions to ask a pandit ji before your ceremony', date: '21 Jun 2026', read: '6 min', excerpt: 'Gotra, tradition, language, duration, samagri responsibility, dakshina clarity and travel — settle these on the first call and the day goes smoothly.' },
  { id: 'navratri-2026', cat: 'Festivals', title: 'Navratri 2026: Ghatasthapana muhurat and nine-day vidhi', date: '15 Jun 2026', read: '7 min', excerpt: 'Day-by-day Devi worship, jawara sowing, akhand jyoti rules and the Ashtami–Navami hawan timings for 2026.' },
  { id: 'shradh-abroad', cat: 'Guides', title: 'Arranging Shradh from abroad: a practical checklist', date: '08 Jun 2026', read: '9 min', excerpt: 'Tithi calculation across time zones, choosing between Gaya, Haridwar and Puri, video participation, and what to send in advance.' },
  { id: 'samagri-basics', cat: 'Rituals', title: 'Puja samagri basics: what each item actually means', date: '30 May 2026', read: '6 min', excerpt: 'Akshat, kalava, panchamrit, durva, bel patra — the reasoning behind the common items on every samagri list.' },
  { id: 'muhurat-myths', cat: 'Jyotish', title: 'Muhurat myths that cost families time and money', date: '22 May 2026', read: '7 min', excerpt: 'Not every day needs a paid muhurat consultation. Here is when timing genuinely matters and when a Brahma muhurat start is enough.' },
  { id: 'temple-seva', cat: 'PanditConnect', title: 'How temple sevas are verified before a listing goes live', date: '14 May 2026', read: '5 min', excerpt: 'Our four-step process: document check, video KYC, temple confirmation and a review-integrity audit every six months.' },
];

/* -------------------------------------------------------- panchang (today) */
PC.panchang = {
  tithi: 'Shukla Paksha Dwadashi',
  nakshatra: 'Anuradha',
  yoga: 'Siddhi',
  karana: 'Balava',
  paksha: 'Shukla',
  vaar: 'Guruvar (Thursday)',
  sunrise: '05:58 AM',
  sunset: '07:04 PM',
  moonrise: '04:12 PM',
  moonset: '03:26 AM',
  vikram: '2083 Rakshas',
  shaka: '1948 Vishvavasu',
  masa: 'Shravan',
  ritu: 'Varsha',
  auspicious: [
    { k: 'Brahma Muhurat', v: '04:24 AM – 05:11 AM' },
    { k: 'Abhijit Muhurat', v: '11:58 AM – 12:52 PM' },
    { k: 'Vijaya Muhurat', v: '02:42 PM – 03:35 PM' },
    { k: 'Godhuli Muhurat', v: '07:02 PM – 07:26 PM' },
    { k: 'Amrit Kaal', v: '09:14 PM – 10:48 PM' },
  ],
  inauspicious: [
    { k: 'Rahu Kaal', v: '02:06 PM – 03:44 PM' },
    { k: 'Yamaganda', v: '05:58 AM – 07:36 AM' },
    { k: 'Gulika Kaal', v: '09:14 AM – 10:52 AM' },
    { k: 'Dur Muhurat', v: '10:14 AM – 11:06 AM' },
    { k: 'Varjyam', v: '06:38 PM – 08:12 PM' },
  ],
};

/* ------------------------------------------------------------ subscription */
PC.plans = [
  { name: 'Free', price: '₹0', per: 'forever', feats: ['Basic profile', '1 temple listing', 'Standard search placement', 'Up to 3 services'], cta: 'Current plan' },
  { name: 'Silver', price: '₹299', per: '/month', feats: ['Verified badge', '5 temple listings', '60-sec video intro', 'Priority in search', 'Unlimited services'], cta: 'Upgrade' },
  { name: 'Gold', price: '₹599', per: '/month', feats: ['Everything in Silver', 'Homepage featuring', 'Analytics dashboard', 'QR profile code', 'Review response tools'], cta: 'Upgrade', popular: true },
  { name: 'Diamond', price: '₹999', per: '/month', feats: ['Everything in Gold', 'Top placement always', 'Multi-city listing', 'Dedicated support line', 'Leaderboard eligibility'], cta: 'Upgrade' },
];

/* -------------------------------------------------------------------- FAQ */
PC.faqs = [
  { q: 'Do you charge commission on my puja?', a: 'No. PanditConnect is a directory, not a booking agent. You contact the pandit ji directly on WhatsApp or call, and you settle dakshina and samagri arrangements with them. We never sit in the middle of that transaction and take nothing from it.' },
  { q: 'Then how does PanditConnect earn?', a: 'Pandits may optionally subscribe to a paid tier (Silver, Gold or Diamond) for a verified badge, more listings and better placement. Temples can promote events. We also run relevant ads on content pages. Your connection with a pandit ji is always free.' },
  { q: 'How are pandits verified?', a: 'Four steps: identity and address documents, a video KYC call, confirmation from the temple they are associated with, and Vedic education certificate checks. Verified profiles carry the gold tick. We re-audit reviews every six months.' },
  { q: 'Can I request a pandit who speaks my language?', a: 'Yes. Every profile lists the languages the pandit ji speaks, and you can filter the Pandit Directory by language along with city, service, rating and experience.' },
  { q: 'I live abroad. Can a puja be arranged for my family in India?', a: 'Many of our pandits conduct rituals with the family joining over video call, and several arrange the samagri locally. Mention it on your first message — most profiles note whether they offer online participation.' },
  { q: 'Who arranges the puja samagri?', a: 'That is between you and the pandit ji. Every service page on our site lists the standard samagri so you know what to expect, and you can decide together who brings what. Always confirm this on the first call.' },
  { q: 'Is there a mobile app?', a: 'The website is fully mobile-responsive and works like an app on your phone. Native Android and iOS apps are in development — join the newsletter to hear first.' },
  { q: 'I am a pandit. How do I list myself?', a: 'Register from the Pandit Dashboard, complete your profile with education details and temple association, and submit for verification. The basic listing is free and always will be.' },
];

/* ------------------------------------------------------------------ stats */
PC.stats = [
  { icon: 'user', num: '500+', label: 'Registered Pandits' },
  { icon: 'temple', num: '200+', label: 'Associated Temples' },
  { icon: 'kalash', num: '10,000+', label: 'Ceremonies Conducted' },
  { icon: 'map-pin', num: '60+', label: 'Cities Covered' },
];

/* ----------------------------------------------------- AI recommender rules
   Keyword → suggested services. Deliberately transparent and local: no
   network call, and the reasoning is shown to the user.
---------------------------------------------------------------------------- */
PC.recommendRules = [
  { keys: ['new home', 'naya ghar', 'new house', 'flat', 'shifting', 'moving', 'griha'], svc: ['griha-pravesh', 'satyanarayan-vrat', 'ganesh-puja'], why: 'Moving into a new home calls for Vastu Shanti and Griha Pravesh before the first night is spent there.' },
  { keys: ['marriage', 'shaadi', 'wedding', 'vivah', 'engagement', 'sagai'], svc: ['wedding', 'kundali', 'ganesh-puja'], why: 'For a marriage, kundali milan and muhurat come first, then the Vivah Sanskar itself.' },
  { keys: ['health', 'illness', 'bimari', 'hospital', 'surgery', 'operation', 'recovery'], svc: ['mahamrityunjay', 'rudrabhishek', 'durga-path'], why: 'Mahamrityunjay jaap is the traditional anusthan for health and recovery, often paired with Rudrabhishek.' },
  { keys: ['money', 'paisa', 'loss', 'business', 'shop', 'office', 'job', 'career', 'promotion'], svc: ['shop-opening', 'satyanarayan-diwali', 'satyanarayan-katha'], why: 'For business and financial matters, Lakshmi-Kuber puja and Satyanarayan Katha are the usual recommendations.' },
  { keys: ['baby', 'child', 'bachcha', 'newborn', 'naming', 'mundan', 'annaprashan'], svc: ['namkaran', 'mundan', 'annaprashan'], why: 'The childhood sanskars follow a sequence — Namkaran, Annaprashan, then Mundan on a shubh muhurat.' },
  { keys: ['death', 'passed away', 'father', 'mother', 'shradh', 'pitru', 'ancestor', 'asthi'], svc: ['pitru-dosh', 'antim-sanskar'], why: 'Shradh, Tarpan and Pind daan bring peace to ancestors; Haridwar, Gaya and Puri are the traditional venues.' },
  { keys: ['planet', 'kundali', 'dosh', 'rahu', 'ketu', 'shani', 'sade sati', 'mangal', 'horoscope'], svc: ['navgrah-shanti', 'kaal-sarp', 'satyanarayan-shanti', 'kundali'], why: 'Planetary troubles need a kundali reading first, then only the specific graha shanti your chart calls for.' },
  { keys: ['fear', 'obstacle', 'rukavat', 'problem', 'tension', 'stress', 'peace', 'shanti'], svc: ['sunderkand', 'havan-yagna', 'ganesh-puja'], why: 'Sunderkand path and a Ganesh havan are the gentle, widely-recommended remedies for obstacles and unease.' },
  { keys: ['navratri', 'durga', 'devi', 'mata', 'jagran'], svc: ['durga-path', 'navratri-sthapana', 'katha-jagran'], why: 'For Devi upasana, Durga Saptashati path and Kalash Sthapana are the core rituals.' },
  { keys: ['construction', 'plot', 'land', 'building', 'foundation'], svc: ['bhoomi-pujan', 'satyanarayan-vrat'], why: 'Bhoomi Pujan and Shilanyas are performed before construction begins on a plot.' },
  { keys: ['diwali', 'lakshmi', 'ganesh chaturthi', 'holi', 'chhath', 'festival'], svc: ['satyanarayan-diwali', 'ganesh-utsav', 'holika-dahan', 'chhath'], why: 'Festival pujas are muhurat-sensitive — booking a pandit ji two weeks ahead is wise.' },
  { keys: ['thread', 'janeu', 'upanayan', 'yagyopavit'], svc: ['janeu'], why: 'Upanayan Sanskar marks the start of Vedic study and is performed with Gayatri diksha.' },
];
