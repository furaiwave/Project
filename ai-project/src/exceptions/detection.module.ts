import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DetectionService } from 'src/detection/detection.service';
import { DetectionController } from 'src/detection/detection.controller';

@Module({
  imports: [HttpModule],
  controllers: [DetectionController],
  providers: [DetectionService],
})
export class DetectionModule {}