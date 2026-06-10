/**
 * Barcode generator for WeChat Mini Program
 * Supports CODE128, CODE39, EAN13 formats.
 * Pure JS implementation that draws on canvas.
 */

// CODE128 character sets
const CODE128 = {
  // Encodings for A, B, C
  A: 0,
  B: 1,
  C: 2,

  // CODE128 patterns: [value, bits, bars]
  // Each pattern defines bar-width sequences represented as bit positions
};

// CODE128 bar patterns: each element is [bar, space, bar, space, bar, space]
// bar=1 means a bar, space=0 means space (alternating: starts with bar)
const CODE128_PATTERNS = [
  [2, 1, 2, 2, 2, 2], // 0
  [2, 2, 2, 1, 2, 2],
  [2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2],
  [1, 2, 2, 2, 1, 3],
  [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2],
  [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2],
  [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2],
  [1, 2, 2, 1, 3, 2],
  [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2],
  [1, 2, 3, 2, 2, 1],
  [2, 2, 3, 2, 1, 1],
  [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1],
  [2, 1, 3, 2, 1, 2],
  [2, 2, 3, 1, 1, 2],
  [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2],
  [3, 2, 1, 2, 2, 1],
  [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2],
  [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3],
  [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1],
  [1, 1, 1, 3, 2, 3],
  [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3],
  [1, 3, 2, 1, 1, 3],
  [1, 3, 2, 3, 1, 1],
  [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3],
  [2, 3, 1, 3, 1, 1],
  [1, 1, 2, 1, 3, 3],
  [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3],
  [1, 1, 3, 3, 2, 1],
  [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1],
  [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1],
  [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1],
  [2, 1, 3, 1, 3, 1],
  [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1],
  [3, 1, 2, 1, 1, 3],
  [3, 1, 2, 3, 1, 1],
  [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1],
  [2, 2, 1, 4, 1, 1],
  [4, 3, 1, 1, 1, 1],
  [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4],
  [1, 2, 1, 4, 2, 1],
  [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1],
  [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2],
  [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1],
  [1, 4, 2, 1, 1, 2],
  [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4],
  [4, 1, 3, 1, 1, 1],
  [2, 4, 1, 1, 1, 2],
  [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2],
  [1, 2, 1, 1, 4, 2],
  [1, 2, 1, 2, 4, 1],
  [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1],
  [4, 1, 1, 2, 1, 2],
  [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1],
  [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1],
  [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3],
  [1, 1, 1, 3, 4, 1],
  [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1],
  [4, 1, 1, 1, 1, 3],
  [4, 1, 1, 3, 1, 1],
  [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1],
  [3, 1, 1, 1, 4, 1],
  [4, 1, 1, 1, 3, 1],
  [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4],
  [2, 1, 1, 2, 3, 2],
  [2, 3, 3, 1, 1, 1, 2],
];

// Start codes
const START_A = 103;
const START_B = 104;
const START_C = 105;
const STOP = 106;

// CODE128 value to character mapping for set A
function getCodeAChar(val) {
  if (val < 32) return String.fromCharCode(val + 64); // NUL..?
  if (val < 64) return String.fromCharCode(val);       // space..?
  if (val < 96) return String.fromCharCode(val - 64);  // @.._
  return "";
}

// CODE128 value to character mapping for set B
function getCodeBChar(val) {
  if (val < 32) return String.fromCharCode(val + 64);
  if (val < 96) return String.fromCharCode(val);
  return "";
}

// Check if character is valid for set B (0-95)
function isSetB(val) {
  return val >= 32 && val <= 126;
}

// Check if string contains only digits
function isDigits(s) {
  return /^\d+$/.test(s);
}

// Encode text to CODE128 pattern indices (including start, checksum, stop)
function encodeCode128(text) {
  const chars = [];
  const codes = [];
  let pos = 0;

  // Choose optimal encoding
  // Try to use Code C (pairs of digits) where possible

  while (pos < text.length) {
    // Check if we can use Code C for at least 4 digit pairs
    let lookAhead = pos;
    let digitRun = 0;
    while (lookAhead < text.length && /\d/.test(text[lookAhead])) {
      digitRun++;
      lookAhead++;
    }

    if (digitRun >= 4) {
      // Use Code C for pairs of digits
      if (codes.length === 0) {
        codes.push(START_C);
        pushCodeCDigits(text, pos, digitRun, codes);
      } else {
        codes.push(99); // Switch to Code C
        pushCodeCDigits(text, pos, digitRun, codes);
      }
      pos += digitRun;
    } else {
      // Use Code B
      if (codes.length === 0) codes.push(START_B);
      const c = text.charCodeAt(pos);
      if (isSetB(c)) {
        codes.push(c - 32);
      } else {
        // Fallback: use a safe value
        codes.push(c % 96);
      }
      pos++;
    }
  }

  // Calculate checksum
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  checksum = checksum % 103;
  codes.push(checksum);
  codes.push(STOP);

  return codes;
}

