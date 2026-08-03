const PIN_KDF = "pbkdf2-sha256";
const PIN_ITERATIONS = 310_000;
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fromHex(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return new Uint8Array(
    value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePin(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePin(pin, salt, PIN_ITERATIONS);
  return `${PIN_KDF}$${PIN_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPin(
  pin: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText] =
    storedHash.split("$");
  if (algorithm === PIN_KDF) {
    const iterations = Number(iterationsText);
    const salt = fromHex(saltText);
    const expected = fromHex(expectedText);
    if (
      !Number.isSafeInteger(iterations) ||
      iterations < 100_000 ||
      !salt ||
      !expected
    )
      return false;
    return constantTimeEqual(await derivePin(pin, salt, iterations), expected);
  }

  const expected = fromHex(storedHash);
  if (!expected || expected.length !== 32) return false;
  const legacy = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`soletrader-pin:${pin}`),
    ),
  );
  return constantTimeEqual(legacy, expected);
}

export function pinHashNeedsUpgrade(storedHash: string) {
  return !storedHash.startsWith(`${PIN_KDF}$${PIN_ITERATIONS}$`);
}
