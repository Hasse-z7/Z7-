'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Eraser, RotateCcw, Download, ImageIcon, Video, Minus, Plus, Brush, MousePointer2, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type MediaType = 'image' | 'video';

export default function EraserPage() {
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [resultUrl, setResultUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser_tool'>('brush');
  const [hasMask, setHasMask] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Init mask canvas
  useEffect(() => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    setOriginalFile(file);
    setResultUrl('');
    setHasMask(false);

    if (mediaType === 'image') {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        if (canvasRef.current && maskCanvasRef.current) {
          canvasRef.current.width = img.width;
          canvasRef.current.height = img.height;
          maskCanvasRef.current.width = img.width;
          maskCanvasRef.current.height = img.height;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          const maskCtx = maskCanvasRef.current.getContext('2d');
          if (maskCtx) {
            maskCtx.clearRect(0, 0, img.width, img.height);
          }
        }
      };
      img.src = url;
    }

    e.target.value = '';
  }, [mediaType]);

  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawOnMask = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'brush') {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }, [brushSize, tool]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !maskCanvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(maskCanvas, 0, 0);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const point = getCanvasPoint(e);
    drawOnMask(point.x, point.y);
    renderCanvas();
    setHasMask(true);
  }, [getCanvasPoint, drawOnMask, renderCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    drawOnMask(point.x, point.y);
    renderCanvas();
  }, [isDrawing, getCanvasPoint, drawOnMask, renderCanvas]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    renderCanvas();
    setHasMask(false);
  }, [renderCanvas]);

  const handleProcess = useCallback(async () => {
    if (!originalFile || !hasMask) return;
    setIsProcessing(true);
    setResultUrl('');

    try {
      if (mediaType === 'image') {
        // Get mask as blob
        const maskCanvas = maskCanvasRef.current;
        if (!maskCanvas) return;

        const maskBlob = await new Promise<Blob>((resolve) => {
          maskCanvas.toBlob((blob) => resolve(blob!), 'image/png');
        });

        const formData = new FormData();
        formData.append('image', originalFile);
        formData.append('mask', maskBlob, 'mask.png');

        const res = await fetch('/api/ai/eraser', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '处理失败');
        }

        const blob = await res.blob();
        setResultUrl(URL.createObjectURL(blob));
      } else {
        // Video processing
        const formData = new FormData();
        formData.append('video', originalFile);

        const res = await fetch('/api/ai/eraser/video', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '处理失败');
        }

        const data = await res.json();
        if (data.frames) {
          setResultUrl(data.frames[0] || '');
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '处理失败';
      alert(message);
    } finally {
      setIsProcessing(false);
    }
  }, [originalFile, hasMask, mediaType]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = 'eraser_result.png';
    a.click();
  }, [resultUrl]);

  const handleReset = useCallback(() => {
    setOriginalUrl('');
    setOriginalFile(null);
    setResultUrl('');
    setHasMask(false);
    clearMask();
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [clearMask]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Eraser className="w-6 h-6 text-cyan-500" />
            AI画面擦除
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            标注水印/字幕区域，AI智能填充修复画面
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Upload & Canvas */}
          <div className="space-y-4">
            {/* Media type toggle */}
            <div className="flex gap-2">
              <Button
                variant={mediaType === 'image' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setMediaType('image'); handleReset(); }}
                className={mediaType === 'image' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}
              >
                <ImageIcon className="w-4 h-4 mr-1" />
                图片擦除
              </Button>
              <Button
                variant={mediaType === 'video' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setMediaType('video'); handleReset(); }}
                className={mediaType === 'video' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}
              >
                <Video className="w-4 h-4 mr-1" />
                视频擦除
              </Button>
            </div>

            {/* Upload area */}
            {!originalUrl && (
              <Card className="border-dashed border-2 border-[var(--border)] p-8 flex flex-col items-center justify-center min-h-[400px] cursor-pointer hover:border-cyan-500/50 transition-colors"
                onClick={() => {
                  if (mediaType === 'image') fileInputRef.current?.click();
                  else videoInputRef.current?.click();
                }}
              >
                <Upload className="w-12 h-12 text-[var(--text-secondary)] mb-3" />
                <p className="text-[var(--text-primary)] font-medium">
                  {mediaType === 'image' ? '点击上传图片' : '点击上传视频'}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {mediaType === 'image' ? '支持 JPG/PNG/WebP，最大 20MB' : '支持 MP4/MOV，最大 200MB'}
                </p>
              </Card>
            )}

            {/* Canvas area */}
            {originalUrl && mediaType === 'image' && (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-black/20">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto cursor-crosshair"
                    style={{ maxHeight: '500px', objectFit: 'contain' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--card-bg)] border border-[var(--border)]">
                  <div className="flex gap-1">
                    <Button
                      variant={tool === 'brush' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTool('brush')}
                      className={tool === 'brush' ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                      <Brush className="w-4 h-4 mr-1" />
                      标记
                    </Button>
                    <Button
                      variant={tool === 'eraser_tool' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTool('eraser_tool')}
                    >
                      <MousePointer2 className="w-4 h-4 mr-1" />
                      擦除标记
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-[var(--text-secondary)]">笔刷</span>
                    <Slider
                      value={[brushSize]}
                      min={5}
                      max={80}
                      step={1}
                      onValueChange={([v]: number[]) => setBrushSize(v)}
                      className="w-24"
                    />
                    <span className="text-xs text-[var(--text-secondary)] w-6">{brushSize}</span>
                  </div>

                  <Button variant="outline" size="sm" onClick={clearMask}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    清除标记
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleProcess}
                    disabled={isProcessing || !hasMask}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        AI修复中...
                      </>
                    ) : (
                      <>
                        <Eraser className="w-4 h-4 mr-2" />
                        开始擦除修复
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    重新上传
                  </Button>
                </div>
              </div>
            )}

            {/* Video upload area */}
            {originalUrl && mediaType === 'video' && (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-black/20">
                  <video
                    src={originalUrl}
                    controls
                    className="w-full max-h-[400px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        视频处理中...
                      </>
                    ) : (
                      <>
                        <Eraser className="w-4 h-4 mr-2" />
                        自动检测并擦除水印
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    重新上传
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            <Card className="p-6 min-h-[400px] flex flex-col items-center justify-center border border-[var(--border)]">
              {resultUrl ? (
                <div className="w-full space-y-4">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">修复结果</h3>
                  {mediaType === 'image' ? (
                    <img src={resultUrl} alt="result" className="w-full rounded-lg" />
                  ) : (
                    <video src={resultUrl} controls className="w-full rounded-lg" />
                  )}
                  <Button onClick={handleDownload} className="w-full bg-cyan-600 hover:bg-cyan-700">
                    <Download className="w-4 h-4 mr-2" />
                    下载结果
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Eraser className="w-16 h-16 text-[var(--text-secondary)] mx-auto mb-3 opacity-30" />
                  <p className="text-[var(--text-secondary)]">
                    {originalUrl ? '标记水印区域后点击擦除' : '上传图片后标记水印区域'}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    支持去除水印、字幕、Logo、半透明标识
                  </p>
                </div>
              )}
            </Card>

            {/* Tips */}
            <Card className="p-4 border border-[var(--border)]">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">使用说明</h4>
              <ul className="text-xs text-[var(--text-secondary)] space-y-1.5">
                <li>1. 上传需要处理的图片或视频</li>
                <li>2. 用红色画笔标记需要擦除的区域（水印、字幕、Logo等）</li>
                <li>3. 点击「开始擦除修复」，AI将智能填充标记区域</li>
                <li>4. 视频模式会自动拆分关键帧并逐帧处理</li>
                <li>5. 处理完成后可下载结果</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