// Push digit pairs as Code C values
function pushCodeCDigits(text, start, length, codes) {
  const digits = text.substring(start, start + length);
  // Make even number of digits
  let d = digits;
  if (d.length % 2 !== 0) {
    // Odd number: encode first digit in Code B, rest in Code C
    if (codes.length > 0 && codes[codes.length - 1] !== START_C) {
      codes.push(parseInt(d[0]));
      d = d.substring(1);
    }
  }
  for (let i = 0; i < d.length; i += 2) {
    codes.push(parseInt(d.substring(i, i + 2)));
  }
}

/**
 * Draw CODE128 barcode on canvas
 * @param {string} text - Content to encode
 * @param {object} ctx - WeChat canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {object} options - { foreground, background, barWidth }
 */
function drawCode128(text, ctx, width, height, options) {
  const opts = Object.assign(
    { foreground: "#000000", background: "#FFFFFF", showText: true },
    options || {}
  );

  const codes = encodeCode128(text);

  // Calculate total bar units
  let totalUnits = 0;
  const bars = [];
  for (let i = 0; i < codes.length; i++) {
    const pattern = CODE128_PATTERNS[codes[i]];
    for (let j = 0; j < pattern.length; j++) {
      bars.push(j % 2 === 0); // true = bar (dark), false = space (light)
      bars.push(pattern[j]);   // width
      totalUnits += pattern[j];
    }
  }

  // Calculate bar module size
  const textHeight = opts.showText ? 30 : 0;
  const barHeight = height - textHeight - 10;
  const moduleWidth = Math.max(1, Math.floor(width / totalUnits));

  // Clear canvas
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, width, height);

  // Draw bars
  let x = Math.floor((width - totalUnits * moduleWidth) / 2);
  ctx.fillStyle = opts.foreground;

  for (let i = 0; i < bars.length; i += 2) {
    const isBar = bars[i];
    const barWidth = bars[i + 1] * moduleWidth;
    if (isBar) {
      ctx.fillRect(x, 10, barWidth, barHeight);
    }
    x += barWidth;
  }

  // Draw text
  if (opts.showText) {
    ctx.fillStyle = opts.foreground;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      text,
      width / 2,
      height - 8
    );
  }
}

/**
 * EAN-13 barcode generator
 */
function encodeEAN13(text) {
  if (!/^\d{12,13}$/.test(text)) {
    throw new Error("EAN-13 requires 12 or 13 digits");
  }
  let digits = text.substring(0, 12);
  if (text.length === 13) digits = text.substring(0, 12);

  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  digits += check;

  return {
    digits: digits,
    check: check,
  };
}

// EAN-13 encoding patterns
const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];

// Parity patterns for first digit
const EAN_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/**
 * Draw EAN-13 barcode on canvas
 */
function drawEAN13(text, ctx, width, height, options) {
  const opts = Object.assign(
    { foreground: "#000000", background: "#FFFFFF", showText: true },
    options || {}
  );

  const ean = encodeEAN13(text);
  const digits = ean.digits;
  const firstDigit = parseInt(digits[0]);
  const parity = EAN_PARITY[firstDigit];

  // Build pattern
  let pattern = "101"; // Start guard
  for (let i = 0; i < 6; i++) {
    const encoding = parity[i];
    const digit = parseInt(digits[i + 1]);
    if (encoding === "L") pattern += EAN_L[digit];
    else if (encoding === "G") pattern += EAN_G[digit];
  }
  pattern += "01010"; // Middle guard
  for (let i = 6; i < 12; i++) {
    const digit = parseInt(digits[i + 1]);
    pattern += EAN_R[digit];
  }
  pattern += "101"; // End guard

  const totalUnits = pattern.length;
  const textHeight = opts.showText ? 28 : 0;
  const barHeight = height - textHeight - 10;
  const moduleWidth = Math.max(1, Math.floor(width / totalUnits));

  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, width, height);

  let x = Math.floor((width - totalUnits * moduleWidth) / 2);
  ctx.fillStyle = opts.foreground;

  for (let i = 0; i < totalUnits; i++) {
    if (pattern[i] === "1") {
      // Draw longer bar for guard patterns
      let h = barHeight;
      const isStart = i < 3 || (i >= pattern.length - 3);
      const isMid = i >= totalUnits / 2 - 3 && i <= totalUnits / 2 + 2;
      if (isStart || isMid) {
        h = barHeight + 10;
      }
      ctx.fillRect(x, 10, moduleWidth, h);
    }
    x += moduleWidth;
  }

  if (opts.showText) {
    ctx.fillStyle = opts.foreground;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    // First digit below start
    ctx.fillText(digits[0], Math.floor((width - totalUnits * moduleWidth) / 2) - 12, height - 4);
    // Middle 6 digits
    const barStart = Math.floor((width - totalUnits * moduleWidth) / 2);
    ctx.fillText(
      digits.substring(1, 7),
      barStart + moduleWidth * Math.floor(totalUnits / 4),
      height - 4
    );
    // Last 6 digits
    ctx.fillText(
      digits.substring(7, 13),
      barStart + moduleWidth * Math.floor((totalUnits * 3) / 4),
      height - 4
    );
  }
}

