"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { processImage, type PaletteMode } from "@/lib/dither";
import clsx from "clsx";
import GIF from "gif.js-upgrade";

// Default color palette
const DEFAULT_PALETTE = ["#1a0f5a", "#e939f1", "#349cfc", "#ff9a57", "#ffffff"];

// Allowlist of sample images
const VALID_SAMPLES: Record<string, string> = {
  'rocky-rope.png': '/samples/rocky-rope.png',
  'pj.jpg': '/samples/pj.jpg',
  'on-air.jpg': '/samples/on-air.jpg',
  'rocky3.jpg': '/samples/rocky3.jpg',
  'rocky1.jpg': '/samples/rocky1.jpg',
  'rocky2.jpg': '/samples/rocky2.jpg',
  'portland.jpg': '/samples/portland.jpg',
};

// Preset color palettes
const PRESET_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'marcywdev', colors: ['#1a0f5a', '#e939f1', '#349cfc', '#ff9a57', '#ffffff'] },
  { name: 'Gameboy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { name: 'CGA', colors: ['#000000', '#00aaaa', '#aa00aa', '#ffffff'] },
  { name: 'Sunset', colors: ['#1a0533', '#6b1839', '#c44536', '#f8a846', '#fff8dc'] },
  { name: 'Monochrome', colors: ['#000000', '#ffffff'] },
  { name: 'Vaporwave', colors: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'] },
  { name: 'Sepia', colors: ['#2b1d0e', '#6b4423', '#c49a6c', '#e6d5b8', '#f5efe6'] },
  { name: 'Neon', colors: ['#0d0d0d', '#ff00ff', '#00ffff', '#ffff00', '#ffffff'] },
];

// Frame type for GIF timeline
interface Frame {
  id: string;
  dataUrl: string;
  canvas: HTMLCanvasElement;
}

// User preset type for saving settings
interface UserPreset {
  id: string;
  name: string;
  createdAt: number;
  settings: {
    palette: string[];
    pixelSize: number;
    algorithm: "floyd-steinberg" | "ordered";
    paletteMode: PaletteMode;
    useImagePalette: boolean;
    paletteColorCount: number;
    frameDelay: number;
  };
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function DitherTool() {
  // Image state
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Settings state
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [newColor, setNewColor] = useState("#000000");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pixelSize, setPixelSize] = useState(40);
  const [algorithm, setAlgorithm] = useState<"floyd-steinberg" | "ordered">(
    "floyd-steinberg"
  );
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("nearest");
  const [useImagePalette, setUseImagePalette] = useState(false);
  const [paletteColorCount, setPaletteColorCount] = useState(5);

  // GIF timeline state
  const [frames, setFrames] = useState<Frame[]>([]);
  const [frameDelay, setFrameDelay] = useState(500);
  const [isGeneratingGif, setIsGeneratingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [timelineDragIndex, setTimelineDragIndex] = useState<number | null>(null);
  const [timelineDragOverIndex, setTimelineDragOverIndex] = useState<number | null>(null);
  const [showGifPreview, setShowGifPreview] = useState(false);
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null);

  // User preset state
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [myPresetsExpanded, setMyPresetsExpanded] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'image' | 'colors' | 'gif'>('image');

  // Canvas refs
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Debounced values for live preview
  const debouncedPixelSize = useDebounce(pixelSize, 150);

  // Extract diverse/distinct colors from an image
  const extractColorsFromImage = useCallback((img: HTMLImageElement, colorCount: number): string[] => {
    // Create a temporary canvas to sample pixels
    const canvas = document.createElement('canvas');
    const sampleSize = 150; // Sample at reduced size for performance
    const scale = Math.min(sampleSize / img.width, sampleSize / img.height, 1);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return DEFAULT_PALETTE;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels: [number, number, number][] = [];

    // Sample pixels (skip transparent ones)
    for (let i = 0; i < imageData.data.length; i += 4) {
      const a = imageData.data[i + 3];
      if (a > 128) { // Skip mostly transparent pixels
        pixels.push([
          imageData.data[i],     // R
          imageData.data[i + 1], // G
          imageData.data[i + 2], // B
        ]);
      }
    }

    if (pixels.length === 0) return DEFAULT_PALETTE;

    // Calculate color distance (perceptual - weighted RGB)
    const colorDistance = (c1: [number, number, number], c2: [number, number, number]): number => {
      // Weighted Euclidean distance (human eye is more sensitive to green)
      const rMean = (c1[0] + c2[0]) / 2;
      const dR = c1[0] - c2[0];
      const dG = c1[1] - c2[1];
      const dB = c1[2] - c2[2];
      // Redmean color difference formula for better perceptual accuracy
      return Math.sqrt(
        (2 + rMean / 256) * dR * dR +
        4 * dG * dG +
        (2 + (255 - rMean) / 256) * dB * dB
      );
    };

    // Median cut algorithm - extract more colors than needed
    const medianCut = (pixels: [number, number, number][], depth: number): [number, number, number][] => {
      if (depth === 0 || pixels.length === 0) {
        // Return the most extreme color in this bucket (furthest from center)
        const avg: [number, number, number] = [0, 0, 0];
        for (const p of pixels) {
          avg[0] += p[0];
          avg[1] += p[1];
          avg[2] += p[2];
        }
        avg[0] = Math.round(avg[0] / pixels.length);
        avg[1] = Math.round(avg[1] / pixels.length);
        avg[2] = Math.round(avg[2] / pixels.length);

        // Find the pixel furthest from the average (most extreme)
        let maxDist = 0;
        let extremeColor = avg;
        for (const p of pixels) {
          const dist = colorDistance(p, avg);
          if (dist > maxDist) {
            maxDist = dist;
            extremeColor = p;
          }
        }
        return [extremeColor];
      }

      // Find channel with greatest range
      let maxRange = 0;
      let maxChannel = 0;
      for (let c = 0; c < 3; c++) {
        const values = pixels.map(p => p[c]);
        const range = Math.max(...values) - Math.min(...values);
        if (range > maxRange) {
          maxRange = range;
          maxChannel = c;
        }
      }

      // Sort by that channel and split
      pixels.sort((a, b) => a[maxChannel] - b[maxChannel]);
      const mid = Math.floor(pixels.length / 2);

      return [
        ...medianCut(pixels.slice(0, mid), depth - 1),
        ...medianCut(pixels.slice(mid), depth - 1),
      ];
    };

    // Extract more colors than needed, then filter for diversity
    const extraDepth = Math.ceil(Math.log2(colorCount * 4)); // Get 4x more colors
    const candidateColors = medianCut(pixels, extraDepth);

    // Filter to keep only distinct colors using greedy selection
    const minDistance = 60; // Minimum perceptual distance between colors
    const selectedColors: [number, number, number][] = [];

    // Sort candidates by saturation + brightness to prioritize vivid colors
    candidateColors.sort((a, b) => {
      const getSatBright = (c: [number, number, number]) => {
        const max = Math.max(c[0], c[1], c[2]);
        const min = Math.min(c[0], c[1], c[2]);
        const sat = max === 0 ? 0 : (max - min) / max;
        const bright = max / 255;
        return sat * 0.7 + bright * 0.3; // Favor saturated colors
      };
      return getSatBright(b) - getSatBright(a);
    });

    // Greedy selection - pick colors that are different from already selected
    for (const color of candidateColors) {
      if (selectedColors.length >= colorCount) break;

      const isTooSimilar = selectedColors.some(
        selected => colorDistance(color, selected) < minDistance
      );

      if (!isTooSimilar) {
        selectedColors.push(color);
      }
    }

    // If we didn't get enough colors, lower the threshold and try again
    if (selectedColors.length < colorCount) {
      for (const color of candidateColors) {
        if (selectedColors.length >= colorCount) break;
        if (!selectedColors.includes(color)) {
          const isTooSimilar = selectedColors.some(
            selected => colorDistance(color, selected) < minDistance / 2
          );
          if (!isTooSimilar) {
            selectedColors.push(color);
          }
        }
      }
    }

    // Convert to hex
    const hexColors = selectedColors.map(([r, g, b]) => {
      const toHex = (n: number) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    });

    // Sort by luminance (dark to light)
    hexColors.sort((a, b) => {
      const getLum = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return 0.299 * r + 0.587 * g + 0.114 * b;
      };
      return getLum(a) - getLum(b);
    });

    return hexColors;
  }, []);

  // Effect to extract palette when toggle is enabled or image changes
  useEffect(() => {
    if (useImagePalette && sourceImage) {
      const extractedColors = extractColorsFromImage(sourceImage, paletteColorCount);
      setPalette(extractedColors);
    }
  }, [useImagePalette, sourceImage, paletteColorCount, extractColorsFromImage]);

  // Load user presets from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('pixelcrush-user-presets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Validate and sanitize presets from localStorage (same as file import)
          const validPresets: UserPreset[] = parsed
            .filter((p): p is UserPreset => {
              return (
                typeof p === 'object' &&
                p !== null &&
                typeof p.id === 'string' &&
                typeof p.name === 'string' &&
                typeof p.createdAt === 'number' &&
                typeof p.settings === 'object' &&
                p.settings !== null &&
                Array.isArray(p.settings.palette)
              );
            })
            .map((p) => ({
              id: p.id,
              name: p.name.slice(0, 50).replace(/<[^>]*>/g, ''),
              createdAt: p.createdAt,
              settings: {
                palette: p.settings.palette.filter((c: unknown): c is string =>
                  typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c)
                ).slice(0, 20),
                pixelSize: typeof p.settings.pixelSize === 'number'
                  ? Math.max(10, Math.min(100, p.settings.pixelSize)) : 40,
                algorithm: (p.settings.algorithm === 'ordered' ? 'ordered' : 'floyd-steinberg') as "floyd-steinberg" | "ordered",
                paletteMode: ['nearest', 'luminance', 'gradient-horizontal', 'gradient-vertical'].includes(p.settings.paletteMode)
                  ? p.settings.paletteMode : 'nearest',
                useImagePalette: typeof p.settings.useImagePalette === 'boolean'
                  ? p.settings.useImagePalette : false,
                paletteColorCount: typeof p.settings.paletteColorCount === 'number'
                  ? Math.max(2, Math.min(16, p.settings.paletteColorCount)) : 5,
                frameDelay: typeof p.settings.frameDelay === 'number'
                  ? Math.max(100, Math.min(2000, p.settings.frameDelay)) : 500,
              },
            }))
            .filter((p) => p.settings.palette.length > 0);
          setUserPresets(validPresets);
        }
      }
    } catch (e) {
      console.warn('Failed to load presets from localStorage:', e);
    }
  }, []);

  // Save user presets to localStorage when they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('pixelcrush-user-presets', JSON.stringify(userPresets));
    } catch (e) {
      console.warn('Failed to save presets to localStorage:', e);
    }
  }, [userPresets]);

  // Load image from URL (for samples)
  const loadImageFromUrl = useCallback((url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setSourceImage(img);

      if (sourceCanvasRef.current) {
        const canvas = sourceCanvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      }
    };
    img.onerror = () => {
      console.warn('Failed to load sample image:', url);
    };
    img.src = url;
  }, []);

  // Parse URL parameters for presets (runs once on mount)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);

    // Validate and apply palette - sanitize and validate hex colors
    const paletteParam = params.get('palette');
    if (paletteParam) {
      const colors = paletteParam
        .split(',')
        .map((c) => c.replace(/[^a-f0-9]/gi, '')) // Remove non-hex chars
        .filter((c) => /^[a-f0-9]{6}$/i.test(c)) // Validate 6-char hex
        .slice(0, 20) // Limit to 20 colors max
        .map((c) => `#${c}`);
      if (colors.length > 0) {
        setPalette(colors);
      }
    }

    // Validate pixelSize - must be integer in range 10-100
    const pixelSizeParam = params.get('pixelSize');
    if (pixelSizeParam) {
      const size = parseInt(pixelSizeParam, 10);
      if (!isNaN(size) && size >= 10 && size <= 100) {
        setPixelSize(size);
      }
    }

    // Validate algorithm - allowlist only
    const algorithmParam = params.get('algorithm');
    if (algorithmParam === 'floyd-steinberg' || algorithmParam === 'ordered') {
      setAlgorithm(algorithmParam);
    }

    // Validate paletteMode - allowlist only
    const paletteModeParam = params.get('paletteMode');
    const validModes: PaletteMode[] = ['nearest', 'luminance', 'gradient-horizontal', 'gradient-vertical'];
    if (paletteModeParam && validModes.includes(paletteModeParam as PaletteMode)) {
      setPaletteMode(paletteModeParam as PaletteMode);
    }

    // Validate frameDelay - must be integer in range 100-2000
    const frameDelayParam = params.get('frameDelay');
    if (frameDelayParam) {
      const delay = parseInt(frameDelayParam, 10);
      if (!isNaN(delay) && delay >= 100 && delay <= 2000) {
        setFrameDelay(delay);
      }
    }

    // Load sample image if specified (allowlist only)
    const sampleParam = params.get('sample');
    if (sampleParam && VALID_SAMPLES[sampleParam]) {
      // Small delay to ensure other state is set first
      setTimeout(() => {
        loadImageFromUrl(VALID_SAMPLES[sampleParam]);
      }, 100);
    }
  }, [loadImageFromUrl]);

  // Load image onto source canvas
  const loadImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);

        if (sourceCanvasRef.current) {
          const canvas = sourceCanvasRef.current;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        loadImage(file);
      }
    },
    [loadImage]
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        loadImage(file);
      }
    },
    [loadImage]
  );

  // Process and update preview
  useEffect(() => {
    if (!sourceImage || !sourceCanvasRef.current || !previewCanvasRef.current) {
      return;
    }

    try {
      const resultCanvas = processImage(
        sourceCanvasRef.current,
        palette,
        debouncedPixelSize,
        algorithm,
        paletteMode
      );

      const previewCanvas = previewCanvasRef.current;
      previewCanvas.width = resultCanvas.width;
      previewCanvas.height = resultCanvas.height;
      const ctx = previewCanvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(resultCanvas, 0, 0);
      }
    } catch (error) {
      console.error("Error processing image:", error);
    }
  }, [sourceImage, palette, debouncedPixelSize, algorithm, paletteMode]);

  // Add color to palette
  const addColor = useCallback(() => {
    if (!palette.includes(newColor)) {
      setPalette([...palette, newColor]);
    }
  }, [palette, newColor]);

  // Remove color from palette
  const removeColor = useCallback(
    (index: number) => {
      if (palette.length > 1) {
        setPalette(palette.filter((_, i) => i !== index));
        setEditingIndex(null);
      }
    },
    [palette]
  );

  // Update color at index
  const updateColor = useCallback(
    (index: number, newColorValue: string) => {
      setPalette(palette.map((c, i) => (i === index ? newColorValue : c)));
    },
    [palette]
  );

  // Handle drag start
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex]
  );

  // Handle drop - reorder palette
  const handlePaletteDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== dropIndex) {
        const newPalette = [...palette];
        const [draggedColor] = newPalette.splice(dragIndex, 1);
        newPalette.splice(dropIndex, 0, draggedColor);
        setPalette(newPalette);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, palette]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // Download the result
  const downloadImage = useCallback(() => {
    if (!previewCanvasRef.current) return;

    const link = document.createElement("a");
    link.download = "dithered-image.png";
    link.href = previewCanvasRef.current.toDataURL("image/png");
    link.click();
  }, []);

  // Save current settings as a new user preset
  const saveUserPreset = useCallback((name: string) => {
    const sanitizedName = name.trim().slice(0, 50).replace(/<[^>]*>/g, '');
    if (!sanitizedName) return;

    const newPreset: UserPreset = {
      id: crypto.randomUUID(),
      name: sanitizedName,
      createdAt: Date.now(),
      settings: {
        palette,
        pixelSize,
        algorithm,
        paletteMode,
        useImagePalette,
        paletteColorCount,
        frameDelay,
      },
    };

    setUserPresets((prev) => {
      if (prev.length >= 50) {
        console.warn('Maximum presets limit reached (50)');
        return prev;
      }
      return [...prev, newPreset];
    });
    setNewPresetName("");
  }, [palette, pixelSize, algorithm, paletteMode, useImagePalette, paletteColorCount, frameDelay]);

  // Load a user preset
  const loadUserPreset = useCallback((preset: UserPreset) => {
    const { settings } = preset;

    // Validate and apply palette
    if (Array.isArray(settings.palette) && settings.palette.length > 0) {
      const validColors = settings.palette
        .filter((c): c is string => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c))
        .slice(0, 20);
      if (validColors.length > 0) {
        setPalette(validColors);
      }
    }

    // Validate and apply other settings
    if (typeof settings.pixelSize === 'number' && settings.pixelSize >= 10 && settings.pixelSize <= 100) {
      setPixelSize(settings.pixelSize);
    }
    if (settings.algorithm === 'floyd-steinberg' || settings.algorithm === 'ordered') {
      setAlgorithm(settings.algorithm);
    }
    const validModes: PaletteMode[] = ['nearest', 'luminance', 'gradient-horizontal', 'gradient-vertical'];
    if (validModes.includes(settings.paletteMode)) {
      setPaletteMode(settings.paletteMode);
    }
    if (typeof settings.useImagePalette === 'boolean') {
      setUseImagePalette(settings.useImagePalette);
    }
    if (typeof settings.paletteColorCount === 'number' && settings.paletteColorCount >= 2 && settings.paletteColorCount <= 16) {
      setPaletteColorCount(settings.paletteColorCount);
    }
    if (typeof settings.frameDelay === 'number' && settings.frameDelay >= 100 && settings.frameDelay <= 2000) {
      setFrameDelay(settings.frameDelay);
    }
  }, []);

  // Delete a user preset
  const deleteUserPreset = useCallback((id: string) => {
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Export all presets as JSON file
  const exportUserPresets = useCallback(() => {
    if (userPresets.length === 0) return;

    const data = JSON.stringify(userPresets, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixelcrush-presets.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [userPresets]);

  // Import presets from JSON file
  const importUserPresets = useCallback((file: File) => {
    // Limit file size to 1MB to prevent DoS
    if (file.size > 1024 * 1024) {
      console.warn('Preset file too large (max 1MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed)) {
          console.warn('Invalid preset file: expected array');
          return;
        }

        // Validate and filter presets - explicitly pick properties to prevent prototype pollution
        const validPresets: UserPreset[] = parsed
          .filter((p): p is UserPreset => {
            return (
              typeof p === 'object' &&
              p !== null &&
              typeof p.name === 'string' &&
              typeof p.createdAt === 'number' &&
              typeof p.settings === 'object' &&
              p.settings !== null &&
              Array.isArray(p.settings.palette)
            );
          })
          .map((p) => ({
            // Explicitly construct object to prevent prototype pollution
            id: crypto.randomUUID(),
            name: p.name.slice(0, 50).replace(/<[^>]*>/g, ''),
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
            settings: {
              palette: p.settings.palette.filter((c: unknown): c is string =>
                typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c)
              ).slice(0, 20),
              pixelSize: typeof p.settings.pixelSize === 'number'
                ? Math.max(10, Math.min(100, p.settings.pixelSize)) : 40,
              algorithm: (p.settings.algorithm === 'ordered' ? 'ordered' : 'floyd-steinberg') as "floyd-steinberg" | "ordered",
              paletteMode: ['nearest', 'luminance', 'gradient-horizontal', 'gradient-vertical'].includes(p.settings.paletteMode)
                ? p.settings.paletteMode : 'nearest',
              useImagePalette: typeof p.settings.useImagePalette === 'boolean'
                ? p.settings.useImagePalette : false,
              paletteColorCount: typeof p.settings.paletteColorCount === 'number'
                ? Math.max(2, Math.min(16, p.settings.paletteColorCount)) : 5,
              frameDelay: typeof p.settings.frameDelay === 'number'
                ? Math.max(100, Math.min(2000, p.settings.frameDelay)) : 500,
            },
          }))
          .filter((p) => p.settings.palette.length > 0);

        if (validPresets.length === 0) {
          console.warn('No valid presets found in file');
          return;
        }

        setUserPresets((prev) => {
          const merged = [...prev, ...validPresets];
          return merged.slice(0, 50); // Enforce limit
        });
      } catch (err) {
        console.warn('Failed to parse preset file:', err);
      }
    };
    reader.readAsText(file);
  }, []);

  // Capture current preview as a frame
  const captureFrame = useCallback(() => {
    if (!previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const frameCopy = document.createElement("canvas");
    frameCopy.width = canvas.width;
    frameCopy.height = canvas.height;
    const ctx = frameCopy.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
    }

    const newFrame: Frame = {
      id: `frame-${Date.now()}`,
      dataUrl: frameCopy.toDataURL("image/png"),
      canvas: frameCopy,
    };

    setFrames((prev) => [...prev, newFrame]);
  }, []);

  // Remove frame from timeline
  const removeFrame = useCallback((id: string) => {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Clear all frames
  const clearFrames = useCallback(() => {
    setFrames([]);
  }, []);

  // Timeline drag handlers
  const handleTimelineDragStart = useCallback((index: number) => {
    setTimelineDragIndex(index);
  }, []);

  const handleTimelineDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (timelineDragIndex !== null && timelineDragIndex !== index) {
        setTimelineDragOverIndex(index);
      }
    },
    [timelineDragIndex]
  );

  const handleTimelineDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (timelineDragIndex !== null && timelineDragIndex !== dropIndex) {
        setFrames((prev) => {
          const newFrames = [...prev];
          const [draggedFrame] = newFrames.splice(timelineDragIndex, 1);
          newFrames.splice(dropIndex, 0, draggedFrame);
          return newFrames;
        });
      }
      setTimelineDragIndex(null);
      setTimelineDragOverIndex(null);
    },
    [timelineDragIndex]
  );

  const handleTimelineDragEnd = useCallback(() => {
    setTimelineDragIndex(null);
    setTimelineDragOverIndex(null);
  }, []);

  // Generate GIF (for preview or download)
  const generateGif = useCallback(
    (onComplete: (blob: Blob, url: string) => void) => {
      if (frames.length < 2) return;

      setIsGeneratingGif(true);
      setGifProgress(0);

      const firstFrame = frames[0].canvas;
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: firstFrame.width,
        height: firstFrame.height,
        workerScript: "/gif.worker.js",
      });

      frames.forEach((frame) => {
        gif.addFrame(frame.canvas, { delay: frameDelay, copy: true });
      });

      gif.on("progress", (p) => {
        setGifProgress(Math.round(p * 100));
      });

      gif.on("finished", (blob) => {
        setIsGeneratingGif(false);
        setGifProgress(0);
        const url = URL.createObjectURL(blob);
        onComplete(blob, url);
      });

      gif.render();
    },
    [frames, frameDelay]
  );

  // Preview GIF
  const previewGif = useCallback(() => {
    if (gifPreviewUrl) {
      URL.revokeObjectURL(gifPreviewUrl);
    }

    generateGif((_, url) => {
      setGifPreviewUrl(url);
      setShowGifPreview(true);
    });
  }, [generateGif, gifPreviewUrl]);

  // Download GIF (direct or from preview)
  const downloadGif = useCallback(
    (existingUrl?: string) => {
      if (existingUrl) {
        const link = document.createElement("a");
        link.download = "dithered-animation.gif";
        link.href = existingUrl;
        link.click();
      } else {
        generateGif((_, url) => {
          const link = document.createElement("a");
          link.download = "dithered-animation.gif";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        });
      }
    },
    [generateGif]
  );

  // Close preview modal
  const closePreview = useCallback(() => {
    setShowGifPreview(false);
    if (gifPreviewUrl) {
      URL.revokeObjectURL(gifPreviewUrl);
      setGifPreviewUrl(null);
    }
  }, [gifPreviewUrl]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "var(--color-background)" }}>
      {/* Left Sidebar - Controls */}
      <div
        className="w-full lg:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col"
        style={{ background: "var(--color-background-offset)" }}
      >
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-5">
        <h1
          className="text-sm font-medium mb-5"
          style={{
            color: "var(--color-foreground-light)",
            fontFamily: "var(--font-alt)",
          }}
        >
          pixelcrush
        </h1>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 mb-6">
          {[
            { id: 'image' as const, label: 'Image', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )},
            { id: 'colors' as const, label: 'Colors', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            )},
            { id: 'gif' as const, label: 'GIF', icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            )},
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex-1 px-3 py-3 text-xs font-medium transition-all duration-200",
                "flex items-center justify-center gap-2",
                activeTab === tab.id
                  ? "border-b-2 border-[var(--color-brand-magenta)]"
                  : "border-b-2 border-transparent hover:border-white/20"
              )}
              style={{ color: activeTab === tab.id ? 'var(--color-foreground-light)' : 'var(--color-foreground-muted)' }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Image Tab */}
        {activeTab === 'image' && (
          <>
        {/* Image Upload */}
        <section className="mb-8">
          <h2 className="eyebrow mb-3">Image</h2>
          <div
            className={clsx(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
              isDragging
                ? "border-[var(--color-brand-magenta)] bg-[var(--color-brand-magenta)]/10"
                : "border-white/20 hover:border-white/40"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <p style={{ color: "var(--color-foreground-muted)" }}>
              {sourceImage ? "Drop to replace" : "Drop image or click to upload"}
            </p>
          </div>
        </section>

        {/* Pixel Size - in Image tab */}
        <section className="mb-8">
          <h2 className="eyebrow mb-3">Pixel Size</h2>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="10"
              max="100"
              value={pixelSize}
              onChange={(e) => setPixelSize(Number(e.target.value))}
              className="flex-1"
            />
            <span
              className="w-14 text-right text-xs font-medium"
              style={{ color: "var(--color-foreground-light)" }}
            >
              {pixelSize}%
            </span>
          </div>
          <p
            className="text-xs mt-2"
            style={{ color: "var(--color-foreground-muted)" }}
          >
            Lower = larger pixels, more dithering
          </p>
        </section>

        {/* Algorithm Toggle - in Image tab */}
        <section className="mb-8">
          <h2 className="eyebrow mb-3">Algorithm</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setAlgorithm("floyd-steinberg")}
              className={clsx(
                "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                algorithm === "floyd-steinberg"
                  ? "btn-primary"
                  : "btn-secondary"
              )}
            >
              Floyd-Steinberg
            </button>
            <button
              onClick={() => setAlgorithm("ordered")}
              className={clsx(
                "flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                algorithm === "ordered"
                  ? "btn-primary"
                  : "btn-secondary"
              )}
            >
              Ordered (Bayer)
            </button>
          </div>
        </section>
          </>
        )}

        {/* Colors Tab */}
        {activeTab === 'colors' && (
          <>
        {/* Color Palette */}
        <section className="mb-8">
          <h2 className="eyebrow mb-2">Color Palette</h2>

          {/* Extract from image toggle */}
          <div className="flex items-center justify-between mb-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface-elevated)' }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useImagePalette}
                onChange={(e) => setUseImagePalette(e.target.checked)}
                disabled={!sourceImage}
                className="w-4 h-4 accent-[var(--color-brand-magenta)] cursor-pointer"
              />
              <span className="text-xs" style={{ color: sourceImage ? 'var(--color-foreground)' : 'var(--color-foreground-muted)' }}>
                Extract from image
              </span>
            </label>
            {useImagePalette && (
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: 'var(--color-foreground-muted)' }}>Colors:</label>
                <select
                  value={paletteColorCount}
                  onChange={(e) => setPaletteColorCount(parseInt(e.target.value))}
                  className="input-field px-2 py-1 text-xs rounded"
                  style={{ width: 'auto' }}
                >
                  {[2, 3, 4, 5, 6, 8, 10, 12, 16].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Preset palettes - only show when not extracting from image */}
          {!useImagePalette && (
            <div className="mb-3">
              <label className="text-xs mb-2 block" style={{ color: 'var(--color-foreground-muted)' }}>
                Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_PALETTES.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setPalette(preset.colors)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all duration-200 hover:scale-105 hover:brightness-125"
                    style={{ backgroundColor: 'var(--color-surface-elevated)' }}
                    title={preset.name}
                  >
                    <div className="flex">
                      {preset.colors.slice(0, 4).map((color, i) => (
                        <div
                          key={i}
                          className="w-3 h-3 first:rounded-l last:rounded-r"
                          style={{ backgroundColor: color, marginLeft: i > 0 ? '-1px' : 0 }}
                        />
                      ))}
                    </div>
                    <span style={{ color: 'var(--color-foreground)' }}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* My Presets Accordion - always visible */}
          <div className="mb-3">
            {/* My Presets Accordion */}
              <div className="mt-3 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--color-surface-elevated)' }}>
                <button
                  onClick={() => setMyPresetsExpanded(!myPresetsExpanded)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" style={{ color: 'var(--color-brand-magenta)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-foreground)' }}>
                      My Presets
                    </span>
                    {userPresets.length > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: 'var(--color-brand-magenta)', color: 'white' }}
                      >
                        {userPresets.length}
                      </span>
                    )}
                  </div>
                  <svg
                    className={clsx("w-4 h-4 transition-transform duration-200", myPresetsExpanded && "rotate-180")}
                    style={{ color: 'var(--color-foreground-muted)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {myPresetsExpanded && (
                  <div className="px-3 pb-3 border-t border-white/10">
                    {/* Save Current Settings */}
                    <div className="mt-3 mb-3">
                      <label className="text-xs mb-2 block" style={{ color: 'var(--color-foreground-muted)' }}>
                        Save Current Settings
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          placeholder="Preset name"
                          maxLength={50}
                          className="input-field flex-1 px-2 py-1.5 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newPresetName.trim()) {
                              saveUserPreset(newPresetName);
                            }
                          }}
                        />
                        <button
                          onClick={() => saveUserPreset(newPresetName)}
                          disabled={!newPresetName.trim()}
                          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    {/* Saved Presets List */}
                    {userPresets.length > 0 ? (
                      <div className="space-y-2">
                        {userPresets.map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-center justify-between p-2 rounded-lg transition hover:bg-white/5"
                            style={{ backgroundColor: 'var(--color-background-offset)' }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="flex flex-shrink-0">
                                {preset.settings.palette.slice(0, 4).map((color, i) => (
                                  <div
                                    key={i}
                                    className="w-3 h-3 first:rounded-l last:rounded-r"
                                    style={{ backgroundColor: color, marginLeft: i > 0 ? '-1px' : 0 }}
                                  />
                                ))}
                              </div>
                              <span className="text-xs truncate" style={{ color: 'var(--color-foreground)' }}>
                                {preset.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => loadUserPreset(preset)}
                                className="px-2 py-1 text-xs rounded transition hover:bg-white/10"
                                style={{ backgroundColor: 'var(--color-brand-magenta)', color: 'white' }}
                              >
                                Load
                              </button>
                              <button
                                onClick={() => deleteUserPreset(preset.id)}
                                className="w-6 h-6 flex items-center justify-center rounded transition hover:bg-white/10"
                                style={{ color: 'var(--color-brand-rose)' }}
                                title="Delete preset"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4" style={{ color: 'var(--color-foreground-muted)' }}>
                        <p className="text-xs">No saved presets yet</p>
                      </div>
                    )}

                    {/* Export/Import */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
                      <button
                        onClick={exportUserPresets}
                        disabled={userPresets.length === 0}
                        className="btn-secondary flex-1 px-2 py-1.5 text-xs flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Export
                      </button>
                      <label className="btn-secondary flex-1 px-2 py-1.5 text-xs flex items-center justify-center gap-1 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Import
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              importUserPresets(file);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
          </div>

          <p
            className="text-xs mb-3"
            style={{ color: "var(--color-foreground-muted)" }}
          >
            Drag to reorder, click to edit
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {palette.map((color, index) => (
              <div
                key={`${color}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handlePaletteDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                className={clsx(
                  "w-9 h-9 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-200",
                  dragOverIndex === index && "scale-110 ring-2 ring-[var(--color-brand-magenta)]",
                  dragIndex === index && "opacity-50",
                  editingIndex === index && "ring-2 ring-[var(--color-brand-magenta)]",
                  "hover:scale-105"
                )}
                style={{
                  backgroundColor: color,
                  border: "2px solid rgba(255,255,255,0.15)",
                }}
                title={`${color} - Click to edit, drag to reorder`}
              />
            ))}
          </div>

          {/* Edit selected color */}
          {editingIndex !== null && (
            <div className="mb-4 p-4 card">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="color"
                  value={palette[editingIndex]}
                  onChange={(e) => updateColor(editingIndex, e.target.value)}
                  className="w-12 h-10 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={palette[editingIndex]}
                  onChange={(e) => updateColor(editingIndex, e.target.value)}
                  className="input-field flex-1 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => removeColor(editingIndex)}
                  disabled={palette.length <= 1}
                  className="btn-danger flex-1 px-3 py-1.5 text-xs"
                >
                  Remove
                </button>
                <button
                  onClick={() => setEditingIndex(null)}
                  className="btn-secondary flex-1 px-3 py-1.5 text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Add new color */}
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="rounded-lg cursor-pointer border-none p-0 flex-shrink-0 appearance-none outline-none"
              style={{ width: '40px', height: '40px', background: 'none' }}
            />
            <input
              type="text"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="input-field min-w-0 flex-1 px-3 py-2 text-sm"
              placeholder="#000000"
              style={{ maxWidth: '120px' }}
            />
            <button
              onClick={addColor}
              className="btn-primary px-4 py-2 text-xs flex-shrink-0"
            >
              Add
            </button>
          </div>
        </section>

        {/* Palette Mode */}
        <section className="mb-8">
          <h2 className="eyebrow mb-3">Palette Mode</h2>
          <select
            value={paletteMode}
            onChange={(e) => setPaletteMode(e.target.value as PaletteMode)}
            className="input-field w-full px-3 py-2 text-sm mb-2"
          >
            <option value="nearest">Nearest Match</option>
            <option value="luminance">Luminance Mapping</option>
            <option value="gradient-horizontal">Horizontal Gradient</option>
            <option value="gradient-vertical">Vertical Gradient</option>
          </select>
          <p
            className="text-xs"
            style={{ color: "var(--color-foreground-muted)" }}
          >
            {paletteMode === "nearest" && "Finds closest color for each pixel. Order doesn't matter."}
            {paletteMode === "luminance" && "Maps palette to brightness levels. First color = dark, last = bright."}
            {paletteMode === "gradient-horizontal" && "Applies palette as left-to-right gradient blended with image."}
            {paletteMode === "gradient-vertical" && "Applies palette as top-to-bottom gradient blended with image."}
          </p>
        </section>
          </>
        )}

        {/* GIF Tab */}
        {activeTab === 'gif' && (
          <section>
            <h2 className="eyebrow mb-3">GIF Creator</h2>
            <p
              className="text-xs mb-4"
              style={{ color: "var(--color-foreground-muted)" }}
            >
              Capture frames at different settings to create an animated GIF
            </p>

            {/* Capture Frame Button */}
            <button
              onClick={captureFrame}
              disabled={!sourceImage}
              className="w-full py-2 btn-primary mb-4 text-xs"
            >
              + Capture Frame
            </button>

            {/* Frame Delay */}
            <div className="mb-4">
              <label
                className="text-xs block mb-2"
                style={{ color: "var(--color-foreground)" }}
              >
                Frame Delay: {frameDelay}ms
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={frameDelay}
                onChange={(e) => setFrameDelay(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Frame Count */}
            <p
              className="text-xs mb-4"
              style={{ color: "var(--color-foreground)" }}
            >
              Frames: <span style={{ color: "var(--color-brand-magenta)" }}>{frames.length}</span>
            </p>

            {/* GIF Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={previewGif}
                disabled={frames.length < 2 || isGeneratingGif}
                className="btn-primary flex-1 py-2 text-xs"
              >
                {isGeneratingGif ? `${gifProgress}%` : "Preview GIF"}
              </button>
              <button
                onClick={() => downloadGif()}
                disabled={frames.length < 2 || isGeneratingGif}
                className="flex-1 py-2 text-xs rounded-lg font-medium transition-all duration-200"
                style={{
                  background: frames.length >= 2 ? "var(--color-brand-sky)" : "var(--color-foreground-muted)",
                  color: frames.length >= 2 ? "white" : "var(--color-background-offset)",
                  cursor: frames.length >= 2 ? "pointer" : "not-allowed",
                }}
              >
                Download GIF
              </button>
            </div>
            <button
              onClick={clearFrames}
              disabled={frames.length === 0}
              className="btn-secondary w-full py-2 text-xs"
            >
              Clear All Frames
            </button>

            {!sourceImage && (
              <p
                className="text-xs mt-4 text-center"
                style={{ color: "var(--color-foreground-muted)" }}
              >
                Upload an image first to capture frames
              </p>
            )}
          </section>
        )}

        </div>
        {/* Fixed Download Footer */}
        <div
          className="flex-shrink-0 p-4 border-t border-white/10"
          style={{ background: 'var(--color-background-offset)' }}
        >
          {activeTab === 'gif' ? (
            <button
              onClick={() => downloadGif()}
              disabled={frames.length < 2 || isGeneratingGif}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: frames.length >= 2 ? 'var(--color-brand-sky)' : 'var(--color-foreground-muted)',
                color: frames.length >= 2 ? 'white' : 'var(--color-background-offset)',
                cursor: frames.length >= 2 ? 'pointer' : 'not-allowed',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isGeneratingGif ? `Generating ${gifProgress}%` : 'Download GIF'}
            </button>
          ) : (
            <button
              onClick={downloadImage}
              disabled={!sourceImage}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: sourceImage ? 'var(--color-brand-sky)' : 'var(--color-foreground-muted)',
                color: sourceImage ? 'white' : 'var(--color-background-offset)',
                cursor: sourceImage ? 'pointer' : 'not-allowed',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download PNG
            </button>
          )}
        </div>
      </div>

      {/* Right Side - Preview and Timeline */}
      <div className="flex-1 flex flex-col min-h-[50vh] lg:min-h-0" style={{ background: "var(--color-background)" }}>
        {/* Preview Area */}
        <div
          className="flex-1 p-4 lg:p-8 flex items-center justify-center overflow-auto"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {/* Hidden source canvas */}
          <canvas ref={sourceCanvasRef} className="hidden" />

          {sourceImage ? (
            <div className="max-w-full max-h-full">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[50vh] lg:max-h-[calc(100vh-12rem)] object-contain rounded-lg"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          ) : (
            <div
              className="text-center cursor-pointer transition-all duration-200 hover:opacity-80"
              style={{ color: "var(--color-foreground-muted)" }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div
                className="w-20 h-20 lg:w-32 lg:h-32 mx-auto mb-4 lg:mb-6 border-2 border-dashed rounded-2xl flex items-center justify-center transition-colors duration-200 hover:border-[var(--color-brand-magenta)]"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
              >
                <svg
                  className="w-10 h-10 lg:w-16 lg:h-16"
                  style={{ color: "var(--color-foreground-muted)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-sm lg:text-base">Upload an image to get started</p>
              <p className="text-xs mt-2 hidden sm:block">Click anywhere or drag and drop</p>
            </div>
          )}
        </div>

        {/* Timeline Strip */}
        {frames.length > 0 && (
          <div
            className="h-28 lg:h-36 border-t border-white/10 p-3 lg:p-4 flex-shrink-0"
            style={{ background: "var(--color-background-offset)" }}
          >
            <div className="flex items-center gap-2 mb-2 lg:mb-3">
              <span className="eyebrow">Timeline</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-foreground-muted)" }}
              >
                ({frames.length} frame{frames.length !== 1 ? "s" : ""})
              </span>
              <span
                className="text-xs ml-2 hidden md:inline"
                style={{ color: "var(--color-foreground-muted)" }}
              >
                Drag to reorder, click X to remove
              </span>
            </div>
            <div className="flex gap-2 lg:gap-3 overflow-x-auto pb-2">
              {frames.map((frame, index) => (
                <div
                  key={frame.id}
                  draggable
                  onDragStart={() => handleTimelineDragStart(index)}
                  onDragOver={(e) => handleTimelineDragOver(e, index)}
                  onDrop={(e) => handleTimelineDrop(e, index)}
                  onDragEnd={handleTimelineDragEnd}
                  className={clsx(
                    "relative flex-shrink-0 group cursor-grab active:cursor-grabbing transition-all duration-200",
                    timelineDragOverIndex === index && "scale-105",
                    timelineDragIndex === index && "opacity-50"
                  )}
                >
                  <div
                    className={clsx(
                      "w-14 h-14 lg:w-20 lg:h-20 rounded-lg overflow-hidden transition-all duration-200",
                      timelineDragOverIndex === index
                        ? "ring-2 ring-[var(--color-brand-magenta)]"
                        : "ring-1 ring-white/10"
                    )}
                  >
                    <img
                      src={frame.dataUrl}
                      alt={`Frame ${index + 1}`}
                      className="w-full h-full object-cover"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                  <span
                    className="absolute bottom-1.5 left-1.5 text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ background: "rgba(0,0,0,0.7)" }}
                  >
                    {index + 1}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFrame(frame.id);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    style={{ background: "var(--color-brand-rose)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* GIF Preview Modal */}
      {showGifPreview && gifPreviewUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-8"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={closePreview}
        >
          <div
            className="card max-w-4xl max-h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--color-foreground-light)" }}
              >
                GIF Preview
              </h2>
              <button
                onClick={closePreview}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors duration-200"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <img
                src={gifPreviewUrl}
                alt="GIF Preview"
                className="max-w-full max-h-[60vh] mx-auto rounded-lg"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3 justify-end">
              <button
                onClick={closePreview}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Close
              </button>
              <button
                onClick={() => {
                  downloadGif(gifPreviewUrl);
                  closePreview();
                }}
                className="px-4 py-2 text-sm rounded-lg font-semibold transition-all duration-200"
                style={{ background: "var(--color-brand-sky)", color: "white" }}
              >
                Download GIF
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
