// Editable pixel-art source. All drawing happens on an integer grid with no AA.
// Run: node src/mocks/assets/parts/build-parts.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const root = dirname(fileURLToPath(import.meta.url));
const palette = [
  "00000000",
  "1b2030ff",
  "4a4a6aff",
  "8a8ab0ff",
  "c8c8e0ff",
  "ff00ffff",
];
const manifest = {};
const sprites = new Map();
function crc(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let k = 0; k < 8; k++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, checksum]);
}
export function png(w, h, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      Buffer.from(palette[pixels[y * w + x]], "hex").copy(
        raw,
        y * (1 + w * 4) + 1 + x * 4,
      );
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function canvas(w = 32, h = 32) {
  const pixels = new Uint8Array(w * h);
  const dot = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < w && y >= 0 && y < h) pixels[y * w + x] = c;
  };
  const rect = (x, y, r, b, c) => {
    for (let j = y; j < b; j++) for (let i = x; i < r; i++) dot(i, j, c);
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) dot(x, y, c);
  };
  const line = (points, c, width = 1) => {
    for (let k = 1; k < points.length; k++) {
      const [ax, ay] = points[k - 1],
        [bx, by] = points[k],
        steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let i = 0; i <= steps; i++) {
        const x = ax + ((bx - ax) * i) / (steps || 1),
          y = ay + ((by - ay) * i) / (steps || 1);
        if (width === 1) dot(x, y, c);
        else ellipse(Math.round(x), Math.round(y), width / 2, width / 2, c);
      }
    }
  };
  const poly = (points, c) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i],
            [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        if (inside) dot(x, y, c);
      }
  };
  const shape = (points, c = 3) => {
    poly(points, c);
    line([...points, points[0]], 1);
  };
  return { w, h, pixels, dot, rect, ellipse, line, poly, shape };
}
function save(key, c, origin) {
  if (key.startsWith("tail/") || key.startsWith("crest/")) {
    const factor = key.startsWith("tail/") ? 0.5 : 0.7;
    const small = canvas(Math.round(c.w * factor), Math.round(c.h * factor));
    for (let y = 0; y < small.h; y++)
      for (let x = 0; x < small.w; x++)
        small.dot(
          x,
          y,
          c.pixels[
            Math.min(c.h - 1, Math.floor((y + 0.5) / factor)) * c.w +
              Math.min(c.w - 1, Math.floor((x + 0.5) / factor))
          ],
        );
    c = small;
    origin = {
      x: Math.round(origin.x * factor),
      y: Math.round(origin.y * factor),
    };
  }
  const path = join(root, key + ".png");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png(c.w, c.h, c.pixels));
  manifest[key] = { width: c.w, height: c.h, origin };
  sprites.set(key, c);
}

