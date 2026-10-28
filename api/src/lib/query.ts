import { normStrength } from './normalize';

export interface ParsedQuery {
  text: string;                                         // what we match names against
  strength: { num: string; unit: string | null } | null;
  cleaned: string;                                      // the whole query, tidied (used for logging)
}

// "amoxicillin 500mg" -> text "amoxicillin", strength 500 mg
export function parseQuery(raw: string): ParsedQuery {
  const cleaned = raw.replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/(^|\s)(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|ml|iu|%)?(?=\s|$)/i);
  if (m && m.index !== undefined) {
    const text = (cleaned.slice(0, m.index) + ' ' + cleaned.slice(m.index + m[0].length))
      .replace(/\s+/g, ' ').trim();
    if (text.length >= 2) {   // a query that is ONLY a number stays a name search
      return { text, strength: { num: m[2].replace(',', '.'), unit: m[3] ? m[3].toLowerCase() : null }, cleaned };
    }
  }
  return { text: cleaned, strength: null, cleaned };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does a medicine's strength match what the customer asked for?
// "500" matches 500mg but not 5000mg or 50mg. "5mg" does not match "50mg".
export function strengthMatches(strength: string, q: ParsedQuery['strength']): boolean {
  if (!q) return false;
  const re = new RegExp('^' + escapeRe(q.num) + (q.unit ? escapeRe(q.unit) : '') + '(?![0-9.])');
  return re.test(normStrength(strength));
}