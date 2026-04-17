import { Controller, Post, UploadedFile, UseInterceptors, HttpCode, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody, ApiTags } from '@nestjs/swagger';
import { DetectionService } from './detection.service';
import { ImageFilePipe, type ValidateImageFile } from 'src/pipes/image-file.pipe';
import { DetectionResponseDto } from 'src/dto/entity/detect.dto';
import { isDetectionSuccess, type DetectionResult } from 'src/types/inference';
import { DetectionException } from 'src/exceptions/detection.exception';

// InferServiceResponse витягує тип з сервісу через infer в return-позиції
import type { InferServiceResponce } from 'src/types/inference';

type ControllerResponse = InferServiceResponce<DetectionService, 'detect'>

@ApiTags('detection')
@Controller('detection')
export class DetectionController {
    constructor(private readonly detectionService: DetectionService) {}

    @Post('detect')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('image'))
    @ApiBody({
        description: 'Зображення для розпізнавання (JPEG/PNG/WebP, до 10 MB)' 
    })
    async detect(
        @UploadedFile(ImageFilePipe) file: ValidateImageFile,
    ): Promise<DetectionResponseDto>{
        // result: DetectionResult<DetectionResponseDto> — дискримінований union
        const result: ControllerResponse = await this.detectionService.detect(file)

        // isDetectionSuccess — type guard, звужує union без as
        if(!isDetectionSuccess(result)){
            // result тут: { status: 'error', code: DetectionErrorCode, message: string }
            // Компілятор знає точний shape завдяки discriminated union
            throw new DetectionException(result.code, result.message)
        }

        // result тут: { status: 'success', data: DetectionResponseDto }
        return result.data
    }
}