// Body silhouettes: mouth is included; eyes and all head furniture are separate.
const bodies = {
  round: {
    origin: { x: 32, y: 38 },
    points: [
      [13, 46],
      [14, 34],
      [20, 24],
      [29, 20],
      [38, 22],
      [46, 31],
      [49, 44],
      [44, 51],
      [20, 51],
    ],
    belly: [30, 40, 12, 9],
    mouth: [29, 41],
  },
  slim: {
    origin: { x: 32, y: 36 },
    points: [
      [20, 24],
      [21, 16],
      [28, 12],
      [36, 16],
      [39, 24],
      [34, 31],
      [39, 44],
      [42, 54],
      [33, 54],
      [30, 44],
      [27, 54],
      [20, 54],
      [24, 39],
      [24, 31],
    ],
    belly: [30, 38, 5, 10],
    mouth: [28, 29],
  },
  muscular: {
    origin: { x: 32, y: 38 },
    points: [
      [16, 28],
      [18, 18],
      [25, 13],
      [36, 14],
      [41, 24],
      [37, 31],
      [46, 34],
      [50, 47],
      [46, 53],
      [38, 53],
      [36, 46],
      [27, 46],
      [25, 54],
      [15, 54],
      [12, 49],
      [17, 36],
      [24, 31],
    ],
    belly: [30, 39, 7, 10],
    mouth: [27, 31],
  },
  serpentine: {
    origin: { x: 32, y: 40 },
    points: [
      [15, 23],
      [16, 15],
      [24, 10],
      [32, 13],
      [35, 22],
      [30, 30],
      [27, 38],
      [32, 44],
      [44, 44],
      [49, 40],
      [53, 44],
      [51, 51],
      [42, 56],
      [27, 55],
      [19, 51],
      [17, 44],
      [22, 33],
      [24, 28],
    ],
    belly: [28, 47, 8, 6],
    mouth: [23, 26],
  },
  winged: {
    origin: { x: 32, y: 36 },
    points: [
      [20, 25],
      [21, 16],
      [28, 12],
      [37, 16],
      [41, 26],
      [38, 32],
      [42, 43],
      [39, 49],
      [34, 48],
      [33, 54],
      [28, 54],
      [25, 48],
      [20, 49],
      [17, 42],
      [24, 31],
    ],
    belly: [30, 39, 8, 9],
    mouth: [28, 30],
  },
  finned: {
    origin: { x: 32, y: 38 },
    points: [
      [13, 37],
      [16, 29],
      [26, 24],
      [36, 25],
      [44, 31],
      [51, 36],
      [49, 42],
      [40, 49],
      [28, 51],
      [19, 47],
    ],
    belly: [29, 42, 12, 7],
    mouth: [22, 38],
  },
};
for (const [name, b] of Object.entries(bodies)) {
  const c = canvas(64, 64);
  c.shape(b.points);
  const [x, y, rx, ry] = b.belly;
  c.ellipse(x, y, rx, ry, 2);
  c.ellipse(x - 2, y - 2, rx - 2, ry - 2, 4);
  c.line(
    [
      [b.mouth[0] - 2, b.mouth[1]],
      [b.mouth[0], b.mouth[1] + 1],
      [b.mouth[0] + 3, b.mouth[1]],
    ],
    1,
  );
  if (name === "round") {
    c.ellipse(20, 50, 5, 3, 1);
    c.ellipse(20, 49, 4, 2, 3);
    c.ellipse(41, 50, 5, 3, 1);
    c.ellipse(41, 49, 4, 2, 3);
    for (const [x, y] of [
      [19, 32],
      [38, 27],
      [43, 40],
    ]) {
      c.rect(x, y, x + 3, y + 2, 2);
      c.dot(x, y, 4);
    }
  } else {
    c.line(
      [
        [22, 19],
        [27, 16],
        [32, 17],
      ],
      4,
    );
    c.line(
      [
        [36, 39],
        [39, 43],
        [37, 47],
      ],
      2,
    );
  }
  save("body/" + name, c, b.origin);
}

for (const kind of ["normal", "sharp", "round", "multi", "glowing", "slit"]) {
  const c = canvas(20, 10);
  for (const x of [5, 14]) {
    if (kind === "slit") {
      c.line(
        [
          [x - 3, 5],
          [x, 3],
          [x + 2, 5],
        ],
        1,
      );
      continue;
    }
    c.ellipse(x, 5, kind === "round" ? 4 : 3, kind === "sharp" ? 2 : 4, 1);
    c.ellipse(x, 4, 2, kind === "sharp" ? 1 : 3, kind === "glowing" ? 5 : 4);
    c.rect(x - 1, 3, x + 1, 7, 1);
    c.dot(x - 1, 3, 4);
    if (kind === "sharp")
      c.line(
        [
          [x - 3, 1],
          [x + 3, 3],
        ],
        1,
      );
  }
  if (kind === "multi") {
    c.ellipse(10, 1, 2, 1, 1);
    c.dot(10, 1, 5);
  }
  save("eyes/" + kind, c, { x: 10, y: 5 });
}

for (const kind of ["single", "twin", "crown", "spiral"]) {
  const c = canvas(kind === "spiral" ? 44 : 32, 32);
  if (kind === "spiral") {
    for (const x of [7, 36]) {
      c.ellipse(x, 15, 7, 9, 1);
      c.ellipse(x, 14, 6, 8, 4);
      c.ellipse(x, 15, 4, 5, 2);
      c.ellipse(x, 15, 2, 3, 0);
      c.line(
        [
          [x + 1, 21],
          [x - 2, 20],
          [x - 3, 17],
        ],
        3,
        3,
      );
      c.line(
        [
          [x - 3, 9],
          [x - 4, 12],
        ],
        3,
        2,
      );
    }
    c.line(
      [
        [12, 12],
        [17, 11],
      ],
      2,
      3,
    );
    c.line(
      [
        [27, 11],
        [31, 12],
      ],
      2,
      3,
    );
  } else {
    const xs =
      kind === "single" ? [16] : kind === "twin" ? [8, 24] : [5, 16, 27];
    for (const x of xs) {
      c.shape(
        [
          [x - 3, 24],
          [x - 4, 17],
          [x + 2, 4],
          [x + 3, 15],
          [x + 4, 24],
        ],
        4,
      );
      c.line(
        [
          [x + 2, 13],
          [x, 22],
        ],
        2,
        2,
      );
    }
  }
  save("horns/" + kind, c, {
    x: kind === "spiral" ? 22 : 16,
    y: kind === "spiral" ? 12 : 24,
  });
}

