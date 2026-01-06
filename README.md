# pixelcrush

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmarcywdev%2Fpixelcrush)

Turn your photos into glorious, crunchy pixel art. pixelcrush is a browser-based tool that applies dithering algorithms to images, giving them that retro, low-color aesthetic we all secretly love.

**Live demo:** [pixelcrush-phi.vercel.app](https://pixelcrush-phi.vercel.app)

## What it does

Upload any image and watch it transform into pixel art using classic dithering techniques. Customize the color palette, adjust the pixel size, and export your creation as a PNG or animated GIF.

## Features

**Dithering Algorithms**
- Floyd-Steinberg: The classic error-diffusion algorithm that creates smooth gradients with that signature organic dither pattern
- Ordered (Bayer): A structured 4x4 matrix approach that produces clean, grid-like patterns

**Color Palette**
- Start with the default palette or build your own
- Drag colors to reorder them
- Click any color to edit or remove it
- Add as many colors as you want (or as few as two for that hardcore 1-bit look)

**Palette Modes**
- Nearest Match: Each pixel gets mapped to the closest color in your palette
- Luminance Mapping: Colors are assigned based on brightness - first color for darks, last for lights
- Horizontal Gradient: Palette flows left to right across the image
- Vertical Gradient: Palette flows top to bottom

**Pixel Size**
- Crank it down for chunky, blocky pixels
- Keep it high for subtle dithering on full resolution

**GIF Creator**
- Capture frames at different settings
- Reorder frames by dragging
- Adjust timing between frames
- Preview before downloading

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start crushing some pixels.

## Built with

- Next.js
- TypeScript
- Tailwind CSS
- gif.js for client-side GIF encoding

## License

MIT
