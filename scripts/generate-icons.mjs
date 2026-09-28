import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#176b51"/><path d="M348 144c-102 0-189 39-189 118 0 55 43 91 92 76 72-22 97-110 97-194Z" fill="#e3efdb"/><path d="M158 365c20-62 63-110 124-154" fill="none" stroke="#176b51" stroke-width="18" stroke-linecap="round"/></svg>`;
for (const size of [192, 512])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