for (const kind of ["flower", "fin", "crystal", "mane", "antenna", "crown"]) {
  const c = canvas();
  if (kind === "flower") {
    c.line(
      [
        [16, 28],
        [16, 16],
      ],
      2,
      3,
    );
    for (const [x, y, rx, ry] of [
      [16, 7, 5, 6],
      [7, 13, 6, 5],
      [10, 22, 5, 6],
      [23, 21, 6, 5],
      [25, 11, 6, 5],
    ]) {
      c.ellipse(x, y, rx, ry, 1);
      c.ellipse(x, y, rx - 1, ry - 1, 3);
      c.line(
        [
          [x - 2, y - 2],
          [x, y - 3],
        ],
        4,
        2,
      );
    }
    c.ellipse(16, 15, 5, 5, 1);
    c.ellipse(16, 15, 4, 4, 4);
  } else if (kind === "fin") {
    c.shape(
      [
        [3, 28],
        [9, 18],
        [13, 4],
        [17, 18],
        [23, 11],
        [28, 28],
      ],
      3,
    );
    c.line(
      [
        [13, 8],
        [13, 25],
        [24, 25],
      ],
      4,
    );
    c.line(
      [
        [17, 19],
        [20, 27],
      ],
      2,
    );
  } else if (kind === "crystal") {
    c.shape(
      [
        [8, 26],
        [5, 17],
        [11, 8],
        [16, 17],
        [20, 3],
        [26, 15],
        [23, 27],
      ],
      2,
    );
    c.shape(
      [
        [13, 26],
        [11, 14],
        [18, 5],
        [21, 18],
        [18, 27],
      ],
      5,
    );
    c.line(
      [
        [18, 8],
        [16, 19],
      ],
      4,
    );
  } else if (kind === "mane") {
    c.shape(
      [
        [2, 26],
        [6, 17],
        [4, 13],
        [11, 14],
        [14, 4],
        [18, 13],
        [26, 7],
        [24, 18],
        [30, 22],
        [24, 28],
      ],
      3,
    );
    c.line(
      [
        [9, 25],
        [14, 17],
        [16, 26],
        [23, 20],
      ],
      4,
    );
  } else if (kind === "antenna") {
    c.line(
      [
        [15, 28],
        [12, 15],
        [6, 9],
      ],
      1,
      3,
    );
    c.line(
      [
        [17, 28],
        [22, 14],
        [27, 7],
      ],
      1,
      3,
    );
    for (const [x, y] of [
      [6, 8],
      [27, 6],
    ]) {
      c.ellipse(x, y, 3, 3, 1);
      c.ellipse(x, y, 2, 2, 5);
      c.dot(x - 1, y - 1, 4);
    }
  } else {
    c.shape(
      [
        [5, 27],
        [2, 13],
        [10, 19],
        [16, 8],
        [22, 19],
        [30, 13],
        [27, 27],
      ],
      4,
    );
    c.rect(6, 24, 27, 27, 2);
    c.ellipse(16, 21, 2, 2, 5);
  }
  save("crest/" + kind, c, { x: 16, y: 28 });
}

for (const kind of ["short", "long", "spiked", "twin", "vine"]) {
  const c = canvas();
  const curve = [
    [2, 25],
    [11, 25],
    [22, 20],
    [26, 12],
    [23, 6],
    [18, 7],
    [17, 12],
  ];
  const paths =
    kind === "short"
      ? [
          [
            [2, 25],
            [10, 24],
            [15, 19],
          ],
        ]
      : kind === "twin"
        ? [
            curve,
            [
              [2, 25],
              [14, 26],
              [25, 29],
              [29, 24],
            ],
          ]
        : [curve];
  for (const path of paths) {
    c.line(path, 1, kind === "vine" ? 5 : 7);
    c.line(path, 2, kind === "vine" ? 3 : 5);
    c.line(
      path.map(([x, y]) => [x, y - 1]),
      3,
      2,
    );
  }
  if (kind === "vine") {
    c.shape(
      [
        [12, 23],
        [7, 15],
        [4, 16],
        [5, 21],
      ],
      3,
    );
    c.shape(
      [
        [25, 16],
        [30, 10],
        [30, 18],
        [26, 21],
      ],
      3,
    );
    c.line(
      [
        [6, 17],
        [10, 21],
      ],
      4,
    );
  }
  if (kind === "spiked")
    for (const [x, y] of [
      [10, 23],
      [19, 18],
      [24, 10],
    ])
      c.shape(
        [
          [x - 2, y],
          [x, y - 7],
          [x + 4, y],
        ],
        4,
      );
  save("tail/" + kind, c, { x: 2, y: 25 });
}

