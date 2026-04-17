import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import type { DetectionErrorCode } from "src/types/inference";

type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp'

const ALLOWED_MIMES = new Set<AllowedMime>(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const isAllowedMime = (mime: string): mime is AllowedMime =>
    ALLOWED_MIMES.has(mime as AllowedMime)

export interface ValidateImageFile {
    readonly buffer: Buffer
    readonly mimetype: AllowedMime
    readonly size: number
    readonly originalname: string
}

@Injectable()
export class ImageFilePipe implements PipeTransform<Express.Multer.File, ValidateImageFile> {
    transform(file: Express.Multer.File): ValidateImageFile {
        if(!file){
            throw new BadRequestException('INVALID_IMAGE', 'Файл не надано')
        }
        if(!isAllowedMime(file.mimetype)){
            throw new BadRequestException('INVALID_IMAGE', `Тип ${file.mimetype} не підтримується`)
        }
        if(file.size > MAX_BYTES){
            throw new BadRequestException('PAYLOAD_TOO_LARGE', 'Файл перевищує 10 MB')
        }

        return {
            buffer: file.buffer,
            mimetype: file.mimetype,
            size: file.size,
            originalname: file.originalname,
        }
    }

    private throw(code: DetectionErrorCode, detail: string): never {
        throw new BadRequestException({ code, detail })
    }
}