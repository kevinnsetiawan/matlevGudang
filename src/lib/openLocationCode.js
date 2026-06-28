// Adapted from Google's Open Location Code (Plus Codes) reference implementation.
// Source: https://github.com/google/open-location-code (Apache License 2.0)
// Trimmed to only the functions this app needs: decode + recoverNearest (offline, no API/internet).

const SEPARATOR_ = "+";
const SEPARATOR_POSITION_ = 8;
const PADDING_CHARACTER_ = "0";
const CODE_ALPHABET_ = "23456789CFGHJMPQRVWX";
const ENCODING_BASE_ = CODE_ALPHABET_.length;
const LATITUDE_MAX_ = 90;
const LONGITUDE_MAX_ = 180;
const MIN_DIGIT_COUNT_ = 2;
const MAX_DIGIT_COUNT_ = 15;
const PAIR_CODE_LENGTH_ = 10;
const PAIR_FIRST_PLACE_VALUE_ = Math.pow(ENCODING_BASE_, PAIR_CODE_LENGTH_ / 2 - 1);
const PAIR_PRECISION_ = Math.pow(ENCODING_BASE_, 3);
const GRID_CODE_LENGTH_ = MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_;
const GRID_COLUMNS_ = 4;
const GRID_ROWS_ = 5;
const GRID_LAT_FIRST_PLACE_VALUE_ = Math.pow(GRID_ROWS_, GRID_CODE_LENGTH_ - 1);
const GRID_LNG_FIRST_PLACE_VALUE_ = Math.pow(GRID_COLUMNS_, GRID_CODE_LENGTH_ - 1);
const FINAL_LAT_PRECISION_ = PAIR_PRECISION_ * Math.pow(GRID_ROWS_, MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_);
const FINAL_LNG_PRECISION_ = PAIR_PRECISION_ * Math.pow(GRID_COLUMNS_, MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_);

function isValid(code) {
  if (!code || typeof code !== "string") return false;
  if (code.indexOf(SEPARATOR_) === -1) return false;
  if (code.indexOf(SEPARATOR_) !== code.lastIndexOf(SEPARATOR_)) return false;
  if (code.length === 1) return false;
  if (code.indexOf(SEPARATOR_) > SEPARATOR_POSITION_ || code.indexOf(SEPARATOR_) % 2 === 1) return false;
  if (code.indexOf(PADDING_CHARACTER_) > -1) {
    if (code.indexOf(SEPARATOR_) < SEPARATOR_POSITION_) return false;
    if (code.indexOf(PADDING_CHARACTER_) === 0) return false;
    const padMatch = code.match(new RegExp("(" + PADDING_CHARACTER_ + "+)", "g"));
    if (padMatch.length > 1 || padMatch[0].length % 2 === 1 || padMatch[0].length > SEPARATOR_POSITION_ - 2) return false;
    if (code.charAt(code.length - 1) !== SEPARATOR_) return false;
  }
  if (code.length - code.indexOf(SEPARATOR_) - 1 === 1) return false;
  const stripped = code.replace(new RegExp("\\" + SEPARATOR_ + "+"), "").replace(new RegExp(PADDING_CHARACTER_ + "+"), "");
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped.charAt(i).toUpperCase();
    if (ch !== SEPARATOR_ && CODE_ALPHABET_.indexOf(ch) === -1) return false;
  }
  return true;
}

function isShort(code) {
  if (!isValid(code)) return false;
  return code.indexOf(SEPARATOR_) >= 0 && code.indexOf(SEPARATOR_) < SEPARATOR_POSITION_;
}

function isFull(code) {
  if (!isValid(code) || isShort(code)) return false;
  const firstLatValue = CODE_ALPHABET_.indexOf(code.charAt(0).toUpperCase()) * ENCODING_BASE_;
  if (firstLatValue >= LATITUDE_MAX_ * 2) return false;
  if (code.length > 1) {
    const firstLngValue = CODE_ALPHABET_.indexOf(code.charAt(1).toUpperCase()) * ENCODING_BASE_;
    if (firstLngValue >= LONGITUDE_MAX_ * 2) return false;
  }
  return true;
}

