/**
 * Display names for exactly the codes countryFromPhone() can return (see
 * services/distribution/market.js DIAL_CODES). Shared by the pandit's own
 * analytics endpoint and the admin equivalent so there is one label table,
 * not two copies drifting apart — an unmapped code still renders (falls back
 * to the raw ISO code at the call site), it just won't have a friendly label
 * yet.
 */
const COUNTRY_NAMES = {
  IN: 'India', NP: 'Nepal', BD: 'Bangladesh', LK: 'Sri Lanka', US: 'United States',
  GB: 'United Kingdom', AE: 'UAE', AU: 'Australia', SG: 'Singapore', MY: 'Malaysia',
  NZ: 'New Zealand', ZA: 'South Africa', SA: 'Saudi Arabia', QA: 'Qatar', OM: 'Oman',
  BH: 'Bahrain', KW: 'Kuwait', DE: 'Germany', FR: 'France', IT: 'Italy', NL: 'Netherlands',
  CH: 'Switzerland', SE: 'Sweden', NO: 'Norway', IE: 'Ireland', PT: 'Portugal', ES: 'Spain',
  JP: 'Japan', KR: 'South Korea', HK: 'Hong Kong', TH: 'Thailand',
};

module.exports = { COUNTRY_NAMES };
