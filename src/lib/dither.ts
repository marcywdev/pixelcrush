// Color type representing RGB values
export interface RGB {
  r: number;
  g: number;
  b: number;
}

// Palette mode types
export type PaletteMode = "nearest" | "luminance" | "gradient-horizontal" | "gradient-vertical";

// Parse hex color to RGB
export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

// Calculate Euclidean distance between two colors
function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Calculate luminance of a color (0-255)
function getLuminance(color: RGB): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

// Interpolate between two colors
function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

// Get color from palette gradient based on position (0-1)
function getGradientColor(palette: RGB[], position: number): RGB {
  if (palette.length === 1) return palette[0];

  const scaledPos = position * (palette.length - 1);
  const index = Math.floor(scaledPos);
  const t = scaledPos - index;

  if (index >= palette.length - 1) return palette[palette.length - 1];

  return lerpColor(palette[index], palette[index + 1], t);
}

// Find the nearest color in the palette
function findNearestColor(color: RGB, palette: RGB[]): RGB {
  let minDistance = Infinity;
  let nearest = palette[0];

  for (const paletteColor of palette) {
    const distance = colorDistance(color, paletteColor);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = paletteColor;
    }
  }

  return nearest;
}

// Find color by luminance mapping (palette order matters)
function findColorByLuminance(color: RGB, palette: RGB[]): RGB {
  const luminance = getLuminance(color) / 255; // Normalize to 0-1
  const index = Math.min(
    palette.length - 1,
    Math.floor(luminance * palette.length)
  );
  return palette[index];
}

// 4x4 Bayer matrix for ordered dithering
const BAYER_MATRIX_4x4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Normalize Bayer matrix values to range [-0.5, 0.5]
function getBayerThreshold(x: number, y: number): number {
  const matrixSize = 4;
  const matrixValue = BAYER_MATRIX_4x4[y % matrixSize][x % matrixSize];
  return (matrixValue / 16) - 0.5;
}

// Floyd-Steinberg dithering algorithm
export function floydSteinbergDither(
  imageData: ImageData,
  palette: RGB[],
  paletteMode: PaletteMode
): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy of pixel data as floats for error accumulation
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldColor: RGB = {
        r: Math.max(0, Math.min(255, Math.round(pixels[idx][0]))),
        g: Math.max(0, Math.min(255, Math.round(pixels[idx][1]))),
        b: Math.max(0, Math.min(255, Math.round(pixels[idx][2]))),
      };

      let newColor: RGB;

      switch (paletteMode) {
        case "luminance":
          newColor = findColorByLuminance(oldColor, palette);
          break;
        case "gradient-horizontal":
          newColor = findNearestColor(
            oldColor,
            [getGradientColor(palette, x / width)]
          );
          newColor = getGradientColor(palette, x / width);
          // Blend with nearest match for better results
          const nearestH = findNearestColor(oldColor, palette);
          newColor = lerpColor(newColor, nearestH, 0.5);
          newColor = findNearestColor(newColor, palette);
          break;
        case "gradient-vertical":
          newColor = getGradientColor(palette, y / height);
          const nearestV = findNearestColor(oldColor, palette);
          newColor = lerpColor(newColor, nearestV, 0.5);
          newColor = findNearestColor(newColor, palette);
          break;
        default:
          newColor = findNearestColor(oldColor, palette);
      }

      // Calculate quantization error
      const errorR = oldColor.r - newColor.r;
      const errorG = oldColor.g - newColor.g;
      const errorB = oldColor.b - newColor.b;

      // Set the pixel to the new color
      const dataIdx = idx * 4;
      data[dataIdx] = newColor.r;
      data[dataIdx + 1] = newColor.g;
      data[dataIdx + 2] = newColor.b;

      // Distribute error to neighboring pixels (Floyd-Steinberg pattern)
      // Right pixel: 7/16
      if (x + 1 < width) {
        const rightIdx = idx + 1;
        pixels[rightIdx][0] += errorR * (7 / 16);
        pixels[rightIdx][1] += errorG * (7 / 16);
        pixels[rightIdx][2] += errorB * (7 / 16);
      }

      // Bottom-left pixel: 3/16
      if (y + 1 < height && x - 1 >= 0) {
        const bottomLeftIdx = (y + 1) * width + (x - 1);
        pixels[bottomLeftIdx][0] += errorR * (3 / 16);
        pixels[bottomLeftIdx][1] += errorG * (3 / 16);
        pixels[bottomLeftIdx][2] += errorB * (3 / 16);
      }

      // Bottom pixel: 5/16
      if (y + 1 < height) {
        const bottomIdx = (y + 1) * width + x;
        pixels[bottomIdx][0] += errorR * (5 / 16);
        pixels[bottomIdx][1] += errorG * (5 / 16);
        pixels[bottomIdx][2] += errorB * (5 / 16);
      }

      // Bottom-right pixel: 1/16
      if (y + 1 < height && x + 1 < width) {
        const bottomRightIdx = (y + 1) * width + (x + 1);
        pixels[bottomRightIdx][0] += errorR * (1 / 16);
        pixels[bottomRightIdx][1] += errorG * (1 / 16);
        pixels[bottomRightIdx][2] += errorB * (1 / 16);
      }
    }
  }
}

