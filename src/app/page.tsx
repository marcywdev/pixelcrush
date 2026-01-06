"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { processImage, type PaletteMode } from "@/lib/dither";
import clsx from "clsx";
import GIF from "gif.js-upgrade";

// Default color palette
const DEFAULT_PALETTE = ["#1a0f5a", "#e939f1", "#349cfc", "#ff9a57", "#ffffff"];

// Frame type for GIF timeline
interface Frame {
  id: string;
  dataUrl: string;
  canvas: HTMLCanvasElement;
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

  // GIF timeline state
  const [frames, setFrames] = useState<Frame[]>([]);
  const [frameDelay, setFrameDelay] = useState(500);
  const [isGeneratingGif, setIsGeneratingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [timelineDragIndex, setTimelineDragIndex] = useState<number | null>(null);
  const [timelineDragOverIndex, setTimelineDragOverIndex] = useState<number | null>(null);
  const [showGifPreview, setShowGifPreview] = useState(false);
  const [gifPreviewUrl, setGifPreviewUrl] = useState<string | null>(null);

  // Canvas refs
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Debounced values for live preview
  const debouncedPixelSize = useDebounce(pixelSize, 150);

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
        className="w-full lg:w-80 p-4 lg:p-5 overflow-y-auto flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10"
        style={{ background: "var(--color-background-offset)" }}
      >
        <h1
          className="text-xl font-medium mb-7"
          style={{
            color: "var(--color-foreground-light)",
            fontFamily: "var(--font-alt)",
          }}
        >
          pixelcrush
        </h1>

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

        {/* Color Palette */}
        <section className="mb-8">
          <h2 className="eyebrow mb-2">Color Palette</h2>
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
          <div className="flex gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-12 h-10 rounded-lg cursor-pointer"
            />
            <input
              type="text"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="input-field flex-1 px-3 py-2 text-sm"
              placeholder="#000000"
            />
            <button
              onClick={addColor}
              className="btn-primary px-3 py-1.5 text-xs"
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

        {/* Pixel Size */}
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

        {/* Algorithm Toggle */}
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

        {/* Download Button */}
        <button
          onClick={downloadImage}
          disabled={!sourceImage}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 mb-8"
          style={{
            background: sourceImage ? "var(--color-brand-sky)" : "var(--color-foreground-muted)",
            color: sourceImage ? "white" : "var(--color-background-offset)",
            cursor: sourceImage ? "pointer" : "not-allowed",
          }}
        >
          Download PNG
        </button>

        {/* GIF Timeline Section */}
        <section className="mb-6">
          <h2 className="eyebrow mb-2">GIF Creator</h2>
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
              Download
            </button>
          </div>
          <button
            onClick={clearFrames}
            disabled={frames.length === 0}
            className="btn-secondary w-full py-2 text-xs"
          >
            Clear All Frames
          </button>
        </section>
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
