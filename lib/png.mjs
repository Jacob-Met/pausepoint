// Tiny PNG painter: generates the test photos (a bookshelf at any build stage)
// on the fly from rectangles. No assets, no dependencies beyond node:zlib.
import { deflateSync, crc32 } from "node:zlib";

const W = 640, H = 420;

function chunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}

export function samplePhoto(done) {
  const d = new Set(done);
  const px = Buffer.alloc(W * H * 3);
  const rect = (x, y, w, h, [r, g, b]) => {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) { const o = (j * W + i) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b; }
  };
  const WOOD = [74, 46, 28], SHELF = [96, 62, 38], BACK = [214, 196, 160];
  rect(0, 0, W, 300, [200, 205, 210]);                       // wall
  rect(0, 300, W, 120, [150, 116, 82]);                       // floor
  for (let x = 0; x < W; x += 64) rect(x, 300, 2, 120, [128, 98, 68]);
  rect(0, 296, W, 6, [236, 236, 236]);                        // skirting
  // frame
  if (d.has("s2")) {
    if (d.has("s6")) rect(224, 84, 192, 252, BACK);
    rect(200, 60, 24, 276, WOOD); rect(416, 60, 24, 276, WOOD);
    rect(205, 70, 4, 250, [58, 36, 22]); rect(421, 70, 4, 250, [58, 36, 22]);
    if (d.has("s3")) rect(224, 316, 192, 24, SHELF);
    if (d.has("s4")) { rect(224, 150, 192, 16, SHELF); rect(224, 236, 192, 16, SHELF); }
    if (d.has("s5")) rect(196, 44, 248, 22, SHELF);
    if (d.has("s7")) rect(300, 14, 40, 30, [240, 110, 20]);
    rect(190, 336, 260, 8, [110, 84, 58]);                    // contact shadow
  }
  // leftover parts on the floor: messy pile before sorting, neat rows after
  const parts = [["s2", 2], ["s3", 1], ["s4", 2], ["s5", 1], ["s6", 1], ["s7", 1]];
  const left = parts.filter(([s]) => !d.has(s)).flatMap(([s, n]) => Array(n).fill(s));
  left.forEach((s, i) => {
    const small = s === "s7", back = s === "s6", side = s === "s2";
    const w = small ? 28 : back ? 120 : 110, h = small ? 20 : back ? 8 : 14;
    const col = small ? [240, 110, 20] : back ? BACK : side ? WOOD : SHELF;
    if (d.has("s1")) rect(20, 350 + i * 0, 0, 0, col), rect(20 + (i % 3) * 140, 350 + Math.floor(i / 3) * 28, w, h, col);
    else rect(30 + ((i * 53) % 170), 340 + ((i * 37) % 60), w, h + 6, col), rect(40 + ((i * 29) % 150), 352 + ((i * 41) % 40), w - 20, h, [col[0] - 14, col[1] - 14, col[2] - 14]);
  });
  // hardware tray, always present
  rect(520, 372, 90, 34, [60, 60, 66]); rect(526, 378, 78, 22, [188, 188, 194]);
  if (d.has("s1")) for (let k = 0; k < 6; k++) rect(532 + k * 12, 384, 6, 10, [230, 200, 80]);
  else for (let k = 0; k < 6; k++) rect(530 + ((k * 17) % 60), 380 + ((k * 7) % 14), 6, 6, [230, 200, 80]);
  const rows = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { rows[y * (W * 3 + 1)] = 0; px.copy(rows, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
