/** 6-stelliger Lobby-Code, Grossbuchstaben ohne I, O, 0, 1 (leicht zu verwechseln). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateLobbyCode(rand: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = Math.floor(rand() * CODE_ALPHABET.length);
    code += CODE_ALPHABET[index] ?? "A";
  }
  return code;
}

export function isValidLobbyCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) {
    return false;
  }
  return [...code.toUpperCase()].every((char) => CODE_ALPHABET.includes(char));
}
