// Mapeia o nome de país (como aparece na base OpenFlights, em inglês) pro
// continente/região — usado pra permitir buscar "qualquer lugar na Europa"
// em vez de um destino específico. Agrupamento pensado do jeito que
// brasileiros costumam categorizar (América Central e Caribe separado da
// América do Norte, Oriente Médio separado da Ásia).
const REGIONS = {
  SA: {
    label: 'América do Sul',
    countries: [
      'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Falkland Islands',
      'French Guiana', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela',
    ],
  },
  CA: {
    label: 'América Central e Caribe',
    countries: [
      'Anguilla', 'Antigua and Barbuda', 'Aruba', 'Bahamas', 'Barbados', 'Belize', 'Bermuda',
      'British Virgin Islands', 'Cayman Islands', 'Costa Rica', 'Cuba', 'Dominica',
      'Dominican Republic', 'El Salvador', 'Grenada', 'Guadeloupe', 'Guatemala', 'Haiti',
      'Curaçao', 'Honduras', 'Jamaica', 'Martinique', 'Montserrat', 'Netherlands Antilles', 'Nicaragua',
      'Sint Maarten',
      'Panama', 'Puerto Rico', 'Saint Kitts and Nevis', 'Saint Lucia',
      'Saint Vincent and the Grenadines', 'Trinidad and Tobago', 'Turks and Caicos Islands',
      'Virgin Islands',
    ],
  },
  NA: {
    label: 'América do Norte',
    countries: ['Canada', 'Greenland', 'Mexico', 'United States', 'Saint Pierre and Miquelon'],
  },
  EU: {
    label: 'Europa',
    countries: [
      'Albania', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia',
      'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Faroe Islands', 'Finland', 'France',
      'Germany', 'Gibraltar', 'Greece', 'Guernsey', 'Hungary', 'Iceland', 'Ireland', 'Isle of Man',
      'Italy', 'Jersey', 'Latvia', 'Lithuania', 'Luxembourg', 'Macedonia', 'Malta', 'Moldova',
      'Montenegro', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Russia', 'Serbia',
      'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom',
    ],
  },
  ME: {
    label: 'Oriente Médio',
    countries: [
      'Bahrain', 'Iran', 'Iraq', 'Israel', 'Jordan', 'Kuwait', 'Lebanon', 'Oman', 'Palestine',
      'Qatar', 'Saudi Arabia', 'Syria', 'Turkey', 'United Arab Emirates', 'Yemen',
    ],
  },
  AF: {
    label: 'África',
    countries: [
      'Algeria', 'Angola', 'Benin', 'Botswana', 'British Indian Ocean Territory', 'Burkina Faso',
      'Burundi', 'Cameroon', 'Cape Verde', 'Central African Republic', 'Chad', 'Comoros',
      'Congo (Brazzaville)', 'Congo (Kinshasa)', "Cote d'Ivoire", 'Djibouti', 'Egypt',
      'Equatorial Guinea', 'Eritrea', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea',
      'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali',
      'Mauritania', 'Mauritius', 'Mayotte', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria',
      'Reunion', 'Rwanda', 'Saint Helena', 'Sao Tome and Principe', 'Senegal', 'Seychelles',
      'Sierra Leone', 'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Swaziland', 'Tanzania',
      'Togo', 'Tunisia', 'Uganda', 'Western Sahara', 'Zambia', 'Zimbabwe',
    ],
  },
  AS: {
    label: 'Ásia',
    countries: [
      'Afghanistan', 'Armenia', 'Azerbaijan', 'Bangladesh', 'Bhutan', 'Brunei', 'Burma', 'Cambodia',
      'China', 'East Timor', 'Georgia', 'Hong Kong', 'India', 'Indonesia', 'Japan', 'Kazakhstan',
      'Kyrgyzstan', 'Laos', 'Macau', 'Malaysia', 'Maldives', 'Mongolia', 'Nepal', 'North Korea',
      'Pakistan', 'Philippines', 'Singapore', 'South Korea', 'Sri Lanka', 'Taiwan', 'Tajikistan',
      'Thailand', 'Turkmenistan', 'Uzbekistan', 'Vietnam',
    ],
  },
  OC: {
    label: 'Oceania',
    countries: [
      'American Samoa', 'Australia', 'Christmas Island', 'Cocos (Keeling) Islands', 'Cook Islands',
      'Fiji', 'French Polynesia', 'Guam', 'Johnston Atoll', 'Kiribati', 'Marshall Islands',
      'Micronesia', 'Midway Islands', 'Nauru', 'New Caledonia', 'New Zealand', 'Niue',
      'Norfolk Island', 'Northern Mariana Islands', 'Palau', 'Papua New Guinea', 'Samoa',
      'Solomon Islands', 'Tonga', 'Tuvalu', 'Vanuatu', 'Wake Island', 'Wallis and Futuna',
    ],
  },
};

const COUNTRY_TO_REGION = {};
for (const [code, region] of Object.entries(REGIONS)) {
  for (const country of region.countries) {
    COUNTRY_TO_REGION[country] = code;
  }
}

function getRegionForCountry(country) {
  return COUNTRY_TO_REGION[country] || null;
}

function listRegions() {
  return Object.entries(REGIONS).map(([code, r]) => ({ code, label: r.label }));
}

module.exports = { REGIONS, getRegionForCountry, listRegions };
