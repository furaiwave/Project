import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as FormData from 'form-data'
import type { ValidateImageFile } from 'src/pipes/image-file.pipe';
import type { DetectionResponseDto, PythonInferenceResponse } from 'src/dto/entity/detect.dto';
import {
    toJobId, toConfidence, toPixel, toClassLabel, toImageId,
} from '../types/branded'
import type { DetectionResult } from 'src/types/inference';
import { v4 as uuid } from 'uuid' 

@Injectable()
export class DetectionService {
    private readonly logger = new Logger(DetectionService.name)
    private readonly pythonUrl = process.env['PYTHON_SERVICE_URL'] ?? 'http://127.0.0.1:8000'

    constructor(private readonly http: HttpService) {}

      // Повертає DetectionResult — контролер не може отримати "сирі" дані
    async detect(
        file: ValidateImageFile,
    ): Promise<DetectionResult<DetectionResponseDto>>{
        const imageId = toImageId(uuid())

        const form = new FormData()
        form.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
        })

        try{
            const { data } = await firstValueFrom(
                this.http.post<PythonInferenceResponse>(`${this.pythonUrl}/infer`, form, {
                    headers: form.getHeaders(),
                    timeout: 30_000,
                })
            )

            // Маппінг сирого Python-контракту → брендовані TS-типи
            const response: DetectionResponseDto = {
                jobId: toJobId(data.job_id),
                imageId,
                inferenceMs: data.inference_ms,
                processedAt: new Date().toISOString(),
                objects: data.objects.map((o) => ({
                    label:      toClassLabel(o.label),
                    confidence: toConfidence(o.confidence),
                              
                    // infer tuple — конвертуємо кожен елемент масиву в PixelCoord
                    bbox: [
                        toPixel(o.bbox[0]),
                        toPixel(o.bbox[1]),
                        toPixel(o.bbox[2]),
                        toPixel(o.bbox[3]),
                    ] as const
                }))
            }

            return { status: 'success', data: response, jobId: toJobId(data.job_id) }
        } catch(err){
            this.logger.error('Python inderence failed', err);

            // Якщо timeout — специфічний код
            if(err instanceof Error && err.message.includes('timeout')){
                return { status: 'error', message: err.message, code: 'INFERENCE_TIMEOUT' };
            }

            return {
                status: 'error',
                message: err instanceof Error ? err.message : 'Uknown errro',
                code: 'MODEL_UNAVAILABLE'
            }
        }
    }
}