function clipLatitude(lat) { return Math.min(90, Math.max(-90, lat)); }
function normalizeLongitude(lng) {
  while (lng < -180) lng += 360;
  while (lng >= 180) lng -= 360;
  return lng;
}

function locationToIntegers(latitude, longitude) {
  let latVal = Math.floor(latitude * FINAL_LAT_PRECISION_);
  latVal += LATITUDE_MAX_ * FINAL_LAT_PRECISION_;
  if (latVal < 0) latVal = 0;
  else if (latVal >= 2 * LATITUDE_MAX_ * FINAL_LAT_PRECISION_) latVal = 2 * LATITUDE_MAX_ * FINAL_LAT_PRECISION_ - 1;
  let lngVal = Math.floor(longitude * FINAL_LNG_PRECISION_);
  lngVal += LONGITUDE_MAX_ * FINAL_LNG_PRECISION_;
  if (lngVal < 0) lngVal = (lngVal % (2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_)) + 2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_;
  else if (lngVal >= 2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_) lngVal = lngVal % (2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_);
  return [latVal, lngVal];
}

function encodeIntegers(latInt, lngInt, codeLength) {
  if (typeof codeLength === "undefined") codeLength = 10;
  else codeLength = Math.min(MAX_DIGIT_COUNT_, Number(codeLength));
  if (codeLength < MIN_DIGIT_COUNT_ || (codeLength < PAIR_CODE_LENGTH_ && codeLength % 2 === 1)) {
    throw new Error("Invalid Open Location Code length");
  }
  const code = new Array(MAX_DIGIT_COUNT_ + 1);
  code[SEPARATOR_POSITION_] = SEPARATOR_;
  if (codeLength > PAIR_CODE_LENGTH_) {
    for (let i = MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_; i >= 1; i--) {
      const latDigit = latInt % GRID_ROWS_;
      const lngDigit = lngInt % GRID_COLUMNS_;
      const ndx = latDigit * GRID_COLUMNS_ + lngDigit;
      code[SEPARATOR_POSITION_ + 2 + i] = CODE_ALPHABET_.charAt(ndx);
      latInt = Math.floor(latInt / GRID_ROWS_);
      lngInt = Math.floor(lngInt / GRID_COLUMNS_);
    }
  } else {
    latInt = Math.floor(latInt / Math.pow(GRID_ROWS_, GRID_CODE_LENGTH_));
    lngInt = Math.floor(lngInt / Math.pow(GRID_COLUMNS_, GRID_CODE_LENGTH_));
  }
  code[SEPARATOR_POSITION_ + 1] = CODE_ALPHABET_.charAt(latInt % ENCODING_BASE_);
  code[SEPARATOR_POSITION_ + 2] = CODE_ALPHABET_.charAt(lngInt % ENCODING_BASE_);
  latInt = Math.floor(latInt / ENCODING_BASE_);
  lngInt = Math.floor(lngInt / ENCODING_BASE_);
  for (let i = PAIR_CODE_LENGTH_ / 2 + 1; i >= 0; i -= 2) {
    code[i] = CODE_ALPHABET_.charAt(latInt % ENCODING_BASE_);
    code[i + 1] = CODE_ALPHABET_.charAt(lngInt % ENCODING_BASE_);
    latInt = Math.floor(latInt / ENCODING_BASE_);
    lngInt = Math.floor(lngInt / ENCODING_BASE_);
  }
  if (codeLength >= SEPARATOR_POSITION_) return code.slice(0, codeLength + 1).join("");
  return code.slice(0, codeLength).join("") + Array(SEPARATOR_POSITION_ - codeLength + 1).join(PADDING_CHARACTER_) + SEPARATOR_;
}

function encode(latitude, longitude, codeLength) {
  const [latInt, lngInt] = locationToIntegers(Number(latitude), Number(longitude));
  return encodeIntegers(latInt, lngInt, codeLength);
}

function CodeArea(latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength) {
  return {
    latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength,
    latitudeCenter: Math.min(latitudeLo + (latitudeHi - latitudeLo) / 2, LATITUDE_MAX_),
    longitudeCenter: Math.min(longitudeLo + (longitudeHi - longitudeLo) / 2, LONGITUDE_MAX_),
  };
}

