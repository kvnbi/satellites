export const MAX_SATS = 40000;

export const visArr = new Uint8Array(MAX_SATS).fill(1);

export const colArr = new Float32Array(MAX_SATS * 3);
export const DOT_RGB    = [0.76, 0.76, 0.80];
export const SELECT_RGB = [0.20, 1.0, 0.45];

export const posArr = new Float32Array(MAX_SATS * 3);
export const posA   = new Float32Array(MAX_SATS * 3);
export const posB   = new Float32Array(MAX_SATS * 3);

export const S = {
  camMode: 'earth',
  camOverrideActive: false,
  selIdx: -1,
  followHideIdx: -1,
  count: 0,
  validSats: [],
  searchName: [],
  searchId: [],
  satRecords: [],
};