// Ordered dithering using Bayer matrix
export function orderedDither(
  imageData: ImageData,
  palette: RGB[],
  paletteMode: PaletteMode
): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  const spreadFactor = 64;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const threshold = getBayerThreshold(x, y);

      // Apply threshold to each color channel
      const color: RGB = {
        r: Math.max(0, Math.min(255, data[idx] + threshold * spreadFactor)),
        g: Math.max(0, Math.min(255, data[idx + 1] + threshold * spreadFactor)),
        b: Math.max(0, Math.min(255, data[idx + 2] + threshold * spreadFactor)),
      };

      let newColor: RGB;

      switch (paletteMode) {
        case "luminance":
          newColor = findColorByLuminance(color, palette);
          break;
        case "gradient-horizontal":
          newColor = getGradientColor(palette, x / width);
          const nearestH = findNearestColor(color, palette);
          newColor = lerpColor(newColor, nearestH, 0.5);
          newColor = findNearestColor(newColor, palette);
          break;
        case "gradient-vertical":
          newColor = getGradientColor(palette, y / height);
          const nearestV = findNearestColor(color, palette);
          newColor = lerpColor(newColor, nearestV, 0.5);
          newColor = findNearestColor(newColor, palette);
          break;
        default:
          newColor = findNearestColor(color, palette);
      }

      data[idx] = newColor.r;
      data[idx + 1] = newColor.g;
      data[idx + 2] = newColor.b;
    }
  }
}

// Main processing function
export function processImage(
  sourceCanvas: HTMLCanvasElement,
  palette: string[],
  pixelSize: number,
  algorithm: "floyd-steinberg" | "ordered",
  paletteMode: PaletteMode = "nearest"
): HTMLCanvasElement {
  const rgbPalette = palette.map(hexToRgb);

  // Calculate scaled dimensions
  const scale = pixelSize / 100;
  const scaledWidth = Math.max(1, Math.round(sourceCanvas.width * scale));
  const scaledHeight = Math.max(1, Math.round(sourceCanvas.height * scale));

  // Create a canvas for the downscaled image
  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = scaledWidth;
  smallCanvas.height = scaledHeight;
  const smallCtx = smallCanvas.getContext("2d", { willReadFrequently: true });

  if (!smallCtx) {
    throw new Error("Could not get 2D context");
  }

  // Disable image smoothing for sharp pixels when downscaling
  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(sourceCanvas, 0, 0, scaledWidth, scaledHeight);

  // Get image data for processing
  const imageData = smallCtx.getImageData(0, 0, scaledWidth, scaledHeight);

  // Apply dithering algorithm
  if (algorithm === "floyd-steinberg") {
    floydSteinbergDither(imageData, rgbPalette, paletteMode);
  } else {
    orderedDither(imageData, rgbPalette, paletteMode);
  }

  // Put the processed image data back
  smallCtx.putImageData(imageData, 0, 0);

  // Create output canvas at original size with nearest-neighbor scaling
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const outputCtx = outputCanvas.getContext("2d");

  if (!outputCtx) {
    throw new Error("Could not get 2D context");
  }

  // Use nearest-neighbor interpolation for sharp pixel scaling
  outputCtx.imageSmoothingEnabled = false;
  outputCtx.drawImage(
    smallCanvas,
    0,
    0,
    scaledWidth,
    scaledHeight,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height
  );

  return outputCanvas;
}