/**
 * CODE39 barcode generator
 */
function encodeCode39(text) {
  const CODE39_TABLE = {
    "0": "101001101101", "1": "110100101011", "2": "101100101011",
    "3": "110110010101", "4": "101001101011", "5": "110100110101",
    "6": "101100110101", "7": "101001011011", "8": "110100101101",
    "9": "101100101101", "A": "110101001011", "B": "101101001011",
    "C": "110110100101", "D": "101011001011", "E": "110101100101",
    "F": "101101100101", "G": "101010011011", "H": "110101001101",
    "I": "101101001101", "J": "101011001101", "K": "110101010011",
    "L": "101101010011", "M": "110110101001", "N": "101011010011",
    "O": "110101101001", "P": "101101101001", "Q": "101010110011",
    "R": "110101011001", "S": "101101011001", "T": "101011011001",
    "U": "110010101011", "V": "100110101011", "W": "110011010101",
    "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
    "-": "100101011011", ".": "110010101101", " ": "100110101101",
    "$": "100100100101", "/": "100100101001", "+": "100101001001",
    "%": "101001001001", "*": "100101101101",
  };

  const upperText = text.toUpperCase();
  let pattern = CODE39_TABLE["*"] + "0"; // Start character with inter-char gap

  for (let i = 0; i < upperText.length; i++) {
    const c = upperText[i];
    if (CODE39_TABLE[c] !== undefined) {
      if (i > 0) pattern += "0"; // inter-character gap
      pattern += CODE39_TABLE[c];
    }
  }
  pattern += "0" + CODE39_TABLE["*"]; // End character

  return pattern;
}

/**
 * Draw CODE39 barcode on canvas
 */
function drawCode39(text, ctx, width, height, options) {
  const opts = Object.assign(
    { foreground: "#000000", background: "#FFFFFF", showText: true },
    options || {}
  );

  const pattern = encodeCode39(text);
  const totalUnits = pattern.length;
  const textHeight = opts.showText ? 28 : 0;
  const barHeight = height - textHeight - 10;
  const moduleWidth = Math.max(1, Math.floor(width / totalUnits));

  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, width, height);

  let x = Math.floor((width - totalUnits * moduleWidth) / 2);
  ctx.fillStyle = opts.foreground;

  for (let i = 0; i < totalUnits; i++) {
    const isNarrow = pattern[i] === "1"; // In Code39, "1"=bar, "0"=space
    if (isNarrow) {
      ctx.fillRect(x, 10, moduleWidth, barHeight);
    }
    x += moduleWidth;
  }

  if (opts.showText) {
    ctx.fillStyle = opts.foreground;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("*" + text.toUpperCase() + "*", width / 2, height - 4);
  }
}

// Bar formats
const BARCODE_FORMATS = {
  CODE128: "code128",
  CODE39: "code39",
  EAN13: "ean13",
};

/**
 * Main draw function - renders barcode on WeChat canvas
 * @param {string} text - Content to encode
 * @param {string} format - Barcode format (code128, code39, ean13)
 * @param {object} ctx - Canvas 2d context
 * @param {number} width - Canvas width in px
 * @param {number} height - Canvas height in px
 * @param {object} options - Style options
 */
function drawBarcode(text, format, ctx, width, height, options) {
  switch (format) {
    case BARCODE_FORMATS.CODE128:
      drawCode128(text, ctx, width, height, options);
      break;
    case BARCODE_FORMATS.CODE39:
      drawCode39(text, ctx, width, height, options);
      break;
    case BARCODE_FORMATS.EAN13:
      drawEAN13(text, ctx, width, height, options);
      break;
    default:
      // Default to CODE128
      drawCode128(text, ctx, width, height, options);
  }
}

module.exports = {
  drawBarcode: drawBarcode,
  BARCODE_FORMATS: BARCODE_FORMATS,
  encodeCode128: encodeCode128,
  encodeCode39: encodeCode39,
  encodeEAN13: encodeEAN13,
};