for (const kind of ["feathered", "membrane", "crystal", "ethereal"]) {
  const c = canvas();
  if (kind === "membrane") {
    c.shape(
      [
        [4, 27],
        [8, 10],
        [21, 3],
        [28, 5],
        [27, 17],
        [21, 15],
        [19, 23],
        [13, 20],
      ],
      2,
    );
    c.line(
      [
        [4, 27],
        [12, 13],
        [25, 5],
      ],
      3,
      3,
    );
    c.line(
      [
        [12, 13],
        [19, 23],
      ],
      4,
    );
    c.line(
      [
        [12, 13],
        [27, 17],
      ],
      4,
    );
  } else if (kind === "feathered") {
    for (let i = 0; i < 5; i++) {
      c.shape(
        [
          [4, 27],
          [9 + i * 3, 9 + i],
          [19 + i * 2, 3 + i * 4],
          [17 + i * 2, 14 + i * 3],
          [8, 28],
        ],
        i % 2 ? 3 : 4,
      );
    }
    c.line(
      [
        [4, 27],
        [11, 17],
        [25, 10],
      ],
      2,
      2,
    );
  } else if (kind === "crystal") {
    for (let i = 0; i < 3; i++)
      c.shape(
        [
          [4, 27],
          [8 + i * 6, 5 + i * 3],
          [13 + i * 7, 2 + i * 6],
          [18 + i * 4, 14 + i * 4],
        ],
        i === 1 ? 5 : 4,
      );
  } else {
    for (let i = 0; i < 3; i++) {
      c.ellipse(17 + i * 3, 12 + i * 5, 10 - i * 2, 5, 1);
      c.ellipse(17 + i * 3, 12 + i * 5, 9 - i * 2, 4, 5);
      c.line(
        [
          [10 + i * 3, 12 + i * 5],
          [22 + i, 11 + i * 5],
        ],
        4,
      );
    }
    c.line(
      [
        [4, 27],
        [14, 20],
      ],
      3,
      3,
    );
  }
  save("wings/" + kind, c, { x: 4, y: 27 });
}

for (const kind of ["fangs", "tusks", "beak", "maw"]) {
  const c = canvas(28, 24);
  if (kind === "maw") {
    c.ellipse(14, 12, 13, 10, 1);
    c.ellipse(14, 14, 12, 8, 4);
    c.ellipse(14, 10, 10, 6, 1);
    for (const x of [6, 13, 21]) {
      c.poly(
        [
          [x - 2, 5],
          [x + 2, 5],
          [x, 11],
        ],
        4,
      );
      c.poly(
        [
          [x - 2, 17],
          [x, 12],
          [x + 2, 17],
        ],
        4,
      );
    }
    c.line(
      [
        [6, 19],
        [15, 21],
        [23, 17],
      ],
      3,
      2,
    );
  } else if (kind === "beak") {
    c.shape(
      [
        [4, 9],
        [14, 4],
        [25, 10],
        [15, 14],
        [11, 19],
      ],
      4,
    );
    c.line(
      [
        [4, 10],
        [23, 10],
      ],
      1,
    );
  } else {
    c.line(
      [
        [4, 10],
        [14, 13],
        [24, 9],
      ],
      1,
      2,
    );
    for (const x of [7, 21]) {
      if (kind === "fangs")
        c.shape(
          [
            [x - 2, 10],
            [x + 2, 10],
            [x, 17],
          ],
          4,
        );
      else
        c.shape(
          [
            [x - 2, 12],
            [x - 3, 3],
            [x, 7],
            [x + 3, 14],
          ],
          4,
        );
    }
  }
  save("jaw/" + kind, c, { x: 14, y: 10 });
}

writeFileSync(
  join(root, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
writeFileSync(
  join(root, "manifest.ts"),
  "// Generated by build-parts.mjs\nexport const partUrls: Record<string,string> = {\n" +
    Object.keys(manifest)
      .map((k) => `  '${k}': new URL('./${k}.png', import.meta.url).href,`)
      .join("\n") +
    "\n};\n",
);
const sheet = canvas(7 * 64, 5 * 64);
let i = 0;
for (const c of sprites.values()) {
  const dx = (i % 7) * 64 + Math.floor((64 - c.w) / 2),
    dy = Math.floor(i / 7) * 64 + Math.floor((64 - c.h) / 2);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++)
      sheet.dot(dx + x, dy + y, c.pixels[y * c.w + x]);
  i++;
}
writeFileSync(
  join(root, "parts-sheet.png"),
  png(sheet.w, sheet.h, sheet.pixels),
);
console.log(
  `Generated ${sprites.size} parts, manifest, contact sheet (reference palette only).`,
);