function decode(code) {
  if (!isFull(code)) throw new Error("Passed Plus Code is not a valid full code: " + code);
  code = code.replace("+", "").replace(/0/g, "").toLocaleUpperCase("en-US");
  let normalLat = -LATITUDE_MAX_ * PAIR_PRECISION_;
  let normalLng = -LONGITUDE_MAX_ * PAIR_PRECISION_;
  let gridLat = 0, gridLng = 0;
  let digits = Math.min(code.length, PAIR_CODE_LENGTH_);
  let pv = PAIR_FIRST_PLACE_VALUE_;
  for (let i = 0; i < digits; i += 2) {
    normalLat += CODE_ALPHABET_.indexOf(code.charAt(i)) * pv;
    normalLng += CODE_ALPHABET_.indexOf(code.charAt(i + 1)) * pv;
    if (i < digits - 2) pv /= ENCODING_BASE_;
  }
  let latPrecision = pv / PAIR_PRECISION_;
  let lngPrecision = pv / PAIR_PRECISION_;
  if (code.length > PAIR_CODE_LENGTH_) {
    let rowpv = GRID_LAT_FIRST_PLACE_VALUE_;
    let colpv = GRID_LNG_FIRST_PLACE_VALUE_;
    digits = Math.min(code.length, MAX_DIGIT_COUNT_);
    for (let i = PAIR_CODE_LENGTH_; i < digits; i++) {
      const digitVal = CODE_ALPHABET_.indexOf(code.charAt(i));
      const row = Math.floor(digitVal / GRID_COLUMNS_);
      const col = digitVal % GRID_COLUMNS_;
      gridLat += row * rowpv;
      gridLng += col * colpv;
      if (i < digits - 1) { rowpv /= GRID_ROWS_; colpv /= GRID_COLUMNS_; }
    }
    latPrecision = rowpv / FINAL_LAT_PRECISION_;
    lngPrecision = colpv / FINAL_LNG_PRECISION_;
  }
  const lat = normalLat / PAIR_PRECISION_ + gridLat / FINAL_LAT_PRECISION_;
  const lng = normalLng / PAIR_PRECISION_ + gridLng / FINAL_LNG_PRECISION_;
  return CodeArea(lat, lng, lat + latPrecision, lng + lngPrecision, Math.min(code.length, MAX_DIGIT_COUNT_));
}

function recoverNearest(shortCode, referenceLatitude, referenceLongitude) {
  if (!isShort(shortCode)) {
    if (isFull(shortCode)) return shortCode.toUpperCase();
    throw new Error("Passed short code is not valid: " + shortCode);
  }
  referenceLatitude = clipLatitude(Number(referenceLatitude));
  referenceLongitude = normalizeLongitude(Number(referenceLongitude));
  shortCode = shortCode.toUpperCase();
  const paddingLength = SEPARATOR_POSITION_ - shortCode.indexOf(SEPARATOR_);
  const resolution = Math.pow(20, 2 - paddingLength / 2);
  const halfResolution = resolution / 2.0;
  const codeArea = decode(encode(referenceLatitude, referenceLongitude).substr(0, paddingLength) + shortCode);
  if (referenceLatitude + halfResolution < codeArea.latitudeCenter && codeArea.latitudeCenter - resolution >= -LATITUDE_MAX_) {
    codeArea.latitudeCenter -= resolution;
  } else if (referenceLatitude - halfResolution > codeArea.latitudeCenter && codeArea.latitudeCenter + resolution <= LATITUDE_MAX_) {
    codeArea.latitudeCenter += resolution;
  }
  if (referenceLongitude + halfResolution < codeArea.longitudeCenter) codeArea.longitudeCenter -= resolution;
  else if (referenceLongitude - halfResolution > codeArea.longitudeCenter) codeArea.longitudeCenter += resolution;
  return encode(codeArea.latitudeCenter, codeArea.longitudeCenter, codeArea.codeLength);
}

export { isValid, isShort, isFull, decode, encode, recoverNearest };
