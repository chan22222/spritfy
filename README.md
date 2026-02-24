<div align="center">

# Spritfy

**Free Online Pixel Art Editor & Sprite Sheet Generator**

Draw pixel art, extract sprite sheets from video, and convert image formats — all in your browser.

[![Website](https://img.shields.io/badge/Website-spritfy.xyz-8b5cf6?style=for-the-badge)](https://spritfy.xyz)

[English](https://spritfy.xyz/en/) · [한국어](https://spritfy.xyz/ko/) · [日本語](https://spritfy.xyz/ja/)

</div>

---

## Features

### Pixel Art Editor
- Multi-layer with opacity control
- Frame-based animation with onion skin
- Symmetry drawing (horizontal / vertical)
- Palette presets and custom colors
- Export as PNG, sprite sheet, or GIF

### Sprite Sheet Generator
- Extract frames from video or GIF
- Chroma key & background removal
- Auto-deduplicate similar frames
- Merge multiple images into a sheet
- Export sprite sheet or animated GIF

### Image Converter
- Convert between PNG, JPG, WebP, GIF, BMP, ICO
- Adjust quality and dimensions
- Batch processing support
- All processing happens locally in the browser

### Community Gallery
- Share your pixel art with the community
- Like, comment, and discover artworks
- Filter by category (character, effect, UI, item, etc.)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v7 |
| Auth & DB | Supabase (Auth, PostgreSQL) |
| Storage | Cloudflare R2 |
| Hosting | Railway + Caddy |
| i18n | Custom (ko / en / ja) |

## Getting Started

**Prerequisites:** Node.js 20+

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

## License

All rights reserved.
