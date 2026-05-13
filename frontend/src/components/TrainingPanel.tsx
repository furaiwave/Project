import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Upload, Play, Loader2, CheckCircle2, AlertCircle, Download, Cpu, RotateCcw,
} from 'lucide-react'

import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Separator } from './ui/separator'

import {
    uploadDataset, startTraining, getJob, weightsUrl, activateModel,
    type TrainJob, type TrainStatus,
} from '../api/training'

type Phase =
    | { kind: 'idle' }
    | { kind: 'uploading'; progress: number; fileName: string }
    | { kind: 'uploaded'; datasetId: string; fileName: string }
    | { kind: 'starting'; datasetId: string }
    | { kind: 'tracking'; job: TrainJob }
    | { kind: 'error'; message: string }

const STATUS_BADGE: Record<TrainStatus, React.ComponentProps<typeof Badge>['variant']> = {
    queued: 'secondary',
    running: 'secondary',
    completed: 'default',
    failed: 'destructive',
}

const STATUS_LABEL: Record<TrainStatus, string> = {
    queued: 'У черзі',
    running: 'Триває',
    completed: 'Готово',
    failed: 'Помилка',
}

export const TrainingPanel: React.FC = () => {
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
    const [epochs, setEpochs] = useState(50)
    const [imgSize, setImgSize] = useState(640)
    const [baseModel, setBaseModel] = useState('yolov8n.pt')
    const [activated, setActivated] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const pollRef = useRef<number | null>(null)

    const stopPolling = useCallback(() => {
        if (pollRef.current !== null) {
            window.clearInterval(pollRef.current)
            pollRef.current = null
        }
    }, [])

    useEffect(() => () => stopPolling(), [stopPolling])

    const startPolling = useCallback((jobId: string) => {
        stopPolling()
        pollRef.current = window.setInterval(async () => {
            try {
                const job = await getJob(jobId)
                setPhase({ kind: 'tracking', job })
                if (job.status === 'completed' || job.status === 'failed') {
                    stopPolling()
                }
            } catch (err) {
                stopPolling()
                setPhase({ kind: 'error', message: (err as Error).message })
            }
        }, 1500)
    }, [stopPolling])

    const handleFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.zip')) {
            setPhase({ kind: 'error', message: 'Датасет має бути .zip архівом' })
            return
        }
        setPhase({ kind: 'uploading', progress: 0, fileName: file.name })
        try {
            const { dataset_id } = await uploadDataset(file, (pct) => {
                setPhase({ kind: 'uploading', progress: pct, fileName: file.name })
            })
            setPhase({ kind: 'uploaded', datasetId: dataset_id, fileName: file.name })
        } catch (err) {
            setPhase({ kind: 'error', message: (err as Error).message })
        }
    }, [])

    const handleStart = useCallback(async () => {
        if (phase.kind !== 'uploaded') return
        setPhase({ kind: 'starting', datasetId: phase.datasetId })
        setActivated(false)
        try {
            const job = await startTraining({
                dataset_id: phase.datasetId,
                epochs,
                img_size: imgSize,
                base_model: baseModel,
            })
            setPhase({ kind: 'tracking', job })
            startPolling(job.job_id)
        } catch (err) {
            setPhase({ kind: 'error', message: (err as Error).message })
        }
    }, [phase, epochs, imgSize, baseModel, startPolling])

    const handleActivate = useCallback(async () => {
        if (phase.kind !== 'tracking' || phase.job.status !== 'completed') return
        try {
            await activateModel(phase.job.job_id)
            setActivated(true)
        } catch (err) {
            setPhase({ kind: 'error', message: (err as Error).message })
        }
    }, [phase])

    const handleReset = useCallback(() => {
        stopPolling()
        setPhase({ kind: 'idle' })
        setActivated(false)
    }, [stopPolling])

    const job = phase.kind === 'tracking' ? phase.job : null
    const trainPct = job && job.status === 'running'
        ? Math.min(100, Math.round((job.current_epoch / Math.max(1, job.epochs)) * 100))
        : null

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    Тренування моделі
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

                {/* Step 1: dataset */}
                <section className="space-y-2">
                    <p className="text-xs font-medium">1. Датасет (.zip у форматі YOLO)</p>

                    {phase.kind === 'idle' || phase.kind === 'error' ? (
                        <div
                            onClick={() => inputRef.current?.click()}
                            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
                        >
                            <div className="rounded-full bg-muted p-2">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium">Завантажити архів</p>
                            <p className="text-xs text-muted-foreground">
                                images/train, labels/train, data.yaml
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-mono truncate">
                                    {phase.kind === 'uploading' || phase.kind === 'uploaded'
                                        ? phase.fileName
                                        : `dataset:${(phase.kind === 'tracking' ? phase.job.dataset_id : phase.kind === 'starting' ? phase.datasetId : '').slice(0, 8)}`}
                                </span>
                                {phase.kind === 'uploading' && (
                                    <span className="text-muted-foreground">{phase.progress}%</span>
                                )}
                            </div>
                            {phase.kind === 'uploading' && (
                                <Progress value={phase.progress} className="h-1.5" />
                            )}
                            {phase.kind === 'uploaded' && (
                                <Badge variant="secondary" className="gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Готово до тренування
                                </Badge>
                            )}
                        </div>
                    )}

                    <input
                        ref={inputRef}
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleFile(f)
                            e.target.value = ''
                        }}
                    />
                </section>

                <Separator />

                {/* Step 2: params */}
                <section className="space-y-2">
                    <p className="text-xs font-medium">2. Параметри</p>
                    <div className="grid grid-cols-3 gap-2">
                        <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Епохи</span>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={epochs}
                                onChange={(e) => setEpochs(Number(e.target.value) || 1)}
                                disabled={phase.kind === 'tracking' && phase.job.status === 'running'}
                                className="w-full h-8 rounded-none border border-input bg-background px-2 text-xs"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Img size</span>
                            <input
                                type="number"
                                min={64}
                                max={2048}
                                step={32}
                                value={imgSize}
                                onChange={(e) => setImgSize(Number(e.target.value) || 640)}
                                disabled={phase.kind === 'tracking' && phase.job.status === 'running'}
                                className="w-full h-8 rounded-none border border-input bg-background px-2 text-xs"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Base model</span>
                            <select
                                value={baseModel}
                                onChange={(e) => setBaseModel(e.target.value)}
                                disabled={phase.kind === 'tracking' && phase.job.status === 'running'}
                                className="w-full h-8 rounded-none border border-input bg-background px-2 text-xs"
                            >
                                <option value="yolov8n.pt">yolov8n (nano)</option>
                                <option value="yolov8s.pt">yolov8s (small)</option>
                                <option value="yolov8m.pt">yolov8m (medium)</option>
                                <option value="yolov8l.pt">yolov8l (large)</option>
                            </select>
                        </label>
                    </div>
                </section>

                <Separator />

                {/* Step 3: action */}
                <section className="space-y-3">
                    <p className="text-xs font-medium">3. Запуск</p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={handleStart}
                            disabled={phase.kind !== 'uploaded'}
                            className="gap-2"
                        >
                            <Play className="h-4 w-4" />
                            Почати тренування
                        </Button>
                        {(phase.kind === 'uploaded' || phase.kind === 'error' ||
                            (phase.kind === 'tracking' && phase.job.status !== 'running')) && (
                            <Button variant="outline" onClick={handleReset} className="gap-2">
                                <RotateCcw className="h-4 w-4" />
                                Скинути
                            </Button>
                        )}
                    </div>
                </section>

                {/* Status */}
                {job && (
                    <>
                        <Separator />
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">Статус</p>
                                <Badge variant={STATUS_BADGE[job.status]} className="gap-1.5">
                                    {job.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {job.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                                    {job.status === 'failed' && <AlertCircle className="h-3 w-3" />}
                                    {STATUS_LABEL[job.status]}
                                </Badge>
                            </div>

                            {job.status === 'running' && (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Епоха {job.current_epoch} / {job.epochs}</span>
                                        <span>{trainPct}%</span>
                                    </div>
                                    <Progress value={trainPct ?? 0} className="h-1.5" />
                                </div>
                            )}

                            <div className="text-xs text-muted-foreground font-mono break-all">
                                job: {job.job_id}
                            </div>

                            {job.metrics && Object.keys(job.metrics).length > 0 && (
                                <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                                    {Object.entries(job.metrics).slice(0, 6).map(([k, v]) => (
                                        <div key={k} className="flex justify-between font-mono">
                                            <span className="text-muted-foreground">{k}</span>
                                            <span>{Number(v).toFixed(4)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {job.error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Помилка тренування</AlertTitle>
                                    <AlertDescription className="font-mono break-all">
                                        {job.error}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {job.status === 'completed' && (
                                <div className="flex flex-wrap gap-2">
                                    <Button asChild variant="outline" className="gap-2">
                                        <a href={weightsUrl(job.job_id)} download={`${job.job_id}.pt`}>
                                            <Download className="h-4 w-4" />
                                            Скачати best.pt
                                        </a>
                                    </Button>
                                    <Button
                                        onClick={handleActivate}
                                        disabled={activated}
                                        variant={activated ? 'secondary' : 'default'}
                                        className="gap-2"
                                    >
                                        <Cpu className="h-4 w-4" />
                                        {activated ? 'Модель активна' : 'Активувати для інференсу'}
                                    </Button>
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* Top-level error */}
                {phase.kind === 'error' && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Помилка</AlertTitle>
                        <AlertDescription className="font-mono break-all">
                            {phase.message}
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    )
}
