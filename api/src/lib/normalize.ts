// Lowercase and strip everything except letters, digits, dots and slashes.
const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9.\/]+/g, '');

// "500 MG", "500mgs", "500 milligrams" -> "500mg"
export const normStrength = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '').replace(/milligrams?|mgs?/g, 'mg').replace(/,/g, '.');

export interface MedicineIdentity {
  brand_name: string;
  generic_name: string;
  strength: string;
  pack_size: string;
}

export const matchKey = (m: MedicineIdentity) =>
  [n(m.brand_name), n(m.generic_name), normStrength(m.strength), n(m.pack_size)].join('|');
