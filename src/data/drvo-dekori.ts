// Paleta drvenih dekora za aplikaciju za ograde.
// Boje su približne (sRGB, za prikaz na ekranu), nisu zvanične boje proizvođača.
// renolit: šifre potvrđene u REHAU Colour Inspiration brošuri; ostale nisu proverene, pa nisu navedene.

export type WoodGroup = 'Svetli' | 'Srednji' | 'Tamni' | 'Crvenkasti' | 'Sivi i moderni';

export interface WoodDecor {
  id: string;
  name: string;      // srpski naziv
  nameEn: string;
  group: WoodGroup;
  hex: string;       // osnovna boja
  light: string;     // svetliji ton (npr. za highlight)
  dark: string;      // tamniji ton (npr. za senku/ivicu)
  renolit?: string;
}

export const WOOD_DECORS: WoodDecor[] = [
  { id: 'javor', name: 'Javor', nameEn: 'Maple', group: 'Svetli', hex: '#E6C79A', light: '#ECD3B0', dark: '#AC9574' },
  { id: 'breza', name: 'Breza', nameEn: 'Birch', group: 'Svetli', hex: '#E8D4AE', light: '#EDDDC0', dark: '#AE9F82' },
  { id: 'bukva', name: 'Bukva', nameEn: 'Beech', group: 'Svetli', hex: '#D9A877', light: '#E1BB95', dark: '#A37E59' },
  { id: 'jasen', name: 'Jasen', nameEn: 'Ash', group: 'Svetli', hex: '#E1CCA4', light: '#E8D7B8', dark: '#A9997B' },
  { id: 'bor', name: 'Bor', nameEn: 'Pine', group: 'Svetli', hex: '#E0B676', light: '#E7C694', dark: '#A88858' },
  { id: 'smrca', name: 'Smrča', nameEn: 'Spruce', group: 'Svetli', hex: '#EAD3A1', light: '#EFDDB6', dark: '#B09E79' },
  { id: 'izbeljeni-hrast', name: 'Izbeljeni hrast', nameEn: 'White oak', group: 'Svetli', hex: '#D9CAB0', light: '#E1D6C1', dark: '#A39884' },
  { id: 'hrast-natur', name: 'Hrast natur', nameEn: 'Natural oak', group: 'Svetli', hex: '#C9A06B', light: '#D5B58C', dark: '#977850' },
  { id: 'hrast-sonoma', name: 'Hrast sonoma', nameEn: 'Sonoma oak', group: 'Svetli', hex: '#C8A57A', light: '#D4B997', dark: '#967C5C' },
  { id: 'bambus', name: 'Bambus', nameEn: 'Bamboo', group: 'Svetli', hex: '#D4B072', light: '#DDC191', dark: '#9F8456' },
  { id: 'kruska', name: 'Kruška', nameEn: 'Pear', group: 'Srednji', hex: '#C8875E', light: '#D4A181', dark: '#966546' },
  { id: 'medeni-hrast', name: 'Medeni hrast', nameEn: 'Honey oak', group: 'Srednji', hex: '#C28A45', light: '#CFA46E', dark: '#926834' },
  { id: 'zlatni-hrast', name: 'Zlatni hrast', nameEn: 'Golden oak', group: 'Srednji', hex: '#B0712F', light: '#C1905D', dark: '#845523', renolit: '9.2178 001' },
  { id: 'teak', name: 'Teak', nameEn: 'Teak', group: 'Srednji', hex: '#A8743A', light: '#BB9365', dark: '#7E572C' },
  { id: 'parena-bukva', name: 'Parena bukva', nameEn: 'Steamed beech', group: 'Srednji', hex: '#C17F4E', light: '#CF9B75', dark: '#915F3A' },
  { id: 'brest', name: 'Brest', nameEn: 'Elm', group: 'Srednji', hex: '#A87E55', light: '#BB9A7A', dark: '#7E5E40' },
  { id: 'hrast-rustik', name: 'Hrast rustik', nameEn: 'Rustic oak', group: 'Srednji', hex: '#9C7448', light: '#B29370', dark: '#755736' },
  { id: 'hrast-halifax', name: 'Hrast halifax', nameEn: 'Halifax oak', group: 'Srednji', hex: '#A88358', light: '#BB9E7D', dark: '#7E6242' },
  { id: 'akacija', name: 'Akacija', nameEn: 'Acacia', group: 'Srednji', hex: '#A06A3B', light: '#B58B66', dark: '#78502C' },
  { id: 'iroko', name: 'Iroko', nameEn: 'Iroko', group: 'Srednji', hex: '#9C6B3A', light: '#B28C65', dark: '#75502C' },
  { id: 'maslina', name: 'Maslina', nameEn: 'Olive', group: 'Srednji', hex: '#B8A16D', light: '#C8B68D', dark: '#8A7952' },
  { id: 'zebrano', name: 'Zebrano', nameEn: 'Zebrano', group: 'Srednji', hex: '#C9A77C', light: '#D5BA99', dark: '#977D5D' },
  { id: 'orah-svetli', name: 'Orah svetli', nameEn: 'Light walnut', group: 'Srednji', hex: '#8E6A48', light: '#A78B70', dark: '#6A5036' },
  { id: 'orah', name: 'Orah', nameEn: 'Walnut', group: 'Tamni', hex: '#5E4130', light: '#816B5E', dark: '#463124', renolit: '9.2718 007' },
  { id: 'orah-tamni', name: 'Orah tamni', nameEn: 'Dark walnut', group: 'Tamni', hex: '#4D3424', light: '#746154', dark: '#3A271B' },
  { id: 'tamni-hrast', name: 'Tamni hrast', nameEn: 'Dark oak', group: 'Tamni', hex: '#4B3121', light: '#735E52', dark: '#382519' },
  { id: 'mocvarni-hrast', name: 'Močvarni hrast', nameEn: 'Bog oak', group: 'Tamni', hex: '#3B2A1E', light: '#665950', dark: '#2C2016', renolit: '9.2052 089' },
  { id: 'wenge', name: 'Wenge', nameEn: 'Wenge', group: 'Tamni', hex: '#3A2A20', light: '#655951', dark: '#2C2018' },
  { id: 'ebanovina', name: 'Ebanovina', nameEn: 'Ebony', group: 'Tamni', hex: '#2A1F1A', light: '#59504C', dark: '#201714' },
  { id: 'palisander', name: 'Palisander', nameEn: 'Rosewood', group: 'Tamni', hex: '#5A2E22', light: '#7E5C53', dark: '#44221A' },
  { id: 'merbau', name: 'Merbau', nameEn: 'Merbau', group: 'Tamni', hex: '#6B3A22', light: '#8C6553', dark: '#502C1A' },
  { id: 'hrast-kolonijal', name: 'Hrast kolonijal', nameEn: 'Colonial oak', group: 'Tamni', hex: '#6E4A2C', light: '#8E725A', dark: '#523821' },
  { id: 'mahagoni', name: 'Mahagoni', nameEn: 'Mahogany', group: 'Crvenkasti', hex: '#6E2D1F', light: '#8E5B50', dark: '#522217', renolit: '9.2065 021' },
  { id: 'sapeli', name: 'Sapeli', nameEn: 'Sapele', group: 'Crvenkasti', hex: '#8A3E25', light: '#A46855', dark: '#682E1C' },
  { id: 'meranti', name: 'Meranti', nameEn: 'Meranti', group: 'Crvenkasti', hex: '#9A4A2E', light: '#B0725C', dark: '#743822' },
  { id: 'sipo', name: 'Sipo', nameEn: 'Sipo', group: 'Crvenkasti', hex: '#7A3A22', light: '#976553', dark: '#5C2C1A' },
  { id: 'tresnja', name: 'Trešnja', nameEn: 'Cherry', group: 'Crvenkasti', hex: '#A0522D', light: '#B5785B', dark: '#783E22' },
  { id: 'tresnja-tamna', name: 'Trešnja tamna', nameEn: 'Dark cherry', group: 'Crvenkasti', hex: '#7B3220', light: '#985F51', dark: '#5C2618' },
  { id: 'padouk', name: 'Padouk', nameEn: 'Padauk', group: 'Crvenkasti', hex: '#A13D2D', light: '#B6685B', dark: '#792E22' },
  { id: 'jatoba', name: 'Jatoba', nameEn: 'Jatoba', group: 'Crvenkasti', hex: '#7A3B26', light: '#976656', dark: '#5C2C1C' },
  { id: 'bianco-drvo', name: 'Bianco drvo', nameEn: 'White wood', group: 'Sivi i moderni', hex: '#ECE5D8', light: '#F0EBE1', dark: '#B1ACA2' },
  { id: 'driftwood', name: 'Driftwood', nameEn: 'Driftwood', group: 'Sivi i moderni', hex: '#A39A8C', light: '#B7B0A5', dark: '#7A7469' },
  { id: 'sivi-hrast', name: 'Sivi hrast', nameEn: 'Grey oak', group: 'Sivi i moderni', hex: '#8E8A82', light: '#A7A49E', dark: '#6A6862' },
  { id: 'hrast-grafit', name: 'Hrast grafit', nameEn: 'Graphite oak', group: 'Sivi i moderni', hex: '#5A5550', light: '#7E7A76', dark: '#44403C' },
  { id: 'antracit-drvo', name: 'Antracit drvo', nameEn: 'Anthracite wood', group: 'Sivi i moderni', hex: '#3D4042', light: '#686A6C', dark: '#2E3032' },
  { id: 'crni-hrast', name: 'Crni hrast', nameEn: 'Black oak', group: 'Sivi i moderni', hex: '#2E2A27', light: '#5C5957', dark: '#22201D' },
  { id: 'winchester', name: 'Winchester', nameEn: 'Winchester', group: 'Sivi i moderni', hex: '#9A6A3F', light: '#B08B69', dark: '#74502F' },
  { id: 'hrast-vintage', name: 'Hrast vintage', nameEn: 'Vintage oak', group: 'Sivi i moderni', hex: '#7D6A55', light: '#9A8B7A', dark: '#5E5040' },
  { id: 'orah-nocce', name: 'Orah nocce', nameEn: 'Noce walnut', group: 'Tamni', hex: '#6A4A33', light: '#8B7260', dark: '#503826' },
  { id: 'bukva-tamna', name: 'Bukva tamna', nameEn: 'Dark beech', group: 'Srednji', hex: '#9A5F3A', light: '#B08265', dark: '#74472C' },
];

export const WOOD_GROUPS: WoodGroup[] = ['Svetli', 'Srednji', 'Tamni', 'Crvenkasti', 'Sivi i moderni'];

export const getDecor = (id: string) => WOOD_DECORS.find(d => d.id === id);
