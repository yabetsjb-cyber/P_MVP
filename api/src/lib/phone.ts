// Accepts 0911223344, 911223344, +251911223344, 251 91 122 3344 (09 = Ethio telecom, 07 = Safaricom)
// Returns "+251911223344" or null if invalid
export function normalizeEthiopianPhone(input: string): string | null {
  const s = input.replace(/[\s-]/g, '');
  const m = s.match(/^(?:\+251|251|0)?([79]\d{8})$/);
  return m ? `+251${m[1]}` : null;
}

// this will be used for phone message for later

