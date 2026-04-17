import { useState, useCallback, useRef } from "react";
import { detectedObjects } from "../api/detection";
import type { UploadState, DetectionErrorCode } from "../types/detection";

// Повертає точний тип стану + екшени 
export interface UseDetectionReturn { 
    readonly state: UploadState
    readonly run: (file: File) => Promise<void>
    readonly reset: () => void
    readonly preview: string | null
}

const IDLE: UploadState = { phase: 'idle' }

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp'
const ALLOWED = new Set<AllowedMime>(['image/jpeg', 'image/png', 'image/webp'])
const isAllowed = (m: string): m is AllowedMime => ALLOWED.has(m as AllowedMime)
const MAX_BYTES = 10 * 1024 * 1024

const validateFile = (file: File): DetectionErrorCode | null => {
    if(!isAllowed(file.type)) return 'INVALID_IMAGE'
    if(file.size > MAX_BYTES) return 'PAYLOAD_TOO_LARGE'
    return null
}

export const useDetection = (): UseDetectionReturn => {
    const[state, setState] = useState<UploadState>(IDLE)
    const[preview, setPreview] = useState<string | null>(null)
    const prevUrl = useRef<string | null>(null)

    const run = useCallback(async(file: File): Promise<void> => {

        // Клієнтська валідація до запиту
        const validationError = validateFile(file)

        if(validationError){
            setState({
                phase: 'error',
                code: validationError,
                message: 'Файл не пройшов валідацію'
            })
            return
        }

        // Revoke попередній URL щоб не було memory leak
        if(prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        const url = URL.createObjectURL(file)
        prevUrl.current = url
        setPreview(url)

        setState({ phase: 'uploading', progress: 0 })

        const result = await detectedObjects(file, (progress) => {
            setState({ phase: 'uploading', progress })
        })

        // Після завантаження — processing (модель думає)
        setState({ phase: 'processing' })

        if(result.status === 'success'){
            setState({ phase: 'done', result })
        } else {
            setState({ phase: 'error', code: result.code, message: result.message })
        }

    }, [])

    const reset = useCallback((): void => {
        if(prevUrl.current) {
            URL.revokeObjectURL(prevUrl.current);
            prevUrl.current = null
        }
        setPreview(null);
        setState(IDLE)
    }, [])

    return { state, run, reset, preview} as const
}