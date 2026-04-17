import React, { useCallback, useRef, useState } from 'react';
import { Upload, RotateCcw, Cpu, Clock, Target, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Separator } from './components/ui/separator';
import { ScrollArea } from './components/ui/scroll-area';

import { BoundingBoxCanvas } from './components/CoundingBoxCanvas';
import { useDetection } from './hooks/useDetection';
import { isSuccess, isUploadDone, type DetectionErrorCode } from './types/detection';

//  Error messages 
const ERROR_MESSAGES: Record<DetectionErrorCode, string> = {
  INVALID_IMAGE:     'Невірний формат файлу. Підтримуються JPEG, PNG, WebP.',
  MODEL_UNAVAILABLE: 'Python-сервіс недоступний. Перевірте що він запущений.',
  INFERENCE_TIMEOUT: 'Час очікування вичерпано. Спробуйте менше зображення.',
  PAYLOAD_TOO_LARGE: 'Файл занадто великий. Максимум — 10 MB.',
  NETWORK_ERROR:     'Помилка мережі. Перевірте підключення до сервера.',
};

//  Confidence → Badge variant 
type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const confidenceToBadge = (conf: number): BadgeVariant => {
  if (conf >= 0.8) return 'default';
  if (conf >= 0.5) return 'secondary';
  return 'outline';
};

//  Main App 
const App: React.FC = () => {
  const { state, run, reset, preview } = useDetection();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isBusy = state.phase === 'uploading' || state.phase === 'processing';
  const done   = isUploadDone(state) && isSuccess(state.result) ? state.result : null;

  const handleFile = useCallback((file: File) => { run(file); }, [run]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (isBusy) return;
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [isBusy, handleFile],
  );

  const uploadProgress =
    state.phase === 'uploading'
      ? (state as Extract<typeof state, { phase: 'uploading' }>).progress
      : null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">

        {/*  Header  */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Object Detection</h1>
            <p className="text-sm text-muted-foreground">YOLOv8 · NestJS · FastAPI</p>
          </div>
          <Badge
            variant={
              state.phase === 'done'  ? 'default'     :
              state.phase === 'error' ? 'destructive' : 'secondary'
            }
            className="gap-1.5"
          >
            {isBusy                  && <Loader2      className="h-3 w-3 animate-spin" />}
            {state.phase === 'done'  && <CheckCircle2 className="h-3 w-3" />}
            {state.phase === 'error' && <AlertCircle  className="h-3 w-3" />}
            {{ idle: 'Очікування', uploading: 'Завантаження', processing: 'Обробка', done: 'Готово', error: 'Помилка' }[state.phase]}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/*  Left col: image  */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Зображення
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!preview ? (
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => !isBusy && inputRef.current?.click()}
                    className={[
                      'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-16 text-center cursor-pointer transition-colors',
                      isDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50',
                      isBusy ? 'pointer-events-none opacity-50' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="rounded-full bg-muted p-3">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Перетягніть зображення сюди</p>
                      <p className="text-xs text-muted-foreground mt-1">або клікніть для вибору</p>
                    </div>
                    <p className="text-xs text-muted-foreground">JPEG · PNG · WebP · до 10 MB</p>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-lg border bg-muted/20">
                    <BoundingBoxCanvas
                      src={preview}
                      {...(done ? { ready: true, objects: done.objects } : { ready: false })}
                    />
                    {isBusy && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm rounded-lg">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">
                          {state.phase === 'uploading' ? 'Завантаження...' : 'Модель аналізує...'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                />

                {/* Progress */}
                {uploadProgress !== null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Завантаження файлу</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Error */}
            {state.phase === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{state.code}</AlertTitle>
                <AlertDescription>{ERROR_MESSAGES[state.code]}</AlertDescription>
              </Alert>
            )}

            {(preview || state.phase === 'error') && (
              <Button variant="outline" size="sm" onClick={reset} disabled={isBusy} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Завантажити інше зображення
              </Button>
            )}
          </div>

          {/* ── Right col: results ── */}
          <div className="space-y-4">

            {/* Stat cards */}
            {(['objects', 'ms', 'conf'] as const).map((key) => {
              const iconMap = { objects: Target, ms: Clock, conf: Cpu } as const;
              const labelMap = { objects: "Об'єктів", ms: 'Inference', conf: 'Avg conf' } as const;
              const valueMap = {
                objects: done?.objects.length ?? '—',
                ms:      done ? `${done.inferenceMs.toFixed(0)}ms` : '—',
                conf:    done && done.objects.length > 0
                  ? `${Math.round(done.objects.reduce((a, o) => a + o.confidence, 0) / done.objects.length * 100)}%`
                  : '—',
              } as const;
              const Icon = iconMap[key];
              return (
                <Card key={key}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{labelMap[key]}</span>
                    </div>
                    <p className="mt-1 text-2xl font-semibold">{valueMap[key]}</p>
                  </CardContent>
                </Card>
              );
            })}

            {/* Objects list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Знайдені об'єкти</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!done && (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">
                    Результати з'являться після аналізу
                  </p>
                )}
                {done && done.objects.length === 0 && (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">Об'єктів не знайдено</p>
                )}
                {done && done.objects.length > 0 && (
                  <ScrollArea className="h-72">
                    <div className="px-6 pb-4 space-y-0">
                      {done.objects.map((obj, i) => {
                        const pct = Math.round(obj.confidence * 100);
                        return (
                          <React.Fragment key={i}>
                            {i > 0 && <Separator className="my-3" />}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                                  <span className="text-sm font-medium capitalize">{obj.label}</span>
                                </div>
                                <Badge variant={confidenceToBadge(obj.confidence)}>{pct}%</Badge>
                              </div>
                              <Progress value={pct} className="h-1" />
                              <p className="text-xs text-muted-foreground font-mono pl-7">
                                [{obj.bbox.map((v) => Math.round(v)).join(', ')}]
                              </p>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Job meta */}
            {done && (
              <Card>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Job ID</p>
                  <p className="text-xs font-mono break-all leading-relaxed">{done.jobId}</p>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    {new Date(done.processedAt).toLocaleString('uk-UA')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;