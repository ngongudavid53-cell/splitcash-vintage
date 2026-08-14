// Six-character invite codes, drawn from an unambiguous alphabet
// (no 0/O, 1/I/L) so they survive being read out over a bad phone line.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomInviteCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
